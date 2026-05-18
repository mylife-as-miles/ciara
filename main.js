const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { autoUpdater } = require("electron-updater");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell,
  dialog,
  nativeImage,
  systemPreferences,
  safeStorage,
} = require("electron");

function parseAcceleratorList(rawValue, fallback) {
  const source = rawValue || fallback.join(",");
  const values = [];
  let current = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const previous = source[i - 1];
    if ((char === "," && previous !== "+") || char === ";") {
      if (current.trim()) values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) values.push(current.trim());
  return values;
}

const HOTKEYS = parseAcceleratorList(
  process.env.LIQUID_HOTKEY,
  ["CommandOrControl+Shift+Space", "Alt+Space"]
);

/** Open settings (API keys). Comma-separated list allowed. */
const SETTINGS_HOTKEYS = parseAcceleratorList(
  process.env.CIARA_SETTINGS_HOTKEY,
  ["CommandOrControl+,"]
);

const WINDOW_LEVEL = "screen-saver";
const APP_USER_MODEL_ID = "com.startrz.ciara";

app.setName("CIARA");

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

// ── Path resolution (dev vs packaged) ──
const IS_PACKAGED = app.isPackaged;
const APP_ROOT = IS_PACKAGED
  ? path.join(process.resourcesPath)
  : __dirname;
const BACKEND_ROOT = IS_PACKAGED
  ? path.join(APP_ROOT, "backend")
  : path.join(__dirname, "backend");

let mainWindow;
let lastWakeAt = 0;
let pythonProcess = null;
let ownsPythonProcess = false;
let onboardingWindowMode = false;
let tray = null;
let isQuitting = false;
let backendStartPromise = null;
let backendSetupFailureUntil = 0;
let lastBackendStartDetail = "";

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

const BACKEND_WS_URL = process.env.CIARA_BACKEND_WS_URL || "ws://127.0.0.1:8000/ws";
const BACKEND_HOST = process.env.CIARA_BACKEND_HOST || "127.0.0.1";
const BACKEND_PORT = Number(process.env.CIARA_BACKEND_PORT || "8000");
const BRIDGE_PORT = Number(process.env.CIARA_BROWSER_BRIDGE_PORT || "8765");
const BACKEND_READY_SENTINEL = "[Backend] READY";
const BUNDLED_PYTHON_VERSION = "3.12";

// Venv lives in userData for packaged builds (writable, survives app updates)
const getVenvRoot = () => IS_PACKAGED
  ? path.join(app.getPath("userData"), "venv")
  : path.join(__dirname, "venv");

function getAppIconPath() {
  if (process.platform === "win32") {
    const packagedIco = path.join(process.resourcesPath || "", "build", "icon.ico");
    if (IS_PACKAGED && fs.existsSync(packagedIco)) return packagedIco;
    return path.join(__dirname, "build", "icon.ico");
  }
  return path.join(__dirname, "renderer", "assets", "icon.png");
}

function getAppIconImage() {
  const iconPath = getAppIconPath();
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? iconPath : image;
}

function getTrayIconImage() {
  const image = nativeImage.createFromPath(getAppIconPath());
  if (image.isEmpty()) return image;
  const size = process.platform === "darwin" ? 18 : 16;
  return image.resize({ width: size, height: size });
}

// Bundled Picovoice key — enables the "Hey CIARA" wake word out of the box.
// Users can replace this with their own key from console.picovoice.ai
const BUNDLED_PICOVOICE_KEY = "lDvqq7J641WbqdzMsPCdLlawELhfGZOGhaceFzl3ZYYYzeeuXq55YA==";

// ── Credential storage ──
const CRED_FILE = path.join(app.getPath("userData"), "credentials.enc");

/**
 * Check whether we have *usable* saved credentials (file exists,
 * decrypts successfully, and contains a Gemini API key).
 * Returns true only when the user can skip onboarding.
 */
function hasUsableCredentials() {
  if (!fs.existsSync(CRED_FILE)) return false;
  const creds = loadCredentials();          // returns null on any failure
  if (!creds) return false;
  if (creds.llm_provider === "ollama") return !!creds.local_model;
  if (creds.llm_provider === "openai-compatible-local") {
    return !!(creds.local_base_url && creds.local_model);
  }
  return !!creds.gemini_api_key;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canReachPort(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host: BACKEND_HOST, port });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function canReachBackend(timeoutMs = 1500) {
  const [backendReady, bridgeReady] = await Promise.all([
    canReachPort(BACKEND_PORT, timeoutMs),
    canReachPort(BRIDGE_PORT, timeoutMs)
  ]);
  return backendReady && bridgeReady;
}

/** Path to the interpreter inside the bundled venv (platform-specific). */
function getVenvPythonPath(venvRoot) {
  if (process.platform === "win32") {
    const scripts = path.join(venvRoot, "Scripts");
    for (const name of ["python.exe", "python3.exe"]) {
      const p = path.join(scripts, name);
      if (fs.existsSync(p)) return p;
    }
    return path.join(scripts, "python.exe");
  }
  return path.join(venvRoot, "bin", "python3");
}

