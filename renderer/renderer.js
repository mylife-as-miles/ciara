/* ─────────────────────────────────────────────────────────────
   CIARA – Renderer (Raw Audio Streaming to Backend)
   ───────────────────────────────────────────────────────────── */

const State = Object.freeze({
  IDLE: "IDLE",
  LISTENING: "LISTENING",
  LOADING: "LOADING",
  DOING: "DOING",
  PAUSED: "PAUSED",
  RESPONDING: "RESPONDING"
});

const WS_URL = "ws://127.0.0.1:8000/ws";

/* ── IPC Bridge ── */
const bridge = window.overlayAPI || {
  hideWindow: async () => { },
  minimizeWindow: async () => { },
  toggleMaximizeWindow: async () => false,
  closeWindow: async () => { },
  isWindowMaximized: async () => false,
  onWindowMaximizedChange: () => () => { },
  setOnboardingMode: async () => false,
  onWindowModeChange: () => () => { },
  enableMouse: () => { },
  disableMouse: () => { },
  setAutomationLock: async () => false,
  onStartListening: () => () => { },
  onOverlayHidden: () => () => { },
  logError: () => { },
  logInfo: () => { },
  openExternal: async () => false,
  loadCredentials: async () => ({}),
  saveCredentials: async () => false,
  restartBackend: async () => ({ ok: false }),
  getDataDirPath: async () => "",
  getVersion: async () => "",
  getPlatform: async () => "",
  getVenvPath: async () => "",
  startBackend: async () => ({ ok: false }),
  getOllamaStatus: async () => ({ installed: false, running: false, models: [] }),
  pullOllamaModel: async () => ({ ok: false }),
  onOllamaProgress: () => () => { },
  exportExtension: async () => ({ success: false }),
  revealExtension: async () => false,
  onSetupProgress: () => () => { },
  onSettingsOpen: () => () => { },
  isFirstLaunch: async () => false,
  generateUserId: async () => ({}),
};

function openExternalUrl(url) {
  return bridge.openExternal?.(url) ?? Promise.resolve(false);
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented) return;
  const link = event.target?.closest?.("a[href^='http://'], a[href^='https://']");
  if (!link) return;
  event.preventDefault();
  openExternalUrl(link.href);
});

/* ── IPC Bridge ── */

/* ── DOM Refs ── */
const wrapper = document.getElementById("ui-wrapper");
const uiIdle = document.getElementById("ui-idle");
const uiListening = document.getElementById("ui-listening");
const uiLoading = document.getElementById("ui-loading");
const uiDoing = document.getElementById("ui-doing");
const glow = document.getElementById("glow");
const stageEl = document.querySelector('.stage');
const automationLockEl = document.getElementById("automation-lock");
const automationLockLabelEl = document.getElementById("automation-lock-label");
const uiResponse = document.getElementById("ui-response");
const statusEl = document.getElementById("status-text");
const doingTextEl = document.getElementById("doing-text");
const appIconEl = document.getElementById("app-icon");
const ciaraCursor = document.getElementById("ciara-cursor");
const ciaraCursorLabel = document.getElementById("ciara-cursor-label");
const typewriterText = document.getElementById("typewriter-text");
const typewriterCursor = document.getElementById("typewriter-cursor");
const responseTextEl = document.getElementById("response-text");
const responseCursorEl = document.getElementById("response-cursor");
const responseDismissEl = document.getElementById("response-dismiss");
const commandPanel = document.getElementById("command-panel");
const commandInput = document.getElementById("command-input");
const commandSend = document.getElementById("command-panel-send");
const commandClose = document.getElementById("command-panel-close");
const pillStopBtn = document.getElementById("pill-stop");
const appTitlebar = document.getElementById("app-titlebar");
const appWindowControls = document.getElementById("app-window-controls");
const appWindowMinimize = document.getElementById("app-window-minimize");
const appWindowMaximize = document.getElementById("app-window-maximize");
const appWindowClose = document.getElementById("app-window-close");

function setWindowModeClass(mode) {
  const normal = mode === "normal";
  document.body.classList.toggle("normal-window-mode", normal);
  document.body.classList.toggle("assistant-overlay-mode", !normal);
}

setWindowModeClass("assistant-overlay");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsLinkAistudio = document.getElementById("settings-link-aistudio");
const settingsLinkPicovoice = document.getElementById("settings-link-picovoice");
const settingsLinkEleven = document.getElementById("settings-link-eleven");
const settingsLlmProvider = document.getElementById("settings-llm-provider");
const settingsGeminiKey = document.getElementById("settings-gemini-key");
const settingsLocalModel = document.getElementById("settings-local-model");
const settingsLocalBaseUrl = document.getElementById("settings-local-base-url");
const settingsPicovoiceKey = document.getElementById("settings-picovoice-key");
const settingsElevenlabsKey = document.getElementById("settings-elevenlabs-key");
const settingsElevenlabsVoice = document.getElementById("settings-elevenlabs-voice");
const settingsDataDir = document.getElementById("settings-data-dir");
const settingsAppVersion = document.getElementById("settings-app-version");
const settingsStatus = document.getElementById("settings-status");
const settingsSave = document.getElementById("settings-save");
const settingsCancel = document.getElementById("settings-cancel");

/* ── Modal DOM Refs ── */
const modalRich = document.getElementById("modal-rich");
const richTitle = document.getElementById("rich-title");
const richBody = document.getElementById("rich-body");
const richDismiss = document.getElementById("rich-dismiss");

const modalTable = document.getElementById("modal-table");
const tableTitle = document.getElementById("table-title");
const tableHead = document.getElementById("table-head");
const tableBody = document.getElementById("table-body");
const tableFooter = document.getElementById("table-footer");
const tableDismiss = document.getElementById("table-dismiss");

const modalList = document.getElementById("modal-list");
const listTitle = document.getElementById("list-title");
const listMessage = document.getElementById("list-message");
const listItems = document.getElementById("list-items");
const listDismiss = document.getElementById("list-dismiss");

const modalConfirm = document.getElementById("modal-confirm");
const confirmBody = document.getElementById("confirm-body");
const confirmActions = document.getElementById("confirm-actions");
const confirmDismiss = document.getElementById("confirm-dismiss");

const modalMedia = document.getElementById("modal-media");
const mediaMessage = document.getElementById("media-message");
const mediaImg = document.getElementById("media-img");
const mediaCaption = document.getElementById("media-caption");
const mediaDismiss = document.getElementById("media-dismiss");

const modalSteps = document.getElementById("modal-steps");
const stepsTitle = document.getElementById("steps-title");
const stepsSubtitle = document.getElementById("steps-subtitle");
const stepsMessage = document.getElementById("steps-message");
const stepsTimeline = document.getElementById("steps-timeline");
const stepsActions = document.getElementById("steps-actions");
const stepsDismiss = document.getElementById("steps-dismiss");

const modalProducts = document.getElementById("modal-products");
const productsHeader = document.getElementById("products-header");
const productsTitle = document.getElementById("products-title");
const productsSubtitle = document.getElementById("products-subtitle");
const productsMessage = document.getElementById("products-message");
const productsBody = document.getElementById("products-body");
const productsGrid = document.getElementById("products-grid");
const productsSidebar = document.getElementById("products-sidebar");
const productsDismiss = document.getElementById("products-dismiss");

/* All modal containers for bulk dismiss */
const ALL_MODALS = [uiResponse, modalRich, modalTable, modalList, modalConfirm, modalMedia, modalSteps, modalProducts];

/* ── App State ── */
const app = {
  current: State.IDLE,
  visible: true,
  ws: null,
  reconnectTimer: null,
  reconnectDelay: 700,
  reconnectMaxDelay: 7000,
  backendRecoveryPromise: null,
  connectionLostTimer: null,
  suppressNextSocketCloseNotice: false,
  wasReconnectingDuringWork: false,
  mouseEnabled: false,
  isDisposed: false,
  detectedApp: "",
  actionMessage: "Processing...",
  autoResetTimer: null,
  workWatchdogTimer: null,
  streamTimer: null,       // Character-by-character typing interval
  streamQueue: "",         // Text waiting to be streamed
  streamIndex: 0,          // Current position in stream

  // Audio Streaming Pipeline
  audioStream: null,
  audioContext: null,
  sourceNode: null,
  scriptProcessor: null,

  // Conversation mode
  conversationMode: false,

  // TTS audio playback
  ttsAudioContext: null,
  ttsQueue: [],           // queued AudioBuffers
  ttsPlaying: false,
  ttsCurrentSource: null, // currently playing AudioBufferSourceNode

  // Agent tracking
  agents: {},           // id -> agent state
  runningAgents: 0,
  totalAgents: 0,
  currentTaskId: null,
  automationLock: false,
  automationLockToolCount: 0,
  commandPanelOpen: false,
  commandSending: false,
  currentPlanId: null,  // active plan modal correlation id
  _skipAfterModalShow: false,  // Multi-modal flag: skip individual afterModalShow calls
  cursorHideTimer: null,
};

function setCiaraCursorPosition(x, y) {
  if (!ciaraCursor) return;
  const rawX = Number.isFinite(Number(x)) ? Number(x) : window.innerWidth / 2;
  const rawY = Number.isFinite(Number(y)) ? Number(y) : window.innerHeight / 2;
  const safeX = Math.max(18, Math.min(window.innerWidth - 18, rawX));
  const safeY = Math.max(18, Math.min(window.innerHeight - 18, rawY));
  ciaraCursor.style.setProperty("--cursor-x", `${Math.round(safeX)}px`);
  ciaraCursor.style.setProperty("--cursor-y", `${Math.round(safeY)}px`);
}

function showCiaraCursor({ x, y, label = "CIARA", autoHideMs = 5200 } = {}) {
  if (!ciaraCursor) return;
  if (app.cursorHideTimer) {
    clearTimeout(app.cursorHideTimer);
    app.cursorHideTimer = null;
  }
  setCiaraCursorPosition(x, y);
  if (ciaraCursorLabel) ciaraCursorLabel.textContent = label || "CIARA";
  ciaraCursor.classList.remove("hidden");
  if (autoHideMs > 0) {
    app.cursorHideTimer = window.setTimeout(() => hideCiaraCursor(), autoHideMs);
  }
}

function hideCiaraCursor() {
  if (!ciaraCursor) return;
  ciaraCursor.classList.add("hidden");
  ciaraCursor.classList.remove("is-clicking", "is-dragging");
  if (app.cursorHideTimer) {
    clearTimeout(app.cursorHideTimer);
    app.cursorHideTimer = null;
  }
}

function pulseCiaraCursor(kind = "click") {
  if (!ciaraCursor) return;
  const cls = kind === "drag" ? "is-dragging" : "is-clicking";
  ciaraCursor.classList.remove(cls);
  void ciaraCursor.offsetWidth;
  ciaraCursor.classList.add(cls);
  if (cls === "is-clicking") {
    window.setTimeout(() => ciaraCursor?.classList.remove(cls), 460);
  }
}

function handleAutomationCursor(payload = {}) {
  const action = String(payload.action || "move").toLowerCase();
  if (action === "hide") {
    hideCiaraCursor();
    return;
  }

  const x = Number(payload.x);
  const y = Number(payload.y);
  const label = payload.label || (action === "click" ? "CLICK" : action === "drag" ? "DRAG" : "CIARA");
  const useCenter = payload.position === "center";
  showCiaraCursor({
    x: useCenter ? window.innerWidth / 2 : x,
    y: useCenter ? window.innerHeight / 2 : y,
    label,
    autoHideMs: Number(payload.autoHideMs || 5200)
  });

  if (action === "click" || action === "double" || action === "right") {
    pulseCiaraCursor("click");
    return;
  }

  if (action === "drag") {
    pulseCiaraCursor("drag");
    const x2 = Number(payload.x2);
    const y2 = Number(payload.y2);
    window.setTimeout(() => {
      setCiaraCursorPosition(x2, y2);
      window.setTimeout(() => ciaraCursor?.classList.remove("is-dragging"), 520);
    }, 180);
  }
}

/* ── UI State Management ── */
function setIslandState(nextStateClass) {
  wrapper.className = `glass-pill ${nextStateClass}`;
}

function switchContent(target) {
  uiIdle.classList.remove('active');
  uiListening.classList.remove('active');
  uiLoading.classList.remove('active');
  uiDoing.classList.remove('active');
  target.classList.add('active');
}

function clearWorkWatchdog() {
  if (!app.workWatchdogTimer) return;
  clearTimeout(app.workWatchdogTimer);
  app.workWatchdogTimer = null;
}

function isWorkingState() {
  return app.current === State.LOADING || app.current === State.DOING;
}

function clearConnectionLostTimer() {
  if (!app.connectionLostTimer) return;
  clearTimeout(app.connectionLostTimer);
  app.connectionLostTimer = null;
}

