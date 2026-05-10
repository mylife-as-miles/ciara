const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell,
  dialog,
  systemPreferences,
  safeStorage,
} = require("electron");

const HOTKEYS = (process.env.LIQUID_HOTKEY || "CommandOrControl+Shift+Space,Alt+Space")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

/** Open settings (API keys). Comma-separated list allowed. */
const SETTINGS_HOTKEYS = (process.env.CIARA_SETTINGS_HOTKEY || "CommandOrControl+Comma")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const WINDOW_LEVEL = "screen-saver";

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

const BACKEND_WS_URL = process.env.CIARA_BACKEND_WS_URL || "ws://127.0.0.1:8000/ws";
const BACKEND_HOST = process.env.CIARA_BACKEND_HOST || "127.0.0.1";
const BACKEND_PORT = Number(process.env.CIARA_BACKEND_PORT || "8000");
const BRIDGE_PORT = Number(process.env.CIARA_BROWSER_BRIDGE_PORT || "8765");
const BACKEND_READY_SENTINEL = "[Backend] READY";

// Venv lives in userData for packaged builds (writable, survives app updates)
const getVenvRoot = () => IS_PACKAGED
  ? path.join(app.getPath("userData"), "venv")
  : path.join(__dirname, "venv");

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
  return !!(creds && creds.gemini_api_key);
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

function sendSetupProgressLine(text) {
  const line = String(text).trim();
  if (!line) return;
  process.stdout.write(`[Setup] ${line}\n`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("setup:progress", line);
  }
}

/** Windows: find Python 3.10+ on PATH (py launcher or python/python3). */
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
    const parts = r.stdout.trim().split(".");
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    if (major === 3 && minor >= 10) {
      return { cmd, prefix };
    }
  }
  return null;
}

/**
 * Windows: create/upgrade venv with `python -m venv` + pip (no bash required).
 * macOS/Linux: still uses setup.sh under bash.
 */
function runSetupWindows(venvRoot) {
  const requirementsPath = path.join(BACKEND_ROOT, "requirements.txt");
  const projectRoot = IS_PACKAGED ? APP_ROOT : __dirname;
  const venvPy = getVenvPythonPath(venvRoot);

  if (fs.existsSync(venvPy)) {
    sendSetupProgressLine("Virtual environment found — upgrading packages…");
    let r = spawnSync(venvPy, ["-m", "pip", "install", "--quiet", "--upgrade", "pip"], {
      encoding: "utf8",
      windowsHide: true,
      cwd: projectRoot,
    });
    if (r.status !== 0) {
      sendSetupProgressLine(`pip upgrade failed: ${(r.stderr || r.stdout || "").slice(0, 400)}`);
      return false;
    }
    if (fs.existsSync(requirementsPath)) {
      r = spawnSync(venvPy, ["-m", "pip", "install", "--quiet", "-r", requirementsPath], {
        encoding: "utf8",
        windowsHide: true,
        cwd: projectRoot,
      });
      if (r.status !== 0) {
        sendSetupProgressLine(`Dependency install failed: ${(r.stderr || r.stdout || "").slice(0, 500)}`);
        return false;
      }
    }
    sendSetupProgressLine("Setup complete!");
    return true;
  }

  const found = findWindowsPython310();
  if (!found) {
    sendSetupProgressLine(
      "Python 3.10+ not found. Install from python.org and enable “Add python.exe to PATH”, then restart CIARA."
    );
    console.error("[Setup] No Python 3.10+ found on Windows PATH");
    return false;
  }

  sendSetupProgressLine(`Using ${found.cmd} ${found.prefix.join(" ")} — creating virtual environment…`);
  let r = spawnSync(found.cmd, [...found.prefix, "-m", "venv", venvRoot], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
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

  sendSetupProgressLine("Installing pip and dependencies…");
  r = spawnSync(venvPy, ["-m", "pip", "install", "--quiet", "--upgrade", "pip"], {
    encoding: "utf8",
    windowsHide: true,
    cwd: projectRoot,
  });
  if (r.status !== 0) {
    sendSetupProgressLine(`pip bootstrap failed: ${(r.stderr || r.stdout || "").slice(0, 400)}`);
    return false;
  }

  if (fs.existsSync(requirementsPath)) {
    r = spawnSync(venvPy, ["-m", "pip", "install", "--quiet", "-r", requirementsPath], {
      encoding: "utf8",
      windowsHide: true,
      cwd: projectRoot,
    });
    if (r.status !== 0) {
      sendSetupProgressLine(`Dependency install failed: ${(r.stderr || r.stdout || "").slice(0, 500)}`);
      return false;
    }
  }

  sendSetupProgressLine("Setup complete!");
  return true;
}

function runSetup(venvRoot) {
  if (process.platform === "win32") {
    return Promise.resolve(runSetupWindows(venvRoot));
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
      resolve(code === 0);
    });
  });
}