function getDependencyMarkerPath(venvRoot) {
  return path.join(venvRoot, ".ciara-deps.json");
}

function hashFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function getPythonVersion(pythonPath) {
  if (!fs.existsSync(pythonPath)) return "";
  const r = spawnSync(
    pythonPath,
    ["-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}')"],
    { encoding: "utf8", windowsHide: true }
  );
  return r.status === 0 ? String(r.stdout || "").trim() : "";
}

function parsePythonVersion(version) {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || "0"),
  };
}

function isSupportedPythonVersion(version) {
  const parsed = parsePythonVersion(version);
  if (!parsed || parsed.major !== 3) return false;
  return parsed.minor >= 10 && parsed.minor <= 13;
}

function getPythonWheelTag(version) {
  const parsed = parsePythonVersion(version);
  if (!parsed || parsed.major !== 3) return "";
  return `py${parsed.major}${parsed.minor}`;
}

function getBundledPythonCandidates() {
  if (process.platform !== "win32") return [];
  const envPath = process.env.CIARA_BUNDLED_PYTHON;
  const roots = [
    IS_PACKAGED ? path.join(APP_ROOT, "python", "win-x64") : path.join(__dirname, "build", "python", "win-x64"),
    IS_PACKAGED ? path.join(APP_ROOT, "python") : path.join(__dirname, "build", "python"),
  ];
  return [
    envPath,
    ...roots.flatMap((root) => [
      path.join(root, "python.exe"),
      path.join(root, "tools", "python.exe"),
    ]),
  ].filter(Boolean);
}

function getBundledPythonPath() {
  for (const candidate of getBundledPythonCandidates()) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const version = getPythonVersion(candidate);
    if (isSupportedPythonVersion(version)) return candidate;
    console.warn(`[Setup] Ignoring bundled Python ${candidate}; unsupported version ${version || "unknown"}`);
  }
  return "";
}

function getWheelhousePathForPython(pythonPath) {
  if (process.platform !== "win32") return "";
  const tag = getPythonWheelTag(getPythonVersion(pythonPath));
  if (!tag) return "";
  const base = IS_PACKAGED ? APP_ROOT : __dirname;
  const candidate = path.join(base, "wheelhouse", `win-x64-${tag}`);
  return fs.existsSync(candidate) ? candidate : "";
}

function depsAreFresh(venvRoot, venvPythonPath, requirementsPath) {
  const markerPath = getDependencyMarkerPath(venvRoot);
  if (!fs.existsSync(venvPythonPath) || !fs.existsSync(markerPath)) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    return marker.requirementsHash === hashFileIfExists(requirementsPath)
      && marker.platform === process.platform
      && marker.pythonVersion === getPythonVersion(venvPythonPath);
  } catch {
    return false;
  }
}