function clearReconnectTimer() {
  if (!app.reconnectTimer) return;
  clearTimeout(app.reconnectTimer);
  app.reconnectTimer = null;
}

function shouldStreamAudioChunk() {
  return isWebSocketOpen()
    && (app.current === State.IDLE || app.current === State.LISTENING)
    && !app.commandPanelOpen
    && !app.commandSending;
}

function closeWebSocketQuietly() {
  if (!app.ws || app.ws.readyState > WebSocket.OPEN) return;
  app.suppressNextSocketCloseNotice = true;
  app.ws.close();
}

function appendSetupLogLine(text, { expand = true } = {}) {
  if (!setupLogEl) return;
  const line = String(text || "").trim();
  if (!line) return;
  const lines = `${setupLogEl.textContent || ""}\n${line}`
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(-80);
  setupLogEl.textContent = lines.join("\n");
  if (expand && onboardingLogPanel) {
    onboardingLogPanel.classList.add("is-expanded");
    if (onboardingLogToggle) onboardingLogToggle.setAttribute("aria-expanded", "true");
  }
}

async function establishFreshWebSocketConnection(timeoutMs = 20000) {
  clearReconnectTimer();
  try {
    closeWebSocketQuietly();
  } catch {
    // ignore
  }
  app.ws = null;
  connectWebSocket();
  return waitForWebSocketOpen(timeoutMs);
}

async function recoverBackendAfterDisconnect() {
  if (app.backendRecoveryPromise) return app.backendRecoveryPromise;
  app.backendRecoveryPromise = (async () => {
    try {
      await bridge.startBackend?.();
    } catch (err) {
      console.warn("[Backend] Could not restart backend after websocket close:", err);
    } finally {
      app.backendRecoveryPromise = null;
      if (!app.isDisposed) connectWebSocket();
    }
  })();
  return app.backendRecoveryPromise;
}

function armWorkWatchdog(label = "CIARA") {
  clearWorkWatchdog();
  app.workWatchdogTimer = setTimeout(() => {
    app.workWatchdogTimer = null;
    try {
      cancelActiveTask();
    } catch {}
    showResponseCard(`${label} took too long to respond. The task was stopped so the overlay does not stay loading forever.`);
  }, 120000);
}

/** Truncate text to a maximum number of words */
function truncateToWords(text, max = 2) {
  const words = (text || '').trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(' ') + '…';
}

function setState(next, { tier = "", text = null, appName = "", iconUrl = "", force = false, variant = "" } = {}) {
  if (!force && app.current === next) return;
  app.current = next;

  if (next === State.LOADING || next === State.DOING) {
    armWorkWatchdog(next === State.DOING ? (text || "CIARA") : "CIARA");
  } else {
    clearWorkWatchdog();
  }

  // Clear any previous variant class
  wrapper.classList.remove('variant-browsing', 'variant-typing', 'variant-searching', 'variant-executing', 'variant-planning');

  // Hide response card when switching to non-response states
  if (next !== State.RESPONDING && !uiResponse.classList.contains('dismissing')) {
    dismissResponseCard(true);
  }

  if (next === State.IDLE) {
    glow.classList.remove('active');
    setIslandState('state-idle');
    switchContent(uiIdle);
    statusEl.innerText = "Hey CIARA";
    typewriterText.innerText = '';
  }
  else if (next === State.LISTENING) {
    glow.classList.add('active');
    setIslandState('state-listening');
    switchContent(uiListening);
    typewriterText.innerText = "Listening...";
    typewriterCursor.style.display = 'inline-block';
  }
  else if (next === State.LOADING) {
    glow.classList.add('active');
    setIslandState('state-loading');
    switchContent(uiLoading);
  }
  else if (next === State.DOING) {
    glow.classList.add('active');
    setIslandState('state-doing');
    switchContent(uiDoing);

    // Apply variant class for visual differentiation
    if (variant) wrapper.classList.add(`variant-${variant}`);

    if (text) doingTextEl.innerText = truncateToWords(text, 2);

    if (iconUrl) {
      appIconEl.src = iconUrl;
      appIconEl.style.display = 'block';
    } else {
      appIconEl.style.display = 'none';
    }
  }
  else if (next === State.PAUSED) {
    glow.classList.add('active');
    setIslandState('state-doing');
    switchContent(uiDoing);
    if (text) doingTextEl.innerText = truncateToWords(text, 4);
    appIconEl.style.display = 'none';
  }
  else if (next === State.RESPONDING) {
    glow.classList.add('active');
    setIslandState('state-loading');
    switchContent(uiLoading);
  }

  // AI Analysis mode — drives the glassmorphism "active analysis" visuals
  glow.classList.toggle('analyzing', next === State.DOING || next === State.LOADING || next === State.PAUSED);
  if (stageEl) stageEl.classList.toggle('analyzing', next === State.DOING || next === State.PAUSED);

  // Show stop button when agent is working
  if (pillStopBtn) {
    const working = next === State.DOING || next === State.LOADING || next === State.PAUSED;
    pillStopBtn.classList.toggle('hidden', !working);
  }
}

function clearCommandContext() {
  app.detectedApp = "";
  app.actionMessage = "Processing...";
  appIconEl.src = "";
  appIconEl.style.display = 'none';
  app.currentPlanId = null;
  app.automationLockToolCount = 0;
  void setAutomationLock(false);
}

function setMouseEnabled(enabled) {
  const next = Boolean(enabled);
  if (app.mouseEnabled === next) return;
  app.mouseEnabled = next;
  next ? bridge.enableMouse() : bridge.disableMouse();
  document.body.classList.toggle('mouse-enabled', next);
}

async function setAutomationLock(active, label = "CIARA is controlling the screen") {
  const next = Boolean(active);
  app.automationLock = next;
  if (automationLockEl) automationLockEl.classList.toggle("hidden", !next);
  if (automationLockLabelEl) automationLockLabelEl.textContent = label;
  setMouseEnabled(isOverInteractive({ clientX: lastPointer.x, clientY: lastPointer.y }));
  try {
    await bridge.setAutomationLock?.(next);
  } catch (err) {
    console.warn("[AutomationLock] main-process sync failed:", err);
  }
}

function isAutomationMutatingTool(toolName) {
  return new Set([
    "click_ui",
    "type_in_field",
    "type_text",
    "press_key",
    "run_shortcut",
    "click_element",
    "hover_element",
    "mouse_action",
    "browser_click_ref",
    "browser_type_ref",
    "browser_select_ref",
    "browser_click_match",
    "find_and_act",
    "open_app",
    "open_url",
  ]).has(String(toolName || "").trim());
}

function openCommandPanel(prefill = "") {
  if (!commandPanel || !commandInput) return;
  app.commandPanelOpen = true;
  commandPanel.classList.remove("hidden");
  if (prefill) commandInput.value = prefill;
  setMouseEnabled(true);
  requestAnimationFrame(() => {
    commandInput.focus();
    const end = commandInput.value.length;
    commandInput.setSelectionRange(end, end);
  });
}

function closeCommandPanel({ clear = false } = {}) {
  if (!commandPanel || !commandInput) return;
  app.commandPanelOpen = false;
  commandPanel.classList.add("hidden");
  if (clear) commandInput.value = "";
  commandInput.blur();
  setMouseEnabled(false);
}

function isWebSocketOpen() {
  return app.ws && app.ws.readyState === WebSocket.OPEN;
}

function waitForWebSocketOpen(timeoutMs = 12000) {
  if (isWebSocketOpen()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (isWebSocketOpen()) {
        resolve(true);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }

      window.setTimeout(check, 200);
    };

    connectWebSocket();
    check();
  });
}

async function ensureBackendConnection() {
  if (isWebSocketOpen()) return true;

  try {
    await bridge.startBackend?.();
  } catch (err) {
    console.warn("[Backend] startBackend failed before quick command:", err);
  }

  connectWebSocket();
  return waitForWebSocketOpen();
}

async function submitCommandPanel() {
  if (!commandInput) return;
  const text = (commandInput.value || "").trim();
  if (!text) {
    commandInput.focus();
    return;
  }

  if (app.commandSending) return;
  app.commandSending = true;

  if (!isWebSocketOpen()) {
    setState(State.DOING, { text: "Connecting CIARA...", variant: "", force: true });
  }

  const connected = await ensureBackendConnection();
  if (!connected) {
    app.commandSending = false;
    showResponseCard("CIARA is still starting. Try again once setup finishes.");
    commandInput.focus();
    return;
  }

  try {
    app.ws.send(JSON.stringify({
      type: "text_input",
      text,
    }));
  } catch (err) {
    app.commandSending = false;
    console.warn("[WS] Quick command send failed:", err);
    showResponseCard("CIARA disconnected while sending. Try again.");
    commandInput.focus();
    return;
  }

  commandInput.value = "";
  closeCommandPanel();
  dismissAllModals(true);
  setState(State.LOADING, { force: true });
  app.commandSending = false;
}

/* ── Response Card: Streaming Text ── */

/* ── Lightweight Markdown → HTML renderer (with KaTeX math) ── */
function setWindowMaximizedUI(isMaximized) {
  if (!appWindowMaximize) return;
  const maximized = Boolean(isMaximized);
  appWindowMaximize.classList.toggle("is-maximized", maximized);
  appWindowMaximize.setAttribute("aria-label", maximized ? "Restore window" : "Maximize window");
  appWindowMaximize.setAttribute("title", maximized ? "Restore" : "Maximize");
  appWindowMaximize.querySelector(".window-icon-maximize")?.classList.toggle("hidden", maximized);
  appWindowMaximize.querySelector(".window-icon-restore")?.classList.toggle("hidden", !maximized);
}

if (appWindowMinimize) {
  appWindowMinimize.addEventListener("click", (event) => {
    event.stopPropagation();
    void bridge.minimizeWindow?.();
  });
}

if (appWindowMaximize) {
  appWindowMaximize.addEventListener("click", async (event) => {
    event.stopPropagation();
    const isMaximized = await bridge.toggleMaximizeWindow?.();
    setWindowMaximizedUI(isMaximized);
  });
}

if (appWindowClose) {
  appWindowClose.addEventListener("click", (event) => {
    event.stopPropagation();
    void bridge.closeWindow?.();
  });
}

if (bridge.onWindowMaximizedChange) {
  bridge.onWindowMaximizedChange(setWindowMaximizedUI);
}

if (bridge.isWindowMaximized) {
  bridge.isWindowMaximized().then(setWindowMaximizedUI).catch(() => {});
}