async function startPythonBackend() {
  const venvRoot = getVenvRoot();
  const venvPythonPath = getVenvPythonPath(venvRoot);
  const scriptPath = path.join(BACKEND_ROOT, "servers", "local_server.py");
  const cwd = IS_PACKAGED ? APP_ROOT : __dirname;

  if (!fs.existsSync(venvPythonPath)) {
    console.log("[Backend] Python venv not found — running setup...");
    const ok = await runSetup(venvRoot);
    if (!ok) {
      console.error("[Backend] Setup failed — cannot start backend");
      return false;
    }
  }

  if (await canReachBackend()) {
    console.log(`[Backend] Reusing existing backend at ${BACKEND_WS_URL}`);
    ownsPythonProcess = false;
    return true;
  }

  console.log("[Backend] Starting Python server...");

  // Load saved credentials and inject API keys into Python's environment
  const savedCreds = loadCredentials();
  const spawnEnv = { ...process.env };
  if (savedCreds?.gemini_api_key) spawnEnv.GEMINI_API_KEY = savedCreds.gemini_api_key;
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
    return true;
  }

  if (await canReachBackend()) {
    return true;
  }

  if (sawAddressInUse && await canReachBackend()) {
    console.log(`[Backend] Reusing backend that is already listening at ${BACKEND_WS_URL}`);
    return true;
  }

  console.error("[Backend] Backend did not become ready in time.");
  return false;
}

function stopPythonBackend() {
  if (pythonProcess && ownsPythonProcess) {
    console.log("[Backend] Stopping Python server...");
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
    ownsPythonProcess = false;
  }
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

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: display.workArea.x,
    y: display.workArea.y,
    show: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    alwaysOnTop: true,
    /** Show on taskbar so the window can be minimized from the OS chrome / taskbar. */
    skipTaskbar: false,
    minimizable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, WINDOW_LEVEL);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setFullScreenable(false);
  setMousePassthrough(true);

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function centerNearTop() {
  if (!mainWindow) return;
  const display = screen.getPrimaryDisplay();
  const x = Math.round(display.workArea.x + (display.workArea.width - WINDOW_WIDTH) / 2);
  const y = Math.max(display.workArea.y + 10, 8);
  mainWindow.setPosition(x, y, false);
}

function wakeOverlay() {
  if (!mainWindow) return;
  lastWakeAt = Date.now();
  mainWindow.show();
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
    const ok = globalShortcut.register(accelerator, () => {
      wakeOverlay();
    });
    if (ok) {
      registeredCount += 1;
    } else {
      console.error(`Failed to register global shortcut: ${accelerator}`);
    }
  }

  for (const accelerator of SETTINGS_HOTKEYS) {
    const ok = globalShortcut.register(accelerator, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("settings:open");
    });
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

app.whenReady().then(async () => {
  await configureMicrophonePermissions();

  // Create window first so setup:progress events can reach the renderer
  createWindow();
  registerHotkey();

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
      registerHotkey();
    }
  });
});

ipcMain.handle("overlay:hide", () => {
  hideOverlay();
});

ipcMain.handle("window:minimize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.minimize();
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
  return { ok };
});

ipcMain.handle("backend:restart", async () => {
  stopPythonBackend();
  await sleep(500);
  const ok = await startPythonBackend();
  return { ok };
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

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopPythonBackend();
});