function writeDependencyMarker(venvRoot, venvPythonPath, requirementsPath) {
  try {
    fs.mkdirSync(venvRoot, { recursive: true });
    fs.writeFileSync(getDependencyMarkerPath(venvRoot), JSON.stringify({
      requirementsHash: hashFileIfExists(requirementsPath),
      platform: process.platform,
      pythonVersion: getPythonVersion(venvPythonPath),
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.warn("[Setup] Could not write dependency marker:", err);
  }
}

function sendSetupProgressLine(text) {
  const line = String(text).trim();
  if (!line) return;
  lastBackendStartDetail = line;
  process.stdout.write(`[Setup] ${line}\n`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("setup:progress", line);
  }
}

/** Windows fallback: find Python 3.10-3.13 on PATH (py launcher or python/python3). */
function findWindowsPython310() {
  const candidates = [
    ["py", ["-3.13"]],
    ["py", ["-3.12"]],
    ["py", ["-3.11"]],
    ["py", ["-3.10"]],
    ["py", ["-3"]],
    ["python3", []],
    ["python", []],
  ];
  for (const [cmd, prefix] of candidates) {
    const r = spawnSync(
      cmd,
      [...prefix, "-c", "import sys; print(f\"{sys.version_info[0]}.{sys.version_info[1]}\")"],
      { encoding: "utf8", windowsHide: true }
    );
    if (r.status !== 0 || !r.stdout) continue;
    if (isSupportedPythonVersion(r.stdout.trim())) {
      return { cmd, prefix };
    }
  }
  return null;
}

function summarizeCommandOutput(result, max = 900) {
  const combined = `${result.stderr || ""}\n${result.stdout || ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-14)
    .join("\n");
  return combined.slice(0, max);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      resolve({ status: 1, stdout, stderr: `${stderr}\n${err.message}` });
    });

    child.on("close", (code) => {
      resolve({ status: code ?? 1, stdout, stderr });
    });
  });
}

function runPip(venvPy, args, cwd, extraEnv = {}) {
  return runCommand(venvPy, [
      "-m",
      "pip",
      "--disable-pip-version-check",
      "--no-input",
      ...args,
    ],
    {
      cwd,
      env: {
        ...process.env,
        PIP_DISABLE_PIP_VERSION_CHECK: "1",
        PIP_NO_CACHE_DIR: "1",
        PIP_NO_INPUT: "1",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        ...extraEnv,
      },
    }
  );
}

async function installRequirementsWithRetry(venvPy, requirementsPath, cwd, wheelhousePath = "") {
  const offline = !!wheelhousePath;
  const common = [
    "install",
    "--quiet",
    "--prefer-binary",
    "--no-cache-dir",
    ...(offline ? ["--no-index", "--find-links", wheelhousePath] : []),
    "-r",
    requirementsPath,
  ];
  let result = await runPip(venvPy, common, cwd);
  if (result.status === 0) return result;

  sendSetupProgressLine(`Dependency install failed, retrying ${offline ? "from bundled wheelhouse" : "with a clean pip cache"}: ${summarizeCommandOutput(result, 500)}`);
  await runPip(venvPy, ["cache", "purge"], cwd);
  result = await runPip(venvPy, common, cwd);
  return result;
}

/**
 * Windows: create/upgrade venv with `python -m venv` + pip (no bash required).
 * macOS/Linux: still uses setup.sh under bash.
 */
async function runSetupWindows(venvRoot) {
  const requirementsPath = path.join(BACKEND_ROOT, "requirements.txt");
  const projectRoot = IS_PACKAGED ? APP_ROOT : __dirname;
  const venvPy = getVenvPythonPath(venvRoot);
  let wheelhousePath = "";

  if (fs.existsSync(venvPy)) {
    const venvVersion = getPythonVersion(venvPy);
    wheelhousePath = getWheelhousePathForPython(venvPy);
    if (!isSupportedPythonVersion(venvVersion)) {
      sendSetupProgressLine(
        `Existing Python venv uses ${venvVersion || "an unsupported Python"}; recreating with Python 3.10-3.13…`
      );
      try {
        await fs.promises.rm(venvRoot, { recursive: true, force: true });
      } catch (err) {
        sendSetupProgressLine(`Could not reset unsupported venv at ${venvRoot}: ${err.message}`);
        return false;
      }
    }
  }

  if (fs.existsSync(venvPy)) {
    sendSetupProgressLine(wheelhousePath
      ? `Virtual environment found — installing dependencies from bundled wheelhouse (${path.basename(wheelhousePath)})…`
      : "Virtual environment found — upgrading packages…"
    );
    let r = { status: 0 };
    if (!wheelhousePath) {
      r = await runPip(venvPy, ["install", "--quiet", "--upgrade", "--no-cache-dir", "pip", "setuptools", "wheel"], projectRoot);
      if (r.status !== 0) {
        sendSetupProgressLine(`pip upgrade failed: ${summarizeCommandOutput(r, 500)}`);
        return false;
      }
    }
    if (fs.existsSync(requirementsPath)) {
      r = await installRequirementsWithRetry(venvPy, requirementsPath, projectRoot, wheelhousePath);
      if (r.status !== 0) {
        sendSetupProgressLine(`Dependency install failed: ${summarizeCommandOutput(r, 900)}`);
        return false;
      }
    }
    writeDependencyMarker(venvRoot, venvPy, requirementsPath);
    sendSetupProgressLine("Setup complete!");
    return true;
  }

  const bundledPythonPath = getBundledPythonPath();
  const found = bundledPythonPath ? null : findWindowsPython310();
  if (!bundledPythonPath && !found) {
    sendSetupProgressLine(
      "Python runtime not found. CIARA should include bundled Python 3.12; rebuild with npm run prepare:python:win, or install Python 3.13/3.12 with Add python.exe to PATH enabled."
    );
    console.error("[Setup] No bundled Python and no supported Python 3.10-3.13 found on Windows PATH");
    return false;
  }

  const createCommand = bundledPythonPath || found.cmd;
  const createArgs = bundledPythonPath ? ["-m", "venv", venvRoot] : [...found.prefix, "-m", "venv", venvRoot];
  const sourceLabel = bundledPythonPath
    ? `bundled Python ${getPythonVersion(bundledPythonPath)}`
    : `${found.cmd} ${found.prefix.join(" ")}`;

  sendSetupProgressLine(`Using ${sourceLabel} — creating virtual environment…`);
  let r = await runCommand(createCommand, createArgs, {
    cwd: projectRoot,
    env: { ...process.env, CIARA_VENV_DIR: venvRoot },
  });
  if (r.status !== 0) {
    sendSetupProgressLine(`venv creation failed: ${(r.stderr || r.stdout || "").slice(0, 500)}`);
    return false;
  }

  if (!fs.existsSync(venvPy)) {
    sendSetupProgressLine(`Expected interpreter missing: ${venvPy}`);
    return false;
  }

  wheelhousePath = getWheelhousePathForPython(venvPy);
  if (wheelhousePath) {
    sendSetupProgressLine(`Installing dependencies from bundled wheelhouse (${path.basename(wheelhousePath)})…`);
  } else {
    sendSetupProgressLine("Installing pip and dependencies…");
    r = await runPip(venvPy, ["install", "--quiet", "--upgrade", "--no-cache-dir", "pip", "setuptools", "wheel"], projectRoot);
    if (r.status !== 0) {
      sendSetupProgressLine(`pip bootstrap failed: ${summarizeCommandOutput(r, 500)}`);
      return false;
    }
  }

  if (fs.existsSync(requirementsPath)) {
    r = await installRequirementsWithRetry(venvPy, requirementsPath, projectRoot, wheelhousePath);
    if (r.status !== 0) {
      sendSetupProgressLine(`Dependency install failed: ${summarizeCommandOutput(r, 900)}`);
      return false;
    }
  }

  writeDependencyMarker(venvRoot, venvPy, requirementsPath);
  sendSetupProgressLine("Setup complete!");
  return true;
}

function runSetup(venvRoot) {
  if (process.platform === "win32") {
    return runSetupWindows(venvRoot);
  }

  return new Promise((resolve) => {
    const setupPath = IS_PACKAGED
      ? path.join(APP_ROOT, "setup.sh")
      : path.join(__dirname, "setup.sh");

    if (!fs.existsSync(setupPath)) {
      console.error("[Setup] setup.sh not found at:", setupPath);
      resolve(false);
      return;
    }

    const setup = spawn("bash", [setupPath], {
      cwd: IS_PACKAGED ? APP_ROOT : __dirname,
      env: { ...process.env, CIARA_VENV_DIR: venvRoot },
      stdio: "pipe",
    });

    setup.stdout.on("data", (data) => {
      const text = data.toString().trim();
      process.stdout.write(`[Setup] ${text}\n`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("setup:progress", text);
      }
    });

    setup.stderr.on("data", (data) => {
      process.stderr.write(`[Setup ERR] ${data.toString()}`);
    });

    setup.on("close", (code) => {
      console.log(`[Setup] Exited with code ${code}`);
      if (code === 0) {
        writeDependencyMarker(venvRoot, getVenvPythonPath(venvRoot), path.join(BACKEND_ROOT, "requirements.txt"));
      }
      resolve(code === 0);
    });
  });
}

async function startPythonBackend() {
  if (backendStartPromise) {
    return backendStartPromise;
  }

  backendStartPromise = startPythonBackendInner()
    .finally(() => {
      backendStartPromise = null;
    });

  return backendStartPromise;
}

async function startPythonBackendInner() {
  if (backendSetupFailureUntil > Date.now()) {
    console.warn("[Backend] Previous setup attempt failed recently; waiting before retry.");
    lastBackendStartDetail = "A recent backend setup attempt failed. Wait a moment, then try again.";
    return false;
  }

  const venvRoot = getVenvRoot();
  const venvPythonPath = getVenvPythonPath(venvRoot);
  const requirementsPath = path.join(BACKEND_ROOT, "requirements.txt");
  const scriptPath = path.join(BACKEND_ROOT, "servers", "local_server.py");
  const cwd = IS_PACKAGED ? APP_ROOT : __dirname;

  if (!fs.existsSync(venvPythonPath) || !depsAreFresh(venvRoot, venvPythonPath, requirementsPath)) {
    console.log("[Backend] Python venv not found — running setup...");
    const ok = await runSetup(venvRoot);
    if (!ok) {
      console.error("[Backend] Setup failed — cannot start backend");
      if (!lastBackendStartDetail) {
        lastBackendStartDetail = "Python dependency setup failed. Open 'more' to see the latest setup output.";
      }
      backendSetupFailureUntil = Date.now() + 60000;
      return false;
    }
    backendSetupFailureUntil = 0;
  }

  if (await canReachBackend()) {
    console.log(`[Backend] Reusing existing backend at ${BACKEND_WS_URL}`);
    ownsPythonProcess = false;
    lastBackendStartDetail = `Connected to the existing backend at ${BACKEND_WS_URL}.`;
    return true;
  }

  console.log("[Backend] Starting Python server...");

  // Load saved credentials and inject API keys into Python's environment
  const savedCreds = loadCredentials();
  const spawnEnv = {
    ...process.env,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
  };
  if (savedCreds?.gemini_api_key) spawnEnv.GEMINI_API_KEY = savedCreds.gemini_api_key;
  const llmProvider = (savedCreds?.llm_provider ?? "gemini").trim();
  spawnEnv.CIARA_LLM_PROVIDER = llmProvider;
  const localModel = (savedCreds?.local_model ?? "").trim();
  const localBaseUrl = (savedCreds?.local_base_url ?? "").trim();
  const localApiKey = (savedCreds?.local_api_key ?? "").trim();
  if (localModel) {
    spawnEnv.CIARA_LOCAL_MODEL = localModel;
    spawnEnv.CIARA_LOCAL_FAST_MODEL = localModel;
    spawnEnv.CIARA_LOCAL_POWERFUL_MODEL = localModel;
    spawnEnv.CIARA_LOCAL_ROUTING_MODEL = localModel;
  }
  if (localBaseUrl) spawnEnv.CIARA_LOCAL_BASE_URL = localBaseUrl;
  if (localApiKey) spawnEnv.CIARA_LOCAL_API_KEY = localApiKey;
  if (typeof savedCreds?.local_supports_tools !== "undefined") {
    spawnEnv.CIARA_LOCAL_SUPPORTS_TOOLS = savedCreds.local_supports_tools ? "1" : "0";
  }
  if (typeof savedCreds?.local_supports_vision !== "undefined") {
    spawnEnv.CIARA_LOCAL_SUPPORTS_VISION = savedCreds.local_supports_vision ? "1" : "0";
  }
  const geminiModel = (savedCreds?.gemini_model ?? "").trim();
  if (geminiModel) {
    spawnEnv.GEMINI_FAST_MODEL = geminiModel;
    spawnEnv.GEMINI_POWERFUL_MODEL = geminiModel;
    spawnEnv.GEMINI_ROUTING_MODEL = geminiModel;
  }
  // Use saved Picovoice key if set, otherwise fall back to the bundled default
  spawnEnv.PICOVOICE_ACCESS_KEY = savedCreds?.picovoice_key || BUNDLED_PICOVOICE_KEY;

  const elLabsKey = (savedCreds?.elevenlabs_api_key ?? "").trim();
  if (elLabsKey) spawnEnv.ELEVENLABS_API_KEY = elLabsKey;
  const elVoiceId = (savedCreds?.elevenlabs_voice_id ?? "").trim();
  if (elVoiceId) spawnEnv.ELEVENLABS_VOICE_ID = elVoiceId;

  const ciaraDataDir = path.join(app.getPath("userData"), "ciara-data");
  try {
    fs.mkdirSync(ciaraDataDir, { recursive: true });
  } catch (err) {
    console.error("[Backend] Could not create CIARA data dir:", ciaraDataDir, err);
  }
  spawnEnv.CIARA_DATA_DIR = ciaraDataDir;

  // Start the python process
  pythonProcess = spawn(venvPythonPath, [scriptPath], {
    cwd: cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: spawnEnv,
  });
  ownsPythonProcess = true;

  let sawAddressInUse = false;
  let readinessBuffer = "";
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  // Pipe python stdout/stderr to our electron console
  pythonProcess.stdout.on('data', (data) => {
    const text = data.toString();
    readinessBuffer = (readinessBuffer + text).slice(-4096);
    if (readinessBuffer.includes(BACKEND_READY_SENTINEL)) {
      resolveReady(true);
    }
    process.stdout.write(`[Python] ${text}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes("Errno 48") || text.includes("address already in use")) {
      sawAddressInUse = true;
    }
    process.stderr.write(`[Python ERRROR] ${text}`);
  });

  pythonProcess.on('close', (code) => {
    resolveReady(false);
    if (sawAddressInUse) {
      console.log("[Backend] Python server did not start because port 8000 is already in use.");
    } else {
      console.log(`[Backend] Python server exited with code ${code}`);
    }
    pythonProcess = null;
    ownsPythonProcess = false;
  });

  const ready = await Promise.race([
    readyPromise,
    sleep(10000).then(() => false)
  ]);
  if (ready) {
    lastBackendStartDetail = `Backend ready at ${BACKEND_WS_URL}.`;
    return true;
  }

  if (await canReachBackend()) {
    lastBackendStartDetail = `Backend became reachable at ${BACKEND_WS_URL}.`;
    return true;
  }

  if (sawAddressInUse && await canReachBackend()) {
    console.log(`[Backend] Reusing backend that is already listening at ${BACKEND_WS_URL}`);
    lastBackendStartDetail = `Another CIARA backend was already running at ${BACKEND_WS_URL}; reusing it.`;
    return true;
  }

  if (sawAddressInUse) {
    lastBackendStartDetail = "Port 8000 is already in use by another app, so CIARA could not bind its backend.";
  } else {
    lastBackendStartDetail = "Backend process started, but it did not become ready in time.";
  }
  console.error("[Backend] Backend did not become ready in time.");
  return false;
}