function renderMarkdown(text) {
  // ── 0. Extract math blocks before any other processing ──
  // We replace them with unique placeholders so markdown processing
  // (HTML escaping, bold/italic) doesn't mangle LaTeX.
  const mathSlots = [];
  function stashMath(latex, displayMode) {
    const idx = mathSlots.length;
    try {
      mathSlots.push(katex.renderToString(latex, {
        throwOnError: false,
        displayMode: displayMode,
        output: 'html',
      }));
    } catch (_) {
      // Fallback: show the raw LaTeX in a code span
      mathSlots.push(`<code>${latex}</code>`);
    }
    return `\x00MATH${idx}\x00`;
  }

  // Display math: $$...$$  (possibly multi-line)
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => stashMath(latex.trim(), true));
  // Inline math: $...$  (single line, non-greedy)
  text = text.replace(/\$([^$\n]+?)\$/g, (_, latex) => stashMath(latex.trim(), false));

  // ── 1. Escape HTML entities ──
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```lang ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold + Italic (***text***)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold (**text**)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Headings (### h3, ## h2, # h1) — only at line start
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-heading">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-heading">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-heading">$1</h2>');

  // Horizontal rule (--- or ***)
  html = html.replace(/^(\*{3,}|-{3,})$/gm, '<hr class="md-hr">');

  // Now split into lines for block-level processing (lists & paragraphs)
  const lines = html.split('\n');
  let result = [];
  let inOl = false;
  let inUl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    const ulMatch = line.match(/^[-*•]\s+(.+)$/);

    if (olMatch) {
      if (!inOl) { result.push('<ol class="md-list">'); inOl = true; }
      if (inUl) { result.push('</ul>'); inUl = false; }
      result.push(`<li>${olMatch[2]}</li>`);
    } else if (ulMatch) {
      if (!inUl) { result.push('<ul class="md-list">'); inUl = true; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      result.push(`<li>${ulMatch[1]}</li>`);
    } else {
      if (inOl) { result.push('</ol>'); inOl = false; }
      if (inUl) { result.push('</ul>'); inUl = false; }
      // Preserve blank lines as spacing, non-blank lines as paragraphs
      if (line.trim() === '') {
        result.push('<div class="md-spacer"></div>');
      } else if (line.startsWith('<h') || line.startsWith('<pre') || line.startsWith('<hr')) {
        result.push(line);
      } else {
        result.push(`<p class="md-paragraph">${line}</p>`);
      }
    }
  }
  if (inOl) result.push('</ol>');
  if (inUl) result.push('</ul>');

  let output = result.join('\n');

  // ── Restore math placeholders → rendered KaTeX HTML ──
  output = output.replace(/\x00MATH(\d+)\x00/g, (_, idx) => mathSlots[parseInt(idx, 10)]);

  return output;
}

function showResponseCard(fullText, awaitInput = false) {
  // Cancel any pending timers
  if (app.streamTimer) {
    clearInterval(app.streamTimer);
    app.streamTimer = null;
  }
  if (app.autoResetTimer) {
    clearTimeout(app.autoResetTimer);
    app.autoResetTimer = null;
  }

  // Reset
  responseTextEl.innerHTML = '';
  responseCursorEl.classList.remove('hidden');

  // Tokenize into words, preserving whitespace & newlines as separate tokens
  const tokens = fullText.match(/\S+|\n| +/g) || [fullText];
  let tokenIdx = 0;
  let visibleText = '';

  // Show card
  uiResponse.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });

  // ── Word-by-word streaming with live markdown formatting ──
  const WORD_DELAY = 35; // ms per token
  app.streamTimer = setInterval(() => {
    if (tokenIdx >= tokens.length) {
      // ── Done ──
      clearInterval(app.streamTimer);
      app.streamTimer = null;
      responseTextEl.innerHTML = renderMarkdown(fullText);
      responseCursorEl.classList.add('hidden');

      if (awaitInput || app.conversationMode) {
        setIslandState('state-listening');
        switchContent(uiListening);
        typewriterText.innerText = "Listening...";
        app.current = State.LISTENING;
        app.autoResetTimer = setTimeout(() => {
          dismissResponseCard();
          setState(State.IDLE, { force: true });
          clearCommandContext();
          app.autoResetTimer = null;
        }, app.conversationMode ? 120000 : 30000);
      } else {
        setIslandState('state-idle');
        switchContent(uiIdle);
        statusEl.innerText = "Hey CIARA";
        app.autoResetTimer = setTimeout(() => {
          dismissResponseCard();
          app.current = State.IDLE;
          clearCommandContext();
          app.autoResetTimer = null;
        }, 10000);
      }
      return;
    }

    visibleText += tokens[tokenIdx];
    tokenIdx++;

    // Render the visible portion as formatted markdown
    responseTextEl.innerHTML = renderMarkdown(visibleText);
    uiResponse.scrollTop = uiResponse.scrollHeight;
  }, WORD_DELAY);
}

function dismissResponseCard(instant = false) {
  // Stop any ongoing stream
  if (app.streamTimer) {
    clearInterval(app.streamTimer);
    app.streamTimer = null;
  }

  if (instant || uiResponse.classList.contains('hidden')) {
    uiResponse.classList.add('hidden');
    uiResponse.classList.remove('dismissing');
    return;
  }

  // Animate out
  uiResponse.classList.add('dismissing');
  setTimeout(() => {
    uiResponse.classList.add('hidden');
    uiResponse.classList.remove('dismissing');
  }, 300);
}

// Dismiss button
responseDismissEl.addEventListener('click', () => {
  if (app.autoResetTimer) {
    clearTimeout(app.autoResetTimer);
    app.autoResetTimer = null;
  }
  dismissResponseCard();
  dismissAllModals();
  setState(State.IDLE, { force: true });
  clearCommandContext();
});

// Stop-task button on pill
if (pillStopBtn) {
  pillStopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelActiveTask();
  });
}

if (commandSend) {
  commandSend.addEventListener("click", () => {
    submitCommandPanel();
  });
}

if (commandClose) {
  commandClose.addEventListener("click", () => {
    closeCommandPanel();
  });
}

if (commandInput) {
  commandInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitCommandPanel();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   MODAL SYSTEM — Type-specific renderers
   ═══════════════════════════════════════════════════════════════ */

/** Dismiss every modal and reset to idle */
function dismissAllModals(instant = false) {
  ALL_MODALS.forEach(el => {
    if (instant || el.classList.contains('hidden')) {
      el.classList.add('hidden');
      el.classList.remove('dismissing');
    } else {
      el.classList.add('dismissing');
      setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('dismissing');
      }, 300);
    }
  });
  // Restore response dismiss button visibility (hidden during multi-modal stacking)
  responseDismissEl.style.display = '';
}

/** Wire dismiss buttons for all non-text modals */
[richDismiss, tableDismiss, listDismiss, confirmDismiss, mediaDismiss, stepsDismiss, productsDismiss].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (btn === stepsDismiss && modalSteps.classList.contains('mode-plan')) {
      if (app.ws && app.ws.readyState === WebSocket.OPEN) {
        app.ws.send(JSON.stringify({
          type: 'user_action',
          action: 'cancel_plan',
          plan_id: app.currentPlanId || undefined,
        }));
      }
    }
    if (app.autoResetTimer) { clearTimeout(app.autoResetTimer); app.autoResetTimer = null; }
    dismissAllModals();
    setState(State.IDLE, { force: true });
    clearCommandContext();
  });
});

/** Schedule auto-dismiss after a modal is shown */
function scheduleModalAutoDismiss(awaitInput, delayMs) {
  if (app.autoResetTimer) { clearTimeout(app.autoResetTimer); app.autoResetTimer = null; }
  const timeout = delayMs || (awaitInput ? 30000 : 12000);
  app.autoResetTimer = setTimeout(() => {
    dismissAllModals();
    setState(State.IDLE, { force: true });
    clearCommandContext();
    app.autoResetTimer = null;
  }, timeout);
}

/** Modal types that stay on screen until manually dismissed */
const PERSISTENT_MODALS = new Set(['plan', 'confirm']);

/**
 * Master entry-point for all response modals.
 * Called from the WS message handler. Parses the payload and dispatches
 * to the right modal renderer.
 */
function showResponseModal(payload, awaitInput = false) {
  // Dismiss everything first
  dismissAllModals(true);
  dismissResponseCard(true);

  // Parse structured payload — may be a JSON string from the tool
  let data = payload;
  if (typeof payload === 'string') {
    try { data = JSON.parse(payload); } catch { data = { message: payload, modal: 'text' }; }
  }

  // ── Multi-modal: array of stacked modals ──
  if (data.modals && Array.isArray(data.modals)) {
    app._skipAfterModalShow = true;
    let hasPersistent = false;

    data.modals.forEach(modalDef => {
      const type = modalDef.modal || 'text';
      if (PERSISTENT_MODALS.has(type)) hasPersistent = true;
      dispatchModal(modalDef, awaitInput);
    });

    app._skipAfterModalShow = false;
    setState(State.RESPONDING, { force: true });
    afterModalShow(awaitInput || hasPersistent, undefined, hasPersistent);
    return;
  }

  // ── Single modal ──
  dispatchModal(data, awaitInput);
}

/** Route a single modal definition to its renderer */
function dispatchModal(data, awaitInput) {
  const modalType = data.modal || 'text';
  const message = data.message || data.text || '';

  switch (modalType) {
    case 'rich':
      showRichModal(data, awaitInput);
      break;
    case 'table':
      showTableModal(data, awaitInput);
      break;
    case 'list':
      showListModal(data, awaitInput);
      break;
    case 'confirm':
      showConfirmModal(data, awaitInput);
      break;
    case 'media':
      showMediaModal(data, awaitInput);
      break;
    case 'steps':
      showStepsModal(data, awaitInput);
      break;
    case 'plan':
      data._planMode = true;
      showStepsModal(data, true);
      break;
    case 'cards':
    case 'products':
      showProductsModal(data, awaitInput);
      break;
    case 'text':
    default:
      if (app._skipAfterModalShow) {
        // Multi-modal text: show instantly (no streaming), hide its own dismiss
        responseTextEl.innerHTML = renderMarkdown(message);
        responseCursorEl.classList.add('hidden');
        responseDismissEl.style.display = 'none';
        uiResponse.classList.remove('hidden', 'dismissing');
      } else {
        responseDismissEl.style.display = '';
        showResponseCard(message, awaitInput);
      }
      break;
  }
}

/* ── Rich Modal ── */
function showRichModal(data, awaitInput) {
  richTitle.textContent = data.title || '';
  richTitle.style.display = data.title ? '' : 'none';
  richBody.innerHTML = renderMarkdown(data.message || '');

  modalRich.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });
  if (!app._skipAfterModalShow) afterModalShow(awaitInput, 15000);
}

/* ── Table Modal ── */
function showTableModal(data, awaitInput) {
  tableTitle.textContent = data.title || '';
  tableTitle.style.display = data.title ? '' : 'none';

  // Render header
  tableHead.innerHTML = '';
  if (data.headers && data.headers.length) {
    const tr = document.createElement('tr');
    data.headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      tr.appendChild(th);
    });
    tableHead.appendChild(tr);
  }

  // Render rows
  tableBody.innerHTML = '';
  if (data.rows && data.rows.length) {
    data.rows.forEach(row => {
      const tr = document.createElement('tr');
      (Array.isArray(row) ? row : [row]).forEach(cell => {
        const td = document.createElement('td');
        td.textContent = String(cell);
        tr.appendChild(td);
      });
      tableBody.appendChild(tr);
    });
  }

  // Footer message
  tableFooter.innerHTML = data.message ? renderMarkdown(data.message) : '';
  tableFooter.style.display = data.message ? '' : 'none';

  modalTable.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });
  if (!app._skipAfterModalShow) afterModalShow(awaitInput, 15000);
}

/* ── List Modal ── */
function showListModal(data, awaitInput) {
  listTitle.textContent = data.title || '';
  listTitle.style.display = data.title ? '' : 'none';

  listMessage.innerHTML = data.message ? renderMarkdown(data.message) : '';
  listMessage.style.display = data.message ? '' : 'none';

  listItems.innerHTML = '';
  (data.items || []).forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'modal-list-card';
    // Use explicit icon if provided, otherwise auto-number
    const indicator = item.icon
      ? `<span class="list-card-icon">${escapeHtml(item.icon)}</span>`
      : `<span class="list-card-num">${idx + 1}</span>`;
    card.innerHTML = `
      ${indicator}
      <div class="list-card-body">
        <div class="list-card-title">${escapeHtml(item.title)}</div>
        ${item.description ? `<div class="list-card-desc">${escapeHtml(item.description)}</div>` : ''}
      </div>
    `;
    listItems.appendChild(card);
  });

  modalList.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });
  if (!app._skipAfterModalShow) afterModalShow(awaitInput, 15000);
}

/* ── Confirm Modal ── */
function showConfirmModal(data, awaitInput) {
  confirmBody.innerHTML = renderMarkdown(data.message || '');

  confirmActions.innerHTML = '';
  (data.actions || []).forEach((action, i) => {
    const btn = document.createElement('button');
    btn.className = i === 0 ? 'modal-confirm-btn primary' : 'modal-confirm-btn secondary';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      // Send the choice back via WS
      if (app.ws && app.ws.readyState === WebSocket.OPEN) {
        app.ws.send(JSON.stringify({
          type: "user_action",
          action: action.value
        }));
      }
      dismissAllModals();
      setState(State.LOADING, { force: true });
    });
    confirmActions.appendChild(btn);
  });

  modalConfirm.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });
  // Confirm modals are persistent — stay until user picks or dismisses
  if (!app._skipAfterModalShow) afterModalShow(true, 60000, true);
}

/* ── Media Modal ── */
function showMediaModal(data, awaitInput) {
  mediaMessage.innerHTML = data.message ? renderMarkdown(data.message) : '';
  mediaMessage.style.display = data.message ? '' : 'none';

  mediaImg.src = data.media_url || '';
  mediaImg.alt = data.caption || 'Image';
  mediaCaption.textContent = data.caption || '';
  mediaCaption.style.display = data.caption ? '' : 'none';

  modalMedia.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });
  if (!app._skipAfterModalShow) afterModalShow(awaitInput, 15000);
}

/* ── Steps Modal (dual mode: progress / plan) ── */
function showStepsModal(data, awaitInput) {
  const isPlan = data._planMode || data.steps_mode === 'plan' || data.modal === 'plan';
  const stepsList = data.steps || [];
  app.currentPlanId = isPlan ? (data.plan_id || null) : null;

  // ── Mode class on container ──
  modalSteps.classList.remove('mode-progress', 'mode-plan');
  modalSteps.classList.add(isPlan ? 'mode-plan' : 'mode-progress');

  // ── Title & subtitle ──
  if (isPlan) {
    // Plan modal: headerless — pair with a text bubble above for context
    stepsTitle.style.display = 'none';
    stepsSubtitle.style.display = 'none';
    stepsMessage.style.display = 'none';
  } else {
    stepsTitle.textContent = data.title || 'Task Progress';
    stepsTitle.style.display = '';
    const done = stepsList.filter(s => s.status === 'done').length;
    if (stepsList.length > 0) {
      stepsSubtitle.textContent = `${done} of ${stepsList.length} complete`;
      stepsSubtitle.style.display = '';
    } else {
      stepsSubtitle.style.display = 'none';
    }
  }

  // ── Message (only for progress mode) ──
  if (!isPlan && data.message) {
    stepsMessage.innerHTML = renderMarkdown(data.message);
    stepsMessage.style.display = '';
  } else if (!isPlan) {
    stepsMessage.style.display = 'none';
  }

  // ── Timeline / Plan items ──
  stepsTimeline.innerHTML = '';
  stepsList.forEach((step, i) => {
    const el = document.createElement('div');
    if (isPlan) {
      // Card-row style for plan items
      el.className = 'modal-step-item planned';
      el.style.animationDelay = `${i * 50}ms`;
      el.innerHTML = `
        <div class="step-plan-num">${i + 1}</div>
        <div class="step-body">
          <div class="step-label">${escapeHtml(step.label)}</div>
          ${step.detail ? `<div class="step-detail">${escapeHtml(step.detail)}</div>` : ''}
        </div>
      `;
    } else {
      el.className = `modal-step-item ${step.status}`;
      const icon = step.status === 'done' ? 'OK' : step.status === 'current' ? 'NOW' : '...';
      el.innerHTML = `
        <div class="step-indicator">${icon}</div>
        <div class="step-body">
          <div class="step-label">${escapeHtml(step.label)}</div>
          ${step.detail ? `<div class="step-detail">${escapeHtml(step.detail)}</div>` : ''}
        </div>
      `;
    }
    stepsTimeline.appendChild(el);
  });

  // ── Plan actions ──
  if (isPlan) {
    stepsActions.innerHTML = '';

    const startBtn = document.createElement('button');
    startBtn.className = 'modal-steps-btn-start';
    startBtn.innerHTML = `Proceed
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
      </svg>`;
    startBtn.addEventListener('click', () => {
      if (app.ws && app.ws.readyState === WebSocket.OPEN) {
        app.ws.send(JSON.stringify({
          type: 'user_action',
          action: 'approve_plan',
          plan_id: app.currentPlanId || undefined,
        }));
      }
      dismissAllModals();
      setState(State.LOADING, { force: true });
    });

    stepsActions.appendChild(startBtn);
    stepsActions.classList.remove('hidden');
  } else {
    stepsActions.classList.add('hidden');
  }

  modalSteps.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });

  if (!app._skipAfterModalShow) {
    if (isPlan) {
      // Plan is persistent — stays until user approves, modifies, or cancels
      afterModalShow(true, undefined, true);
    } else {
      afterModalShow(awaitInput, 15000);
    }
  }
}

/* ── Cards Modal (general-purpose image+text cards) ── */
function showProductsModal(data, awaitInput) {
  // Accept both 'cards' (new) and 'products' (legacy) item arrays
  const items = data.cards || data.products || [];

  // ── Header ──
  if (data.title) {
    productsTitle.textContent = data.title;
    productsTitle.style.display = '';
  } else {
    productsTitle.style.display = 'none';
  }
  if (items.length > 0 && data.subtitle) {
    productsSubtitle.textContent = data.subtitle;
    productsSubtitle.style.display = '';
  } else if (items.length > 0) {
    productsSubtitle.textContent = `${items.length} result${items.length !== 1 ? 's' : ''}`;
    productsSubtitle.style.display = '';
  } else {
    productsSubtitle.style.display = 'none';
  }

  // ── Message ──
  productsMessage.innerHTML = data.message ? renderMarkdown(data.message) : '';
  productsMessage.style.display = data.message ? '' : 'none';

  // ── Sidebar (removed — keep it hidden) ──
  modalProducts.classList.remove('has-sidebar');
  productsSidebar.classList.add('hidden');

  // ── Cards ──
  productsGrid.innerHTML = '';
  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'card-item';
    card.style.animationDelay = `${idx * 50}ms`;
    if (item.url || item.link) card.classList.add('has-link');

    // ── Image ──
    let imgHtml = '';
    if (item.image) {
      imgHtml = `<div class="card-img-wrap"><img class="card-img" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name || item.title || '')}" loading="lazy" /></div>`;
    }

    // ── Title ──
    const title = item.name || item.title || '';

    // ── Description ──
    let descHtml = '';
    if (item.description) {
      descHtml = `<div class="card-desc">${escapeHtml(item.description)}</div>`;
    }

    // ── Meta line: price, rating, source ──
    let metaParts = [];
    if (item.price) {
      const priceClass = item.original_price ? 'card-price on-sale' : 'card-price';
      let priceStr = `<span class="${priceClass}">${escapeHtml(item.price)}</span>`;
      if (item.original_price) {
        priceStr += `<span class="card-price-original">${escapeHtml(item.original_price)}</span>`;
      }
      metaParts.push(priceStr);
    }
    if (item.rating != null) {
      const full = Math.floor(item.rating);
      const half = item.rating % 1 >= 0.5 ? 1 : 0;
      const empty = 5 - full - half;
      let stars = '<span class="card-stars">'
        + '★'.repeat(full) + (half ? '⯨' : '') + '<span class="star-empty">' + '★'.repeat(empty) + '</span>'
        + `</span> <span class="card-rating-num">${item.rating}</span>`;
      if (item.reviews) stars += ` <span class="card-reviews">(${escapeHtml(String(item.reviews))})</span>`;
      metaParts.push(stars);
    }
    if (item.source) {
      metaParts.push(`<span class="card-source">${escapeHtml(item.source)}</span>`);
    }
    const metaHtml = metaParts.length ? `<div class="card-meta">${metaParts.join('<span class="card-meta-sep">·</span>')}</div>` : '';

    // ── Link / CTA ──
    const linkUrl = item.url || item.link || '';
    let linkHtml = '';
    if (linkUrl) {
      const linkLabel = item.link_label || 'View';
      linkHtml = `<div class="card-link" data-url="${escapeHtml(linkUrl)}">
        <span>${escapeHtml(linkLabel)}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
      </div>`;
    }

    card.innerHTML = `
      ${imgHtml}
      <div class="card-body">
        <div class="card-title">${escapeHtml(title)}</div>
        ${descHtml}
        ${metaHtml}
        ${linkHtml}
      </div>
    `;

    // Link click handler
    const linkEl = card.querySelector('.card-link');
    if (linkEl) {
      linkEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (app.ws && app.ws.readyState === WebSocket.OPEN) {
          app.ws.send(JSON.stringify({ type: 'open_url', url: linkUrl }));
        }
      });
    }

    // Whole-card click if has link
    if (linkUrl) {
      card.addEventListener('click', () => {
        if (app.ws && app.ws.readyState === WebSocket.OPEN) {
          app.ws.send(JSON.stringify({ type: 'open_url', url: linkUrl }));
        }
      });
    }

    productsGrid.appendChild(card);
  });

  modalProducts.classList.remove('hidden', 'dismissing');
  setState(State.RESPONDING, { force: true });
  if (!app._skipAfterModalShow) afterModalShow(awaitInput, 20000);
}

/** Shared post-show: set island state + schedule dismiss
 *  persistent = true → modal stays until manually dismissed (no timer) */
function afterModalShow(awaitInput, defaultTimeout, persistent = false) {
  if (awaitInput || app.conversationMode) {
    setIslandState('state-listening');
    switchContent(uiListening);
    typewriterText.innerText = "Listening...";
    app.current = State.LISTENING;
    if (!persistent) scheduleModalAutoDismiss(true, app.conversationMode ? 120000 : 30000);
  } else {
    setIslandState('state-idle');
    switchContent(uiIdle);
    statusEl.innerText = "Hey CIARA";
    if (!persistent) scheduleModalAutoDismiss(false, defaultTimeout);
  }
}

/* ── Audio Encoding (PCM to Base64 WAV) ── */

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    // Clamp between -1 and 1
    const s = Math.max(-1, Math.min(1, input[i]));
    // Convert to 16-bit integer (multiply by 0x7FFF)
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Packages the raw Float32Array PCM chunk into a full WAV file Buffer
function encodeWAVChunk(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true);              // NumChannels (1: mono)
  view.setUint32(24, sampleRate, true);     // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true);              // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true);             // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write the PCM samples
  floatTo16BitPCM(view, 44, samples);

  return buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/* ── Continuous Microphone Streaming ── */

async function startAudioStreaming() {
  if (app.audioStream) return; // Already running

  try {
    app.audioStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    app.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000 // Force 16kHz for backend speech models
    });

    // We use ScriptProcessorNode because it's the easiest cross-platform way 
    // to access raw PCM data without AudioWorklet complexity.
    app.sourceNode = app.audioContext.createMediaStreamSource(app.audioStream);
    // Higher frequency chunks for lower latency (1024 samples @ 16kHz = 64ms)
    app.scriptProcessor = app.audioContext.createScriptProcessor(1024, 1, 1);

    app.scriptProcessor.onaudioprocess = (event) => {
      // Only stream mic audio while CIARA is waiting/listening. During agent work
      // the backend is busy and cannot drain continuous audio chunks, which can
      // otherwise clog the websocket and make the overlay appear disconnected.
      if (!shouldStreamAudioChunk()) return;

      const inputBuffer = event.inputBuffer.getChannelData(0); // Mono Float32Array
      const sampleRate = app.audioContext.sampleRate; // Typically 16000 here

      // Pack into a WAV wrapper
      const wavBuffer = encodeWAVChunk(inputBuffer, sampleRate);

      // Convert to base64
      const base64Audio = arrayBufferToBase64(wavBuffer);

      // Stream to Python Backend
      try {
        app.ws.send(JSON.stringify({
          type: "audio_chunk",
          payload: base64Audio
        }));
      } catch (err) {
        console.warn("[WS] Dropped audio chunk after websocket closed:", err);
        scheduleReconnect();
      }
    };

    app.sourceNode.connect(app.scriptProcessor);
    app.scriptProcessor.connect(app.audioContext.destination);

    console.log("Started continuous audio streaming at 16kHz");
  } catch (err) {
    console.error("Failed to access microphone:", err);
    statusEl.innerText = "Mic Error";
    if (bridge.logError) {
      bridge.logError(`Mic Access Failed: ${err.message}`);
    }
  }
}

async function stopAudioStreaming() {
  if (app.scriptProcessor) {
    app.scriptProcessor.disconnect();
    app.scriptProcessor = null;
  }
  if (app.sourceNode) {
    app.sourceNode.disconnect();
    app.sourceNode = null;
  }
  if (app.audioContext) {
    await app.audioContext.close();
    app.audioContext = null;
  }
  if (app.audioStream) {
    app.audioStream.getTracks().forEach(track => track.stop());
    app.audioStream = null;
  }
}


/* ── TTS Audio Playback ── */