function stopPythonBackend() {
  backendStartPromise = null;
  if (pythonProcess && ownsPythonProcess) {
    console.log("[Backend] Stopping Python server...");
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
    ownsPythonProcess = false;
  }
}

function runOllama(args, timeoutMs = 10000) {
  const result = spawnSync("ollama", args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
  });
  if (result.error) {
    return { ok: false, error: result.error.message, stdout: result.stdout || "", stderr: result.stderr || "" };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status,
  };
}

function parseOllamaList(output) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [name, id, size, ...rest] = line.split(/\s{2,}|\t+/).filter(Boolean);
    return {
      name: name || "",
      id: id || "",
      size: size || "",
      modified: rest.join(" "),
    };
  }).filter((item) => item.name);
}

function getOllamaStatus() {
  const version = runOllama(["--version"], 4000);
  if (!version.ok) {
    return { installed: false, running: false, models: [], error: version.error || version.stderr || "Ollama is not installed." };
  }
  const list = runOllama(["list"], 6000);
  return {
    installed: true,
    running: list.ok,
    version: String(version.stdout || version.stderr || "").trim(),
    models: list.ok ? parseOllamaList(list.stdout) : [],
    error: list.ok ? "" : (list.error || list.stderr || "Ollama is installed but not responding."),
  };
}