function getTTSContext() {
  if (!app.ttsAudioContext || app.ttsAudioContext.state === 'closed') {
    app.ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return app.ttsAudioContext;
}

async function handleTTSChunk(data) {
  try {
    const audioBytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
    const ctx = getTTSContext();
    const audioBuffer = await ctx.decodeAudioData(audioBytes.buffer.slice(0));
    app.ttsQueue.push(audioBuffer);

    // Start playing if not already
    if (!app.ttsPlaying) {
      playNextTTSChunk();
    }
  } catch (err) {
    console.error('[TTS] Decode error:', err);
  }
}

function playNextTTSChunk() {
  if (app.ttsQueue.length === 0) {
    app.ttsPlaying = false;
    app.ttsCurrentSource = null;
    // Remove speaking variant
    wrapper.classList.remove('variant-speaking');
    // Notify backend TTS playback is done
    if (app.ws && app.ws.readyState === WebSocket.OPEN) {
      app.ws.send(JSON.stringify({ type: 'tts_done' }));
    }
    return;
  }

  app.ttsPlaying = true;
  wrapper.classList.add('variant-speaking');

  const ctx = getTTSContext();
  const buffer = app.ttsQueue.shift();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => playNextTTSChunk();
  source.start(0);
  app.ttsCurrentSource = source;
}

function stopTTS() {
  app.ttsQueue = [];
  if (app.ttsCurrentSource) {
    try { app.ttsCurrentSource.stop(); } catch {}
    app.ttsCurrentSource = null;
  }
  app.ttsPlaying = false;
  wrapper.classList.remove('variant-speaking');
}

/* ── Cancel / Stop Active Task ── */

function cancelActiveTask() {
  if (!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
  app.ws.send(JSON.stringify({ type: 'cancel_task' }));
  stopTTS();
}

/* ── Conversation Mode Toggle ── */

function toggleConversationMode() {
  if (!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
  app.conversationMode = !app.conversationMode;
  app.ws.send(JSON.stringify({ type: 'toggle_conversation_mode' }));
}


/* ── WebSocket ── */

function scheduleReconnect() {
  if (app.isDisposed || app.reconnectTimer) return;
  app.reconnectTimer = window.setTimeout(() => {
    app.reconnectTimer = null;
    if (!app.isDisposed) connectWebSocket();
  }, app.reconnectDelay);
  app.reconnectDelay = Math.min(Math.round(app.reconnectDelay * 1.6), app.reconnectMaxDelay);
}

function connectWebSocket() {
  if (app.isDisposed) return;
  if (app.ws && (app.ws.readyState === WebSocket.OPEN || app.ws.readyState === WebSocket.CONNECTING)) return;

  try {
    app.ws = new WebSocket(WS_URL);
    app.ws.addEventListener("open", () => {
      clearConnectionLostTimer();
      app.reconnectDelay = 700;
      statusEl.innerText = "Hey CIARA";
      if (app.wasReconnectingDuringWork) {
        app.wasReconnectingDuringWork = false;
        clearWorkWatchdog();
        setState(State.IDLE, { force: true });
        clearCommandContext();
      }
      // (Re-)start audio streaming now that the WS is connected.
      // This handles the case where getUserMedia failed at boot (before
      // mic permission was granted during onboarding) or where the WS
      // reconnected after a disconnect.
      startAudioStreaming();
    });

    app.ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      console.log("[WS] Received:", msg);

      if (msg.type === "task_event") {
        if (msg.phase === "start") {
          app.currentTaskId = msg.taskId || null;
        } else if (msg.phase === "cancelled") {
          app.automationLockToolCount = 0;
          void setAutomationLock(false);
        } else if (msg.taskId && msg.taskId === app.currentTaskId) {
          app.currentTaskId = null;
          app.automationLockToolCount = 0;
          void setAutomationLock(false);
        }
        return;
      }

      if (msg.taskId && app.currentTaskId && msg.taskId !== app.currentTaskId) {
        console.debug("[WS] Ignoring stale task message:", msg.taskId, "current:", app.currentTaskId);
        return;
      }

      if (msg.type === "tool_event") {
        const mutating = isAutomationMutatingTool(msg.tool);
        if (msg.phase === "start") {
          if (mutating) {
            app.automationLockToolCount += 1;
            void setAutomationLock(true, `CIARA is controlling: ${msg.tool}`);
          }
          setState(State.DOING, {
            text: msg.tool ? `Running ${msg.tool}` : "Working...",
            force: true
          });
        } else if (msg.phase === "paused") {
          clearWorkWatchdog();
          setState(State.PAUSED, {
            text: msg.message || "Paused: the screen did not visibly change",
            force: true
          });
          showResponseCard(msg.message || "CIARA paused because the last action did not visibly change the screen.");
        } else if (msg.phase === "result" && mutating) {
          app.automationLockToolCount = Math.max(0, app.automationLockToolCount - 1);
          if (app.automationLockToolCount === 0) {
            void setAutomationLock(false);
          }
        }
        return;
      }

      if (msg.type === "automation_cursor") {
        handleAutomationCursor(msg.payload || msg);
        return;
      }

      // ── Agent message types ──

      // 1. "thinking" — Agent is reasoning (show bouncing dots)
      if (msg.type === "thinking" || msg.type === "progress" || msg.state === "state-loading") {
        setState(State.LOADING, { force: true });
        return;
      }

      // 2. "doing" — Agent is executing a tool (show spinner + action text)
      if (msg.type === "doing") {
        // Cancel any pending auto-reset so sequential tool steps show properly
        if (app.autoResetTimer) {
          clearTimeout(app.autoResetTimer);
          app.autoResetTimer = null;
        }
        setState(State.DOING, {
          text: msg.text || "Working...",
          appName: msg.app || "",
          iconUrl: msg.icon_url || "",
          variant: msg.variant || "",
          force: true
        });
        return;
      }

      // 3. "response" — Agent finished, show final answer (routed through modal system)
      if (msg.type === "response" || msg.type === "action") {
        let payload = msg.payload || {};
        

        
        const text = payload.text || payload.message || "Done!";
        const awaitInput = payload.await_input || false;
        app.detectedApp = payload.app || "";

        // If payload contains structured modal data, route through modal system
        if (payload.modal_data || payload.modal) {
          showResponseModal(payload.modal_data || payload, awaitInput);
        } else {
          // Legacy: plain text → default text card
          showResponseCard(text, awaitInput);
        }
        return;
      }

      // 3a. "ack" — Quick acknowledgment before work starts
      if (msg.type === "ack") {
        const ackText = msg.text || "On it";
        // Briefly show ack text in the pill during loading transition
        doingTextEl.innerText = ackText;
        setState(State.DOING, { text: ackText, variant: "", force: true });
        // Auto-transition to loading after a beat
        setTimeout(() => {
          if (app.current === State.DOING && doingTextEl.innerText === ackText) {
            setState(State.LOADING, { force: true });
          }
        }, 800);
        return;
      }

      // 3b. TTS audio streaming
      if (msg.type === "tts_chunk") {
        handleTTSChunk(msg);
        return;
      }
      if (msg.type === "tts_stop") {
        stopTTS();
        return;
      }
      if (msg.type === "tts_done" && !app.ttsPlaying) {
        // Backend says TTS is done sending — queue is already empty
        return;
      }

      // 3c. "conversation_mode" — Toggle persistent listening mode
      if (msg.type === "conversation_mode") {
        app.conversationMode = !!msg.enabled;
        return;
      }

      // 4. "status" — Direct state transitions (idle, listening, etc.)
      const stateStr = msg.state || (msg.type === "status" ? msg.state : null);
      if (stateStr) {
        if (app.autoResetTimer) {
          clearTimeout(app.autoResetTimer);
          app.autoResetTimer = null;
        }
        const nextState = State[stateStr.toUpperCase().replace("STATE-", "")];
        if (nextState) {
          setState(nextState, { force: true });
          if (nextState === State.IDLE) clearCommandContext();
        }
      }

    });

    app.ws.addEventListener("error", (err) => {
      console.error("[WS] Connection Error:", err);
      if (bridge.logError) {
        bridge.logError("WebSocket connection failed to ws://127.0.0.1:8000/ws");
      }
    });

    app.ws.addEventListener("close", (e) => {
      console.warn("[WS] Connection Closed:", e.code, e.reason);
      if (bridge.logError) {
        bridge.logError(`WebSocket closed: ${e.code} ${e.reason}`);
      }
      const wasQuietClose = app.suppressNextSocketCloseNotice || app.isDisposed;
      app.suppressNextSocketCloseNotice = false;
      app.ws = null;
      if (wasQuietClose) return;

      if (isWorkingState()) {
        clearWorkWatchdog();
        app.wasReconnectingDuringWork = true;
        setState(State.DOING, { text: "Reconnecting...", variant: "", force: true });
        clearWorkWatchdog();
        clearConnectionLostTimer();
        app.connectionLostTimer = window.setTimeout(() => {
          app.connectionLostTimer = null;
          if (isWebSocketOpen()) return;
          showResponseCard("CIARA lost the backend connection. I am restarting it now; run the command again once the pill returns to Hey CIARA.");
        }, 20000);
      }
      void recoverBackendAfterDisconnect();
      scheduleReconnect();
    });
  } catch {
    scheduleReconnect();
  }
}

/* ── Events ── */
let lastPointer = { x: 0, y: 0 };

// Hit-test: check if mouse is over any interactive element
function isOverInteractive(event) {
  // Onboarding is a full-screen modal — always interactive while visible
  if (onboardingOverlay && !onboardingOverlay.classList.contains("hidden")) return true;
  if (settingsOverlay && !settingsOverlay.classList.contains("hidden")) return true;

  const x = event.clientX;
  const y = event.clientY;
  const rects = [wrapper.getBoundingClientRect()];
  if (appTitlebar && !appTitlebar.classList.contains("hidden")) {
    rects.push(appTitlebar.getBoundingClientRect());
  }
  if (appWindowControls && !appWindowControls.classList.contains("hidden")) {
    rects.push(appWindowControls.getBoundingClientRect());
  }
  if (app.commandPanelOpen && commandPanel && !commandPanel.classList.contains("hidden")) {
    rects.push(commandPanel.getBoundingClientRect());
  }
  // Check response card if visible
  if (!uiResponse.classList.contains('hidden')) rects.push(uiResponse.getBoundingClientRect());
  // Check all modal types
  ALL_MODALS.forEach(m => {
    if (!m.classList.contains('hidden')) rects.push(m.getBoundingClientRect());
  });

  return rects.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

document.addEventListener("mousemove", (event) => {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
  if (!app.visible) return setMouseEnabled(false);
  setMouseEnabled(isOverInteractive(event));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (settingsOverlay && !settingsOverlay.classList.contains("hidden")) {
      closeSettings();
      return;
    }
    // If agent is working, cancel the task
    if (app.current === State.DOING || app.current === State.LOADING) {
      cancelActiveTask();
      setState(State.IDLE, { force: true });
      return;
    }
    // If TTS is playing, stop it
    if (app.ttsPlaying) {
      stopTTS();
      return;
    }
    if (app.commandPanelOpen) return closeCommandPanel();
    return bridge.hideWindow();
  }
});

// Global shortcut opens the text command panel for direct prompting.
bridge.onStartListening(() => {
  dismissAllModals(true);
  setState(State.IDLE, { force: true });
  openCommandPanel();
});

bridge.onOverlayHidden(async () => {
  clearCommandContext();
  closeCommandPanel({ clear: true });
  app.visible = true;
  wrapper.classList.remove("hidden");
  setMouseEnabled(false);
  setState(State.IDLE, { force: true });
});

window.addEventListener("beforeunload", async () => {
  app.isDisposed = true;
  await stopAudioStreaming();
  if (app.reconnectTimer) clearTimeout(app.reconnectTimer);
  clearConnectionLostTimer();
  closeWebSocketQuietly();
});

/* ── Init ── */

// ── Onboarding Flow ──
const onboardingOverlay = document.getElementById("onboarding-overlay");
const onboardingStep0 = document.getElementById("onboarding-step-0");
const onboardingStepChoice = document.getElementById("onboarding-step-choice");
const onboardingStep1 = document.getElementById("onboarding-step-1");
const onboardingStepModel = document.getElementById("onboarding-step-model");
const onboardingStep2 = document.getElementById("onboarding-step-2");
const onboardingStep3 = document.getElementById("onboarding-step-3");
const onboardingStepVoiceSelect = document.getElementById("onboarding-step-voice-select");
const onboardingStep4 = document.getElementById("onboarding-step-4");
const onboardingStep5 = document.getElementById("onboarding-step-5");
const onboardingVersion = document.getElementById("onboarding-version");
const onboardingBoot = document.getElementById("onboarding-boot");
const onboardingBootVersion = document.getElementById("onboarding-boot-version");
const onboardingCard = document.getElementById("onboarding-card");
const onboardingBack = document.getElementById("onboarding-back");
const onboardingStart = document.getElementById("onboarding-start");
const onboardingChoiceApi = document.getElementById("onboarding-choice-api");
const onboardingChoiceLocal = document.getElementById("onboarding-choice-local");
const onboardingStepLocalModel = document.getElementById("onboarding-step-local-model");
const onboardingSteps = [onboardingStep0, onboardingStepChoice, onboardingStepLocalModel, onboardingStep1, onboardingStepModel, onboardingStep2, onboardingStep3, onboardingStepVoiceSelect, onboardingStep4, onboardingStep5];
const onboardingProgressDots = Array.from(document.querySelectorAll("[data-onboarding-progress]"));
let onboardingStepIndex = 0;

async function hydrateWindowsOnboardingHints() {
  let plat = "";
  try {
    plat = await bridge.getPlatform?.() ?? "";
  } catch {
    plat = "";
  }
  const isWin = plat === "win32";
  let venvPath = "";
  try {
    venvPath = String(await bridge.getVenvPath?.() ?? "").trim();
  } catch {
    venvPath = "";
  }

  document.getElementById("onboarding-win-callout-step1")?.classList.toggle("hidden", !isWin);
  document.getElementById("onboarding-win-callout-step2")?.classList.toggle("hidden", !isWin);

  ["onboarding-venv-delete-path", "onboarding-venv-delete-path-2"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || !venvPath) return;
    el.textContent = venvPath;
  });

  ["onboarding-python-download-link", "onboarding-python-download-link-2"].forEach((linkId) => {
    const el = document.getElementById(linkId);
    if (!el || el.dataset.pythonWinWired === "1") return;
    el.dataset.pythonWinWired = "1";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openExternalUrl("https://www.python.org/downloads/windows/");
    });
  });
}

function showOnboardingStep(index) {
  onboardingStepIndex = Math.max(0, Math.min(index, onboardingSteps.length - 1));
  onboardingSteps.forEach((step, stepIndex) => {
    step?.classList.toggle("active", stepIndex === onboardingStepIndex);
  });
  const progressIndex = onboardingStepIndex - 1;
  document.getElementById("onboarding-progress-pill")?.classList.toggle("hidden", onboardingStepIndex === 0);
  onboardingProgressDots.forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === progressIndex);
    dot.classList.toggle("complete", dotIndex < progressIndex);
  });
  onboardingBack?.classList.toggle("hidden", onboardingStepIndex === 0 || onboardingStepIndex >= 8);
}

async function runOnboarding() {
  const isFirst = await bridge.isFirstLaunch?.() ?? false;
  if (!isFirst) return;

  const version = await bridge.getVersion?.() ?? "1.0.0";
  if (onboardingVersion) onboardingVersion.textContent = `v${version}`;
  if (onboardingBootVersion) onboardingBootVersion.textContent = `Version ${version}`;

  await hydrateWindowsOnboardingHints();

  await bridge.setOnboardingMode?.(true);
  setWindowModeClass("normal");
  setMouseEnabled(true);
  onboardingBoot?.classList.remove("hidden", "is-dismissing");
  onboardingCard?.classList.add("hidden");
  showOnboardingStep(0);
  onboardingOverlay.classList.remove("hidden");
  window.setTimeout(() => {
    onboardingBoot?.classList.add("is-dismissing");
    window.setTimeout(() => {
      onboardingBoot?.classList.add("hidden");
      onboardingBoot?.classList.remove("is-dismissing");
      onboardingCard?.classList.remove("hidden");
      onboardingStart?.focus();
    }, 360);
  }, 1800);
}

// ── Step 1: API Key entry ──
const geminiKeyInput = document.getElementById("onboarding-gemini-key");
const picovoiceKeyInput = document.getElementById("onboarding-picovoice-key");
const elevenlabsKeyInput = document.getElementById("onboarding-elevenlabs-key");
const elevenlabsStatus = document.getElementById("onboarding-elevenlabs-status");
const elevenlabsVoiceList = document.getElementById("onboarding-voice-list");
const elevenlabsVoiceStatus = document.getElementById("onboarding-voice-status");
const onboardingModelPicker = document.getElementById("onboarding-model-picker");
const nextModelBtn = document.getElementById("onboarding-next-model");
const next0Btn = document.getElementById("onboarding-next-0");
const next0BtnLabel = next0Btn?.querySelector(".onboarding-btn-label");
const nextWakeBtn = document.getElementById("onboarding-next-wake");
const nextVoiceBtn = document.getElementById("onboarding-next-voice");
const nextVoiceBtnLabel = nextVoiceBtn?.querySelector(".onboarding-btn-label");
const nextVoiceSelectBtn = document.getElementById("onboarding-next-voice-select");
const nextVoiceSelectBtnLabel = nextVoiceSelectBtn?.querySelector(".onboarding-btn-label");
const openAiStudioLink = document.getElementById("onboarding-open-aistudio");
const openElevenlabsLink = document.getElementById("onboarding-open-elevenlabs");
let onboardingElevenlabsVoices = [];
let selectedElevenlabsVoiceId = "";
let selectedGeminiModel = "gemma-4-26b-a4b-it";
let selectedLocalRuntime = "ollama";
let selectedLocalModel = "gemma-4-26b-a4b-it";
let activeVoicePreviewAudio = null;
let activeVoicePreviewUrl = "";
let activeVoicePreviewButton = null;

const localRuntimeTabs = Array.from(document.querySelectorAll(".local-runtime-tab"));
const localRuntimePanels = Array.from(document.querySelectorAll(".local-runtime-panel"));
const localModelRows = Array.from(document.querySelectorAll(".local-model-row"));
const localModelStatus = document.getElementById("local-model-status");
const localCustomStatus = document.getElementById("local-custom-status");
const localCustomBaseUrl = document.getElementById("local-custom-base-url");
const localCustomModel = document.getElementById("local-custom-model");
const ollamaStatusText = document.getElementById("ollama-status-text");
const ollamaRefresh = document.getElementById("ollama-refresh");
const nextLocalBtn = document.getElementById("onboarding-next-local");
const nextLocalBtnLabel = nextLocalBtn?.querySelector(".onboarding-btn-label");

if (onboardingStart) {
  onboardingStart.addEventListener("click", () => {
    showOnboardingStep(1);
  });
}

if (onboardingChoiceApi) {
  onboardingChoiceApi.addEventListener("click", () => {
    showOnboardingStep(3);
    geminiKeyInput?.focus();
  });
}

if (onboardingChoiceLocal) {
  onboardingChoiceLocal.addEventListener("click", () => {
    showOnboardingStep(2);
    refreshOllamaStatus();
  });
}

function setLocalRuntime(runtime) {
  selectedLocalRuntime = runtime === "custom" ? "custom" : "ollama";
  localRuntimeTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.localRuntime === selectedLocalRuntime);
  });
  localRuntimePanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `local-runtime-${selectedLocalRuntime}`);
  });
}

function setLocalModel(modelId) {
  selectedLocalModel = modelId || selectedLocalModel;
  localModelRows.forEach((row) => {
    const selected = row.dataset.modelId === selectedLocalModel;
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-checked", selected ? "true" : "false");
  });
}

function markInstalledOllamaModels(models) {
  const installed = new Set((models || []).map((model) => String(model.name || "").toLowerCase()));
  localModelRows.forEach((row) => {
    const modelId = String(row.dataset.modelId || "").toLowerCase();
    const isInstalled = installed.has(modelId);
    row.classList.toggle("installed", isInstalled);
    const action = row.querySelector(".local-model-action");
    if (action) action.textContent = isInstalled ? "Use" : "Download";
  });
}

async function ensureOllamaModelAvailable(modelId, { updatePrimaryCta = false } = {}) {
  const status = await bridge.getOllamaStatus?.();
  const installed = new Set((status?.models || []).map((model) => String(model.name || "").toLowerCase()));
  if (installed.has(String(modelId || "").toLowerCase())) {
    markInstalledOllamaModels(status?.models || []);
    return { ok: true, downloaded: false };
  }

  const selectedRow = localModelRows.find((row) => row.dataset.modelId === modelId);
  const action = selectedRow?.querySelector(".local-model-action");
  const previousActionLabel = action?.textContent || "";
  const previousPrimaryLabel = nextLocalBtnLabel?.textContent || "";

  if (action) action.textContent = "Downloading...";
  if (updatePrimaryCta && nextLocalBtnLabel) nextLocalBtnLabel.textContent = "Downloading...";
  setOnboardingStatus(localModelStatus, `Downloading ${modelId} from Ollama...`);

  const pulled = await bridge.pullOllamaModel?.(modelId);
  if (!pulled?.ok) {
    if (action) action.textContent = previousActionLabel || "Download";
    if (updatePrimaryCta && nextLocalBtnLabel) nextLocalBtnLabel.textContent = previousPrimaryLabel || "Use Local Model";
    return { ok: false, error: pulled?.error || "Could not download the model in Ollama." };
  }

  const refreshed = await bridge.getOllamaStatus?.();
  markInstalledOllamaModels(refreshed?.models || []);
  if (updatePrimaryCta && nextLocalBtnLabel) nextLocalBtnLabel.textContent = previousPrimaryLabel || "Use Local Model";
  setOnboardingStatus(localModelStatus, `${modelId} is ready in Ollama.`);
  return { ok: true, downloaded: true };
}

async function refreshOllamaStatus() {
  if (!ollamaStatusText) return;
  ollamaStatusText.textContent = "Checking Ollama...";
  try {
    const status = await bridge.getOllamaStatus?.();
    if (!status?.installed) {
      ollamaStatusText.textContent = "Ollama is not installed.";
      setOnboardingStatus(localModelStatus, "Install Ollama, then come back and refresh.", true);
      markInstalledOllamaModels([]);
      return;
    }
    if (!status.running) {
      ollamaStatusText.textContent = "Ollama is installed but not running.";
      setOnboardingStatus(localModelStatus, status.error || "Start Ollama, then refresh.", true);
      markInstalledOllamaModels([]);
      return;
    }
    ollamaStatusText.textContent = `${status.models?.length || 0} local models found.`;
    setOnboardingStatus(localModelStatus, "Choose a model. CIARA will download it if it is missing.");
    markInstalledOllamaModels(status.models || []);
  } catch {
    ollamaStatusText.textContent = "Could not check Ollama.";
    setOnboardingStatus(localModelStatus, "Ollama status check failed.", true);
  }
}

localRuntimeTabs.forEach((tab) => {
  tab.addEventListener("click", () => setLocalRuntime(tab.dataset.localRuntime));
});

localModelRows.forEach((row) => {
  row.addEventListener("click", () => setLocalModel(row.dataset.modelId));
  row.querySelector(".local-model-action")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const modelId = row.dataset.modelId || "";
    setLocalModel(modelId);
    const result = await ensureOllamaModelAvailable(modelId);
    if (!result.ok) {
      setOnboardingStatus(localModelStatus, result.error || "Could not download the model in Ollama.", true);
    }
  });
});

ollamaRefresh?.addEventListener("click", () => refreshOllamaStatus());

bridge.onOllamaProgress?.((text) => {
  const cleaned = String(text || "").trim().split(/\r?\n/).pop();
  if (cleaned) setOnboardingStatus(localModelStatus, cleaned);
});

if (nextLocalBtn) {
  nextLocalBtn.addEventListener("click", async () => {
    const existing = await bridge.loadCredentials?.() ?? {};
    nextLocalBtn.disabled = true;
    if (nextLocalBtnLabel) nextLocalBtnLabel.textContent = selectedLocalRuntime === "ollama" ? "Preparing..." : "Saving...";

    try {
      if (selectedLocalRuntime === "custom") {
        const baseUrl = localCustomBaseUrl?.value.trim() || "http://127.0.0.1:8080/v1";
        const model = localCustomModel?.value.trim();
        if (!model) {
          setOnboardingStatus(localCustomStatus, "Enter the model name served by your local endpoint.", true);
          localCustomModel?.focus();
          return;
        }
        await bridge.saveCredentials?.({
          ...existing,
          llm_provider: "openai-compatible-local",
          local_base_url: baseUrl,
          local_model: model,
          local_supports_tools: true,
          local_supports_vision: false,
        });
      } else {
        const ensured = await ensureOllamaModelAvailable(selectedLocalModel, { updatePrimaryCta: true });
        if (!ensured.ok) {
          setOnboardingStatus(localModelStatus, ensured.error || "Could not download the model in Ollama.", true);
          return;
        }
        await bridge.saveCredentials?.({
          ...existing,
          llm_provider: "ollama",
          local_base_url: "http://127.0.0.1:11434/v1",
          local_model: selectedLocalModel,
          local_supports_tools: true,
          local_supports_vision: selectedLocalModel.startsWith("gemma-4-"),
        });
      }
      showOnboardingStep(5);
      picovoiceKeyInput?.focus();
    } finally {
      nextLocalBtn.disabled = false;
      if (nextLocalBtnLabel) nextLocalBtnLabel.textContent = "Use Local Model";
    }
  });
}

if (onboardingModelPicker) {
  Array.from(onboardingModelPicker.querySelectorAll(".onboarding-model-option")).forEach((option) => {
    option.addEventListener("click", () => {
      selectedGeminiModel = option.dataset.modelId || selectedGeminiModel;
      Array.from(onboardingModelPicker.querySelectorAll(".onboarding-model-option")).forEach((item) => {
        const selected = item === option;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-checked", selected ? "true" : "false");
      });
    });
  });
}

if (onboardingBack) {
  onboardingBack.addEventListener("click", () => {
    showOnboardingStep(onboardingStepIndex - 1);
  });
}

function wireOnboardingPasswordToggle(btn, input, labels) {
  if (!btn || !input) return;
  const open = btn.querySelector(".onboarding-eye-open");
  const closed = btn.querySelector(".onboarding-eye-closed");
  const { show: showLabel, hide: hideLabel } = labels;
  btn.addEventListener("click", () => {
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    btn.setAttribute("aria-pressed", reveal ? "true" : "false");
    btn.setAttribute("aria-label", reveal ? hideLabel : showLabel);
    open?.classList.toggle("hidden", reveal);
    closed?.classList.toggle("hidden", !reveal);
  });
}

wireOnboardingPasswordToggle(
  document.getElementById("onboarding-gemini-toggle"),
  geminiKeyInput,
  { show: "Show API key", hide: "Hide API key" },
);
wireOnboardingPasswordToggle(
  document.getElementById("onboarding-pico-toggle"),
  picovoiceKeyInput,
  { show: "Show Picovoice key", hide: "Hide Picovoice key" },
);

if (geminiKeyInput) {
  geminiKeyInput.addEventListener("input", () => {
    if (next0Btn) next0Btn.disabled = false;
  });
}

if (elevenlabsKeyInput) {
  elevenlabsKeyInput.addEventListener("input", () => {
    if (nextVoiceBtn) nextVoiceBtn.disabled = false;
    if (nextVoiceBtnLabel) nextVoiceBtnLabel.textContent = "Continue";
    if (elevenlabsStatus) {
      elevenlabsStatus.textContent = "";
      elevenlabsStatus.classList.remove("error");
    }
  });
}