function pullOllamaModel(modelName) {
  return new Promise((resolve) => {
    const model = String(modelName || "").trim();
    if (!model) {
      resolve({ ok: false, error: "No Ollama model was selected." });
      return;
    }
    const pull = spawn("ollama", ["pull", model], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    pull.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ollama:progress", text);
      }
    });
    pull.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ollama:progress", text);
      }
    });
    pull.on("error", (err) => {
      resolve({ ok: false, error: err.message, output });
    });
    pull.on("close", (code) => {
      resolve({ ok: code === 0, error: code === 0 ? "" : `ollama pull exited with code ${code}`, output });
    });
  });
}

function emitStartListening() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("start-listening");
    });
    return;
  }

  mainWindow.webContents.send("start-listening");
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!onboardingWindowMode) {
    setOverlayWindowMode();
  }
  mainWindow.show();
  mainWindow.focus();
}

function openSettingsWindow() {
  showMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("settings:open");
    });
    return;
  }
  mainWindow.webContents.send("settings:open");
}

function createTray() {
  if (tray) return tray;

  tray = new Tray(getTrayIconImage());
  tray.setToolTip("CIARA");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open CIARA", click: () => wakeOverlay() },
    { label: "Settings", click: () => openSettingsWindow() },
    { type: "separator" },
    {
      label: "Restart Backend",
      click: async () => {
        stopPythonBackend();
        await sleep(500);
        startPythonBackend();
      },
    },
    { type: "separator" },
    {
      label: "Quit CIARA",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("click", () => wakeOverlay());
  tray.on("double-click", () => wakeOverlay());
  return tray;
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const windowIcon = getAppIconImage();
  const firstLaunch = !hasUsableCredentials();
  onboardingWindowMode = firstLaunch;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: display.workArea.x,
    y: display.workArea.y,
    show: true,
    frame: false,
    titleBarStyle: "hidden",
    transparent: !firstLaunch,
    resizable: true,
    movable: true,
    hasShadow: firstLaunch,
    alwaysOnTop: !firstLaunch,
    skipTaskbar: !firstLaunch,
    minimizable: true,
    maximizable: true,
    closable: true,
    icon: windowIcon,
    backgroundColor: firstLaunch ? "#0d0d0d" : "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (typeof mainWindow.setIcon === "function") {
    mainWindow.setIcon(windowIcon);
  }

  if (firstLaunch) {
    setNormalWindowMode();
  } else {
    setOverlayWindowMode();
  }
  mainWindow.setFullScreenable(true);

  const sendMaximizedState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("window:maximized-change", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", sendMaximizedState);
  mainWindow.on("unmaximize", sendMaximizedState);
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function setOverlayWindowMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  onboardingWindowMode = false;
  mainWindow.setSkipTaskbar(true);
  mainWindow.setResizable(false);
  mainWindow.setMinimizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setAlwaysOnTop(true, WINDOW_LEVEL);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setMousePassthrough(true);
  mainWindow.webContents.send("window:mode-change", "assistant-overlay");
}

function setNormalWindowMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  onboardingWindowMode = true;
  mainWindow.setSkipTaskbar(false);
  mainWindow.setResizable(true);
  mainWindow.setMinimizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false);
  setMousePassthrough(false);
  mainWindow.webContents.send("window:mode-change", "normal");
}