// Pre-fill the bundled Picovoice key so wake word works out of the box
const BUNDLED_PICOVOICE_KEY = "lDvqq7J641WbqdzMsPCdLlawELhfGZOGhaceFzl3ZYYYzeeuXq55YA==";
if (picovoiceKeyInput) picovoiceKeyInput.value = BUNDLED_PICOVOICE_KEY;

// ── Settings (hotkey / overlay) ──
async function populateSettingsForm() {
  const creds = await bridge.loadCredentials?.() ?? {};
  if (settingsLlmProvider) settingsLlmProvider.value = creds.llm_provider || "gemini";
  if (settingsGeminiKey) settingsGeminiKey.value = creds.gemini_api_key || "";
  if (settingsLocalModel) settingsLocalModel.value = creds.local_model || "";
  if (settingsLocalBaseUrl) settingsLocalBaseUrl.value = creds.local_base_url || "http://127.0.0.1:11434/v1";
  if (settingsPicovoiceKey) {
    const p = (creds.picovoice_key || "").trim();
    settingsPicovoiceKey.value = p || BUNDLED_PICOVOICE_KEY;
  }
  if (settingsElevenlabsKey) settingsElevenlabsKey.value = creds.elevenlabs_api_key || "";
  if (settingsElevenlabsVoice) settingsElevenlabsVoice.value = creds.elevenlabs_voice_id || "";
  if (settingsDataDir) {
    try {
      const p = await bridge.getDataDirPath?.();
      settingsDataDir.textContent = (p && String(p).trim()) || "—";
    } catch {
      settingsDataDir.textContent = "—";
    }
  }
  if (settingsAppVersion) {
    const v = await bridge.getVersion?.() ?? "";
    const raw = String(v).trim() || "—";
    settingsAppVersion.textContent = raw === "—" ? raw : (raw.startsWith("v") ? raw : `v${raw}`);
  }
  if (settingsStatus) {
    settingsStatus.textContent = "";
    settingsStatus.classList.remove("error");
  }
  const settingsWinNote = document.getElementById("settings-win-python-note");
  const settingsWinVenv = document.getElementById("settings-win-venv-path");
  if (settingsWinNote) {
    let plat = "";
    try {
      plat = await bridge.getPlatform?.() ?? "";
    } catch {
      plat = "";
    }
    if (plat === "win32") {
      if (settingsWinVenv) {
        try {
          const vp = String(await bridge.getVenvPath?.() ?? "").trim();
          settingsWinVenv.textContent = vp || "—";
        } catch {
          settingsWinVenv.textContent = "—";
        }
      }
      settingsWinNote.classList.remove("hidden");
    } else {
      settingsWinNote.classList.add("hidden");
    }
  }
}

async function openSettings() {
  if (!settingsOverlay) return;
  await populateSettingsForm();
  setMouseEnabled(true);
  settingsOverlay.classList.remove("hidden");
}

function closeSettings() {
  if (!settingsOverlay) return;
  settingsOverlay.classList.add("hidden");
  setMouseEnabled(isOverInteractive({ clientX: lastPointer.x, clientY: lastPointer.y }));
}

if (settingsLinkAistudio) {
  settingsLinkAistudio.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://aistudio.google.com/app/apikey");
  });
}
if (settingsLinkPicovoice) {
  settingsLinkPicovoice.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://console.picovoice.ai");
  });
}
if (settingsLinkEleven) {
  settingsLinkEleven.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://elevenlabs.io/app/settings/api-keys");
  });
}
settingsLlmProvider?.addEventListener("change", () => {
  if (!settingsLocalBaseUrl) return;
  if (settingsLlmProvider.value === "ollama" && !settingsLocalBaseUrl.value.trim()) {
    settingsLocalBaseUrl.value = "http://127.0.0.1:11434/v1";
  }
  if (settingsLlmProvider.value === "openai-compatible-local" && !settingsLocalBaseUrl.value.trim()) {
    settingsLocalBaseUrl.value = "http://127.0.0.1:8080/v1";
  }
});
if (settingsCancel) settingsCancel.addEventListener("click", () => closeSettings());

if (settingsSave) {
  settingsSave.addEventListener("click", async () => {
    const provider = settingsLlmProvider?.value || "gemini";
    const geminiKey = settingsGeminiKey?.value.trim() ?? "";
    const localModel = settingsLocalModel?.value.trim() ?? "";
    const localBaseUrl = settingsLocalBaseUrl?.value.trim() ?? "";
    if (provider === "gemini" && !geminiKey) {
      if (settingsStatus) {
        settingsStatus.textContent = "Gemini API key is required.";
        settingsStatus.classList.add("error");
      }
      return;
    }
    if (provider !== "gemini" && (!localModel || !localBaseUrl)) {
      if (settingsStatus) {
        settingsStatus.textContent = "Local model and base URL are required.";
        settingsStatus.classList.add("error");
      }
      return;
    }
    if (settingsStatus) settingsStatus.classList.remove("error");
    const prevDisabled = settingsSave.disabled;
    const prevLabel = settingsSave.textContent;
    settingsSave.disabled = true;
    settingsSave.textContent = "Saving…";
    if (settingsStatus) settingsStatus.textContent = "";
    try {
      const existing = await bridge.loadCredentials?.() ?? {};
      const picoKey = settingsPicovoiceKey?.value.trim() ?? "";
      const elKey = settingsElevenlabsKey?.value.trim() ?? "";
      const elVoice = settingsElevenlabsVoice?.value.trim() ?? "";
      const newCreds = {
        ...existing,
        llm_provider: provider,
        gemini_api_key: geminiKey,
      };
      if (provider === "ollama") {
        newCreds.local_base_url = localBaseUrl || "http://127.0.0.1:11434/v1";
        newCreds.local_model = localModel || "gemma-4-26b-a4b-it";
        newCreds.local_supports_tools = true;
        newCreds.local_supports_vision = newCreds.local_model.startsWith("gemma-4-");
      } else if (provider === "openai-compatible-local") {
        newCreds.local_base_url = localBaseUrl;
        newCreds.local_model = localModel;
        newCreds.local_supports_tools = true;
        newCreds.local_supports_vision = false;
      }
      if (picoKey) newCreds.picovoice_key = picoKey;
      if (elKey) {
        newCreds.elevenlabs_api_key = elKey;
        if (elVoice) newCreds.elevenlabs_voice_id = elVoice;
        else delete newCreds.elevenlabs_voice_id;
      } else {
        delete newCreds.elevenlabs_api_key;
        delete newCreds.elevenlabs_voice_id;
      }
      await bridge.saveCredentials?.(newCreds);
      if (settingsStatus) settingsStatus.textContent = "Restarting backend…";
      const restart = await bridge.restartBackend?.() ?? { ok: false };
      if (settingsStatus) {
        settingsStatus.textContent = restart.ok
          ? "Saved. Backend restarted."
          : "Saved. Backend restart failed — check logs.";
        if (!restart.ok) settingsStatus.classList.add("error");
        else settingsStatus.classList.remove("error");
      }
    } catch {
      if (settingsStatus) {
        settingsStatus.textContent = "Save failed.";
        settingsStatus.classList.add("error");
      }
    } finally {
      settingsSave.disabled = prevDisabled;
      settingsSave.textContent = prevLabel;
    }
  });
}

if (openAiStudioLink) {
  openAiStudioLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://aistudio.google.com/app/apikey");
  });
}

const openPicovoiceLink = document.getElementById("onboarding-open-picovoice");
if (openPicovoiceLink) {
  openPicovoiceLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://console.picovoice.ai");
  });
}

if (openElevenlabsLink) {
  openElevenlabsLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://elevenlabs.io/app/settings/api-keys");
  });
}

function setOnboardingStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError));
}

function stopElevenlabsPreview() {
  if (activeVoicePreviewAudio) {
    activeVoicePreviewAudio.pause();
    activeVoicePreviewAudio.src = "";
    activeVoicePreviewAudio = null;
  }
  if (activeVoicePreviewUrl) {
    URL.revokeObjectURL(activeVoicePreviewUrl);
    activeVoicePreviewUrl = "";
  }
  if (activeVoicePreviewButton) {
    activeVoicePreviewButton.classList.remove("loading", "playing");
    activeVoicePreviewButton.disabled = false;
    activeVoicePreviewButton.textContent = "Preview";
    activeVoicePreviewButton = null;
  }
}

async function getElevenlabsPreviewUrl(voice, apiKey) {
  const previewUrl = String(voice?.preview_url || voice?.previewUrl || "").trim();
  if (previewUrl) return { url: previewUrl, revoke: false };

  const voiceId = String(voice?.voice_id || "").trim();
  if (!voiceId) throw new Error("Voice preview is unavailable.");

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: "Hi, I'm CIARA. This is how my voice will sound.",
      model_id: "eleven_v3",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.detail?.message || body?.detail || body?.message || "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail || `Preview failed (${response.status})`);
  }

  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), revoke: true };
}

async function previewElevenlabsVoice(voice, button) {
  const apiKey = elevenlabsKeyInput?.value.trim() ?? "";
  if (!apiKey && !voice?.preview_url && !voice?.previewUrl) {
    setOnboardingStatus(elevenlabsVoiceStatus, "Enter your ElevenLabs API key to preview voices.", true);
    elevenlabsKeyInput?.focus();
    return;
  }

  if (activeVoicePreviewButton === button && activeVoicePreviewAudio && !activeVoicePreviewAudio.paused) {
    stopElevenlabsPreview();
    setOnboardingStatus(elevenlabsVoiceStatus, "Preview stopped.");
    return;
  }

  stopElevenlabsPreview();
  activeVoicePreviewButton = button;
  button.disabled = true;
  button.classList.add("loading");
  button.textContent = "Loading...";
  setOnboardingStatus(elevenlabsVoiceStatus, `Loading preview for ${voice?.name || "voice"}...`);

  try {
    const preview = await getElevenlabsPreviewUrl(voice, apiKey);
    activeVoicePreviewUrl = preview.revoke ? preview.url : "";
    const audio = new Audio(preview.url);
    activeVoicePreviewAudio = audio;
    button.disabled = false;
    button.classList.remove("loading");
    button.classList.add("playing");
    button.textContent = "Stop";
    setOnboardingStatus(elevenlabsVoiceStatus, `Playing preview for ${voice?.name || "voice"}.`);
    audio.addEventListener("ended", () => {
      setOnboardingStatus(elevenlabsVoiceStatus, "Preview finished. Choose one to continue.");
      stopElevenlabsPreview();
    }, { once: true });
    audio.addEventListener("error", () => {
      setOnboardingStatus(elevenlabsVoiceStatus, "Could not play this voice preview.", true);
      stopElevenlabsPreview();
    }, { once: true });
    await audio.play();
  } catch (error) {
    setOnboardingStatus(elevenlabsVoiceStatus, error?.message || "Could not preview this voice.", true);
    stopElevenlabsPreview();
  }
}

async function fetchElevenlabsVoices(apiKey) {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.detail?.message || body?.detail || body?.message || "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail || `ElevenLabs returned ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.voices) ? data.voices : [];
}

function renderElevenlabsVoices(voices) {
  if (!elevenlabsVoiceList) return;
  stopElevenlabsPreview();
  elevenlabsVoiceList.textContent = "";
  selectedElevenlabsVoiceId = voices[0]?.voice_id || "";

  voices.forEach((voice) => {
    const option = document.createElement("div");
    option.className = "onboarding-voice-option";
    option.dataset.voiceId = voice.voice_id || "";
    option.setAttribute("role", "radio");
    option.setAttribute("aria-checked", voice.voice_id === selectedElevenlabsVoiceId ? "true" : "false");
    option.setAttribute("tabindex", "0");

    const initial = document.createElement("span");
    initial.className = "onboarding-voice-initial";
    initial.textContent = (voice.name || "V").trim().slice(0, 1).toUpperCase();

    const copy = document.createElement("span");
    copy.className = "onboarding-voice-copy";

    const name = document.createElement("span");
    name.className = "onboarding-voice-name";
    name.textContent = voice.name || "Unnamed voice";

    const meta = document.createElement("span");
    meta.className = "onboarding-voice-meta";
    const category = voice.category ? `${voice.category}` : "ElevenLabs voice";
    const labels = voice.labels && typeof voice.labels === "object"
      ? Object.values(voice.labels).filter(Boolean).slice(0, 2).join(" · ")
      : "";
    meta.textContent = labels ? `${category} · ${labels}` : category;

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "onboarding-voice-preview";
    previewButton.textContent = "Preview";
    previewButton.setAttribute("aria-label", `Preview ${voice.name || "voice"}`);

    copy.append(name, meta);
    option.append(initial, copy, previewButton);

    const selectVoice = () => {
      selectedElevenlabsVoiceId = voice.voice_id || "";
      Array.from(elevenlabsVoiceList.querySelectorAll(".onboarding-voice-option")).forEach((item) => {
        const selected = item === option;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-checked", selected ? "true" : "false");
      });
      if (nextVoiceSelectBtn) nextVoiceSelectBtn.disabled = !selectedElevenlabsVoiceId;
    };

    option.addEventListener("click", (event) => {
      if (event.target === previewButton) return;
      selectVoice();
    });

    option.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectVoice();
    });

    previewButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectVoice();
      previewElevenlabsVoice(voice, previewButton);
    });

    if (voice.voice_id === selectedElevenlabsVoiceId) {
      option.classList.add("selected");
    }

    elevenlabsVoiceList.append(option);
  });

  if (nextVoiceSelectBtn) nextVoiceSelectBtn.disabled = !selectedElevenlabsVoiceId;
}