function centerNearTop() {
  if (!mainWindow) return;
  const display = screen.getPrimaryDisplay();
  const x = Math.round(display.workArea.x + (display.workArea.width - WINDOW_WIDTH) / 2);
  const y = Math.max(display.workArea.y + 10, 8);
  mainWindow.setPosition(x, y, false);
}

function wakeOverlay() {
  lastWakeAt = Date.now();
  showMainWindow();
  emitStartListening();
}

function hideOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  setMousePassthrough(true);
  mainWindow.webContents.send("overlay-hidden");
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  let registeredCount = 0;

  for (const accelerator of HOTKEYS) {
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => {
        wakeOverlay();
      });
    } catch (err) {
      console.error(`Failed to register global shortcut: ${accelerator}`, err);
    }
    if (ok) {
      registeredCount += 1;
    } else {
      console.error(`Failed to register global shortcut: ${accelerator}`);
    }
  }

  for (const accelerator of SETTINGS_HOTKEYS) {
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("settings:open");
      });
    } catch (err) {
      console.error(`Failed to register settings shortcut: ${accelerator}`, err);
    }
    if (ok) {
      registeredCount += 1;
    } else {
      console.error(`Failed to register settings shortcut: ${accelerator}`);
    }
  }

  if (registeredCount === 0) {
    console.error("No usable global shortcuts were registered.");
  }
}