if (next0Btn) {
  next0Btn.addEventListener("click", async () => {
    const geminiKey = geminiKeyInput?.value.trim() ?? "";
    if (!geminiKey) return;

    next0Btn.disabled = true;
    if (next0BtnLabel) next0BtnLabel.textContent = "Saving…";

    // Merge with any existing credentials and save
    const existing = await bridge.loadCredentials?.() ?? {};
    const picoKey = picovoiceKeyInput?.value.trim() ?? "";
    const elKey = elevenlabsKeyInput?.value.trim() ?? "";
    const elVoice = selectedElevenlabsVoiceId;
    const newCreds = { ...existing, gemini_api_key: geminiKey };
    if (picoKey) newCreds.picovoice_key = picoKey;
    if (elKey) {
      newCreds.elevenlabs_api_key = elKey;
      if (elVoice) newCreds.elevenlabs_voice_id = elVoice;
      else delete newCreds.elevenlabs_voice_id;
    } else {
      delete newCreds.elevenlabs_api_key;
      delete newCreds.elevenlabs_voice_id;
    }
    await bridge.saveCredentials?.(newCreds);

    // Transition to checklist step and start backend
    onboardingStep1.classList.remove("active");
    onboardingStep2.classList.add("active");
    runSetupChecklist();
  });
}

// ── Step 2: Setup checklist ──
if (next0Btn) {
  next0Btn.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const geminiKey = geminiKeyInput?.value.trim() ?? "";
    if (!geminiKey) {
      geminiKeyInput?.focus();
      return;
    }
    showOnboardingStep(4);
    nextModelBtn?.focus();
  }, true);
}

if (nextModelBtn) {
  nextModelBtn.addEventListener("click", async () => {
    const geminiKey = geminiKeyInput?.value.trim() ?? "";
    if (!geminiKey) {
      showOnboardingStep(3);
      geminiKeyInput?.focus();
      return;
    }

    const existing = await bridge.loadCredentials?.() ?? {};
    await bridge.saveCredentials?.({
      ...existing,
      gemini_api_key: geminiKey,
      gemini_model: selectedGeminiModel,
    });

    showOnboardingStep(5);
    picovoiceKeyInput?.focus();
  });
}

if (nextWakeBtn) {
  nextWakeBtn.addEventListener("click", () => {
    showOnboardingStep(6);
    elevenlabsKeyInput?.focus();
  });
}

if (nextVoiceBtn) {
  nextVoiceBtn.addEventListener("click", async () => {
    const geminiKey = geminiKeyInput?.value.trim() ?? "";
    const savedCreds = await bridge.loadCredentials?.() ?? {};
    const provider = savedCreds.llm_provider || "gemini";
    if (provider === "gemini" && !geminiKey && !savedCreds.gemini_api_key) {
      showOnboardingStep(3);
      geminiKeyInput?.focus();
      return;
    }

    const elKey = elevenlabsKeyInput?.value.trim() ?? "";
    if (!elKey) {
      setOnboardingStatus(elevenlabsStatus, "Enter your ElevenLabs API key to continue.", true);
      elevenlabsKeyInput?.focus();
      return;
    }

    nextVoiceBtn.disabled = true;
    if (nextVoiceBtnLabel) nextVoiceBtnLabel.textContent = "Loading voices...";
    setOnboardingStatus(elevenlabsStatus, "Fetching your ElevenLabs voices...");

    try {
      onboardingElevenlabsVoices = await fetchElevenlabsVoices(elKey);
      if (!onboardingElevenlabsVoices.length) {
        throw new Error("No ElevenLabs voices were found for this key.");
      }
      renderElevenlabsVoices(onboardingElevenlabsVoices);
      setOnboardingStatus(elevenlabsVoiceStatus, `${onboardingElevenlabsVoices.length} voices loaded. Choose one to continue.`);
      showOnboardingStep(7);
    } catch (error) {
      setOnboardingStatus(elevenlabsStatus, error?.message || "Could not load ElevenLabs voices. Check your API key.", true);
      elevenlabsKeyInput?.focus();
    } finally {
      nextVoiceBtn.disabled = false;
      if (nextVoiceBtnLabel) nextVoiceBtnLabel.textContent = "Continue";
    }
  });
}

if (nextVoiceSelectBtn) {
  nextVoiceSelectBtn.addEventListener("click", async () => {
    const geminiKey = geminiKeyInput?.value.trim() ?? "";
    const picoKey = picovoiceKeyInput?.value.trim() ?? "";
    const elKey = elevenlabsKeyInput?.value.trim() ?? "";
    if (!selectedElevenlabsVoiceId) {
      setOnboardingStatus(elevenlabsVoiceStatus, "Choose a voice to continue.", true);
      return;
    }

    nextVoiceSelectBtn.disabled = true;
    if (nextVoiceSelectBtnLabel) nextVoiceSelectBtnLabel.textContent = "Saving...";

    const existing = await bridge.loadCredentials?.() ?? {};
    const newCreds = {
      ...existing,
      gemini_api_key: geminiKey || existing.gemini_api_key || "",
      gemini_model: selectedGeminiModel,
      elevenlabs_api_key: elKey,
      elevenlabs_voice_id: selectedElevenlabsVoiceId,
    };
    if (picoKey) newCreds.picovoice_key = picoKey;
    await bridge.saveCredentials?.(newCreds);

    showOnboardingStep(8);
    runSetupChecklist();
    if (nextVoiceSelectBtnLabel) nextVoiceSelectBtnLabel.textContent = "Save & Continue";
  });
}

const checkPythonEl = document.getElementById("check-python");
const checkWsEl = document.getElementById("check-ws");
const checkMicEl = document.getElementById("check-mic");
const setupLogEl = document.getElementById("onboarding-setup-log");
const next2Btn = document.getElementById("onboarding-next-2");

function setCheck(el, state, detail = "") {
  if (!el) return;
  const icon = el.querySelector(".check-icon");
  const label = el.querySelector(".check-label");
  if (label && !label.dataset.baseLabel) {
    label.dataset.baseLabel = label.textContent || "";
  }
  if (label) {
    const base = label.dataset.baseLabel || label.textContent || "";
    label.textContent = detail ? `${base} - ${detail}` : base;
  }
  el.classList.remove("ok", "fail", "pending");
  if (state === "ok") {
    el.classList.add("ok");
    if (icon) icon.textContent = "✓";
  } else if (state === "fail") {
    el.classList.add("fail");
    if (icon) icon.textContent = "✗";
  } else if (state === "spin") {
    el.classList.add("pending");
    if (icon) icon.textContent = "⏳";
  } else {
    if (icon) icon.textContent = "⏳";
  }
}

// Collapsible setup log + forward progress from main
const onboardingLogPanel = document.getElementById("onboarding-log-panel");
const onboardingLogToggle = document.getElementById("onboarding-log-toggle");
if (onboardingLogToggle && onboardingLogPanel) {
  onboardingLogToggle.addEventListener("click", () => {
    const open = onboardingLogPanel.classList.toggle("is-expanded");
    onboardingLogToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

if (bridge.onSetupProgress) {
  bridge.onSetupProgress((text) => {
    appendSetupLogLine(text);
  });
}

async function runSetupChecklist() {
  if (setupLogEl) setupLogEl.textContent = "";
  // Ensure user_id is generated and merged with saved credentials
  const saved = await bridge.loadCredentials?.() ?? {};
  if (!saved.user_id) {
    const idCreds = await bridge.generateUserId?.() ?? {};
    await bridge.saveCredentials?.({ ...saved, ...idCreds });
  }

  // Kick off Python setup + backend start
  setCheck(checkPythonEl, "spin", "Starting backend...");
  const startResult = await bridge.startBackend?.() ?? { ok: false };
  if (startResult?.detail) appendSetupLogLine(startResult.detail);
  setCheck(
    checkPythonEl,
    startResult.ok ? "ok" : "fail",
    startResult.ok ? "Runtime ready." : (startResult.detail || "Python setup or backend startup failed.")
  );

  // Wait for WebSocket, then restart once if the first handshake stays stale.
  let wsOk = false;
  let wsDetail = "";
  if (startResult.ok) {
    setCheck(checkWsEl, "spin", "Connecting to CIARA...");
    wsOk = await establishFreshWebSocketConnection(20000);
    if (!wsOk) {
      wsDetail = "Initial websocket handshake timed out. Restarting backend once...";
      appendSetupLogLine(wsDetail);
      const restartResult = await bridge.restartBackend?.() ?? { ok: false };
      if (restartResult?.detail) appendSetupLogLine(restartResult.detail);
      if (restartResult.ok) {
        wsOk = await establishFreshWebSocketConnection(20000);
      } else {
        wsDetail = restartResult.detail || "Backend restart failed before websocket could reconnect.";
      }
    }
  } else {
    wsDetail = "Backend is unavailable, so the websocket could not be opened.";
  }
  if (!wsOk && !wsDetail) {
    wsDetail = "CIARA could not connect to ws://127.0.0.1:8000/ws yet. Open 'more' for startup details.";
  }
  setCheck(checkWsEl, wsOk ? "ok" : "fail", wsOk ? "Connected." : wsDetail);

  // Microphone permission check
  setCheck(checkMicEl, "spin", "Checking access...");
  let micOk = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    micOk = true;
    setCheck(checkMicEl, "ok", "Ready.");
  } catch {
    setCheck(checkMicEl, "fail", "Microphone permission is blocked in system settings.");
  }

  if (next2Btn) next2Btn.disabled = !(startResult.ok && wsOk);
}

if (next2Btn) {
  next2Btn.addEventListener("click", () => {
    showOnboardingStep(9);
  });
}

// ── Step 3: Shortcuts & Extension ──
const onboardingDone = document.getElementById("onboarding-done");

if (onboardingDone) {
  onboardingDone.addEventListener("click", async () => {
    onboardingOverlay.classList.add("hidden");
    setMouseEnabled(false);
    await bridge.setOnboardingMode?.(false);
    setState(State.IDLE, { force: true });
  });
}

// ── Extension install buttons in onboarding ──
const exportExtBtn = document.getElementById("onboarding-export-ext");
const revealExtBtn = document.getElementById("onboarding-reveal-ext");

const exportExtLabel = exportExtBtn?.querySelector(".onboarding-ext-btn-label");
if (exportExtBtn && exportExtLabel) {
  const exportExtDefaultLabel = exportExtLabel.textContent;
  exportExtBtn.addEventListener("click", async () => {
    exportExtBtn.disabled = true;
    exportExtBtn.classList.remove("is-error");
    exportExtLabel.textContent = "Saving…";
    try {
      const result = await bridge.exportExtension();
      if (result?.success) {
        exportExtLabel.textContent = "Saved! Opening folder…";
      } else if (result?.reason === "cancelled") {
        exportExtLabel.textContent = exportExtDefaultLabel;
      } else {
        exportExtBtn.classList.add("is-error");
        exportExtLabel.textContent = "Failed — try again";
      }
    } catch {
      exportExtBtn.classList.add("is-error");
      exportExtLabel.textContent = "Error — try again";
    }
    exportExtBtn.disabled = false;
    window.setTimeout(() => {
      exportExtLabel.textContent = exportExtDefaultLabel;
      exportExtBtn.classList.remove("is-error");
    }, 4500);
  });
}

if (revealExtBtn) {
  revealExtBtn.addEventListener("click", () => {
    bridge.revealExtension();
  });
}

setState(State.IDLE, { force: true });
wrapper.classList.remove("hidden");
setMouseEnabled(false);

// 1. Connect WS
connectWebSocket();

// 2. Start continuously recording and streaming Base64 WAV chunks
startAudioStreaming();

// 3. Run onboarding if first launch
if (bridge.onSettingsOpen) {
  bridge.onSettingsOpen(() => {
    void openSettings();
  });
}
if (bridge.onWindowModeChange) {
  bridge.onWindowModeChange((mode) => {
    setWindowModeClass(mode);
  });
}
runOnboarding();

/* ══════════════════════════════════════════════════════════════
   Foreground Agent Event Tracking (no drawer UI)
   ══════════════════════════════════════════════════════════════ */
// ── Utility Functions ──

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