function setMousePassthrough(ignore) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    return;
  }
  mainWindow.setIgnoreMouseEvents(false);
}

async function configureMicrophonePermissions() {
  // Allow all permissions for our own renderer (media, clipboard, notifications, etc.)
  session.defaultSession.setPermissionCheckHandler((_, permission) => {
    return true;
  });

  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(true);
  });

  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status !== "granted") {
      try {
        await systemPreferences.askForMediaAccess("microphone");
      } catch (err) {
        console.error("Microphone permission prompt failed:", err);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Auto-Updater (electron-updater → GitHub Releases)
// ═══════════════════════════════════════════════════════════════

function initAutoUpdater() {
  // Don't auto-download — let the user decide when to install
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Checking for updates…");
    sendToRenderer("updater:status", "checking");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] Update available: v${info.version}`);
    sendToRenderer("updater:status", "available", {
      version: info.version,
      releaseNotes: info.releaseNotes || "",
      releaseDate: info.releaseDate || "",
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log(`[Updater] Already on latest: v${info.version}`);
    sendToRenderer("updater:status", "up-to-date", { version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(`[Updater] Downloading: ${Math.round(progress.percent)}%`);
    sendToRenderer("updater:status", "downloading", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    sendToRenderer("updater:status", "downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err.message);
    sendToRenderer("updater:status", "error", { message: err.message });
  });

  // Check for updates after a short delay (don't slow down startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[Updater] Initial check failed:", err.message);
    });
  }, 5000);
}

/** Helper to safely send events to the renderer. */
function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

app.whenReady().then(async () => {
  await configureMicrophonePermissions();
  Menu.setApplicationMenu(null);

  // Create window first so setup:progress events can reach the renderer
  createWindow();
  createTray();
  registerHotkey();

  // Initialise auto-updater (checks GitHub Releases in the background)
  initAutoUpdater();

  // Returning user (credentials valid): start backend immediately with saved API keys.
  // First launch / corrupt credentials: renderer shows onboarding first.
  if (hasUsableCredentials()) {
    // Brief pause for window to finish loading before setup:progress events fire
    await new Promise(r => setTimeout(r, 800));
    startPythonBackend();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createTray();
      registerHotkey();
    }
  });
});

app.on("second-instance", () => {
  showMainWindow();
});

ipcMain.handle("overlay:hide", () => {
  hideOverlay();
});

ipcMain.handle("window:minimize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.minimize();
});

ipcMain.handle("window:maximize-toggle", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("window:is-maximized", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isMaximized();
});

ipcMain.handle("window:set-onboarding-mode", (event, active) => {
  if (active) {
    setNormalWindowMode();
  } else {
    setOverlayWindowMode();
  }
  return true;
});

ipcMain.handle("window:set-automation-lock", (event, active) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const locked = Boolean(active);
  if (locked) {
    mainWindow.showInactive?.();
  }
  if (!onboardingWindowMode) {
    setMousePassthrough(true);
  }
  return true;
});

ipcMain.handle("window:close", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
});

ipcMain.on("enable-mouse", () => {
  setMousePassthrough(false);
});

ipcMain.on("disable-mouse", () => {
  setMousePassthrough(true);
});

ipcMain.on("log-error", (event, msg) => {
  console.error(`[Renderer WS Error] ${msg}`);
});

ipcMain.on("log-info", (event, msg) => {
  console.log(`[Renderer Info] ${msg}`);
});

// ═══════════════════════════════════════════════════════════════
//  Credential Storage (safeStorage-encrypted)
// ═══════════════════════════════════════════════════════════════

function loadCredentials() {
  try {
    if (!fs.existsSync(CRED_FILE)) return null;
    const encrypted = fs.readFileSync(CRED_FILE);
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("[Auth] safeStorage encryption not available");
      return null;
    }
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error("[Auth] Failed to load credentials:", err.message);
    return null;
  }
}

function saveCredentials(creds) {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("[Auth] safeStorage encryption not available");
      return false;
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(creds));
    fs.writeFileSync(CRED_FILE, encrypted);
    return true;
  } catch (err) {
    console.error("[Auth] Failed to save credentials:", err.message);
    return false;
  }
}

ipcMain.handle("auth:load-credentials", () => {
  return loadCredentials();
});

ipcMain.handle("auth:save-credentials", (event, creds) => {
  return saveCredentials(creds);
});

ipcMain.handle("auth:generate-user-id", () => {
  return {
    user_id: crypto.randomUUID(),
    auth_token: crypto.randomBytes(36).toString("base64url"),
  };
});

ipcMain.handle("auth:clear-credentials", () => {
  try {
    if (fs.existsSync(CRED_FILE)) fs.unlinkSync(CRED_FILE);
    return true;
  } catch { return false; }
});

ipcMain.handle("auth:is-first-launch", () => {
  return !hasUsableCredentials();
});

ipcMain.handle("app:get-version", () => {
  return app.getVersion();
});

ipcMain.handle("app:is-packaged", () => {
  return IS_PACKAGED;
});

ipcMain.handle("app:get-platform", () => process.platform);

/** Full path to the Python venv directory (for user-facing reset instructions). */
ipcMain.handle("app:get-venv-path", () => getVenvRoot());

ipcMain.handle("backend:start", async () => {
  const ok = await startPythonBackend();
  return { ok, detail: lastBackendStartDetail };
});

ipcMain.handle("backend:restart", async () => {
  stopPythonBackend();
  await sleep(500);
  const ok = await startPythonBackend();
  return { ok, detail: lastBackendStartDetail };
});

ipcMain.handle("ollama:status", () => {
  return getOllamaStatus();
});

ipcMain.handle("ollama:pull", async (_event, modelName) => {
  return pullOllamaModel(modelName);
});

ipcMain.handle("app:get-data-dir-path", () => {
  return path.join(app.getPath("userData"), "ciara-data");
});

// ═══════════════════════════════════════════════════════════════
//  Chrome Extension — Export & Install Helpers
// ═══════════════════════════════════════════════════════════════

const CHROME_EXT_SOURCE = IS_PACKAGED
  ? path.join(APP_ROOT, "chrome_extension")
  : path.join(__dirname, "chrome_extension");

ipcMain.handle("extension:export", async () => {
  if (!fs.existsSync(CHROME_EXT_SOURCE)) {
    console.error("[Extension] Source missing:", CHROME_EXT_SOURCE);
    return { success: false, reason: "Extension files are missing from the app bundle." };
  }

  // Let customer choose where to save the extension folder
  const { canceled, filePath: destPath } = await dialog.showSaveDialog(mainWindow, {
    title: "Save CIARA Browser Extension",
    defaultPath: path.join(app.getPath("downloads"), "ciara-browser-bridge"),
    buttonLabel: "Save Extension",
  });
  if (canceled || !destPath) return { success: false, reason: "cancelled" };

  try {
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    fs.cpSync(CHROME_EXT_SOURCE, destPath, { recursive: true });

    // Write a friendly install guide inside
    const guide = [
      "# CIARA Browser Bridge — Install Guide\n",
      "## Quick Install (2 minutes)\n",
      "1. Open Google Chrome",
      "2. Go to chrome://extensions",
      "3. Turn ON 'Developer mode' (top-right toggle)",
      "4. Click 'Load unpacked' (top-left)",
      "5. Select THIS folder",
      "6. Done! The CIARA extension is now installed.\n",
      "## Pin the Extension",
      "Click the puzzle piece icon in Chrome's toolbar,",
      "then click the pin next to 'CIARA Browser Bridge'.\n",
      "## Connection",
      "The extension connects automatically to the CIARA desktop app.",
      "Make sure CIARA is running before using browser features.\n",
    ].join("\n");
    fs.writeFileSync(path.join(destPath, "INSTALL.md"), guide);

    // Open the folder in Finder
    shell.showItemInFolder(destPath);
    return { success: true, path: destPath };
  } catch (err) {
    return { success: false, reason: err.message };
  }
});

ipcMain.handle("extension:reveal", () => {
  if (fs.existsSync(CHROME_EXT_SOURCE)) {
    shell.showItemInFolder(CHROME_EXT_SOURCE);
    return true;
  }
  return false;
});

ipcMain.handle("extension:open-chrome-extensions", () => {
  shell.openExternal("https://support.google.com/chrome_webstore/answer/2664769");
  return true;
});

ipcMain.handle("app:open-external", async (_event, rawUrl) => {
  try {
    const url = new URL(String(rawUrl || ""));
    if (!["https:", "http:"].includes(url.protocol)) return false;
    await shell.openExternal(url.toString());
    return true;
  } catch {
    return false;
  }
});

// ═══════════════════════════════════════════════════════════════
//  Auto-Updater IPC handlers
// ═══════════════════════════════════════════════════════════════

ipcMain.handle("updater:check", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("updater:download", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("updater:install", () => {
  autoUpdater.quitAndInstall(false, true);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopPythonBackend();
});
