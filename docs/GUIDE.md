# CIARA — Complete Guide

> **Everything in one place** — from what CIARA is and how it was built, to how customers install it and how you run, manage, and ship it.

This tree is **local-first**: the Python backend is `backend/servers/local_server.py`, and durable state lives on disk under `CIARA_DATA_DIR` (see `backend/runtime_paths.py`). There is **no** Cloud Run, Firestore, or GCS pipeline in this repository.

---

## Table of Contents

### For Customers
1. [What is CIARA?](#1-what-is-ciara)
2. [Installing CIARA](#2-installing-ciara)
3. [Installing the Chrome Extension](#3-installing-the-chrome-extension)
4. [Using CIARA (Daily Use)](#4-using-ciara-daily-use)
5. [Starting & Stopping the App](#5-starting--stopping-the-app)
6. [Troubleshooting](#6-troubleshooting)

### For Developers & Operators
7. [Running the Development Server](#7-running-the-development-server)
8. [Environment Variables](#8-environment-variables)
9. [Project Structure](#9-project-structure)
10. [How CIARA Works (Architecture)](#10-how-ciara-works-architecture)
11. [The SPAV Agent Loop Explained](#11-the-spav-agent-loop-explained)
12. [Google APIs & Local Data](#12-google-apis--local-data)
13. [How the Software Was Built](#13-how-the-software-was-built)
14. [Building Release Artifacts](#14-building-a-dmg-for-distribution)
15. [Code Signing & Notarization](#15-code-signing--notarization)
16. [Shipping Release Artifacts](#16-shipping-release-artifacts)
17. [Running Tests](#17-running-tests)

---

# PART 1 — FOR CUSTOMERS

---

## 1. What is CIARA?

CIARA is a **local-first AI desktop agent for Windows and macOS**. It lives as a small floating glass pill and responds to voice or typed commands. You speak to it naturally - "open my emails", "search for the best AirPods deal", "write a reply to my last message" - and it does the work on your desktop.

### What can it do?

- **Open and control apps** - launch, quit, and switch between desktop apps
- **Control your desktop** - adjust volume, brightness, take screenshots, lock screen
- **Browse the web** - search, read pages, fill forms, extract information (needs Chrome extension)
- **Write content** - draft emails, messages, documents, summaries in any app
- **Answer questions** - with full reasoning, using your current screen as context
- **Multi-step tasks** - "find the cheapest flight to Tokyo and open the booking page"
- **Remember things** - the vault stores notes, preferences, and facts across sessions

### How does it hear me?

CIARA listens for the wake word **"Hey CIARA"** using low-power on-device processing when Picovoice is configured. You can also press the keyboard shortcut or use the command panel.

---

## 2. Installing CIARA

### Step 1 - Download
Download the release for your platform. Windows users receive an installer such as `CIARA-Setup-x.x.x.exe`; macOS users receive a disk image such as `CIARA-x.x.x-universal.dmg`.

### Step 2 - Install
On Windows, run the installer and follow the prompts. On macOS, open the `.dmg` and drag CIARA into Applications.

### Step 3 - Open CIARA
Launch CIARA from the Start menu, desktop shortcut, or Applications folder.

> macOS first-run note: if Gatekeeper says the app cannot be verified, right-click CIARA, choose **Open**, then confirm. You only need to do this once.

### Step 4 - First-Launch Onboarding (~60 seconds)

The first time CIARA opens it shows a setup wizard:

**Step 1 - Choose a model provider**
- Use Gemma 4 through Google GenAI for fast onboarding, or configure Ollama / llama.cpp-compatible local inference for private local use.
- Add a Google AI Studio API key if using API mode.
- Optionally add a Picovoice access key to enable the "Hey CIARA" wake word.

**Step 2 - Automatic setup (~60 seconds first time)**
CIARA installs or checks its Python environment. You'll see three items go green:
- Python environment
- WebSocket connection
- Microphone access

Click **Continue** once all three are green.

**Step 3 - Shortcuts & Chrome Extension**
Shows keyboard shortcuts and buttons to install the Chrome browser extension.

### Step 5 - Grant Automation Permission

For CIARA to control your desktop (clicking buttons, typing in apps, reading your screen), it needs the relevant OS permissions. On macOS, grant Accessibility permission in **System Settings -> Privacy & Security -> Accessibility**. On Windows, run CIARA in the user session you want it to control.

> Without these permissions, CIARA can still answer questions and do web research, but cannot reliably click or type in other apps.

---

## 3. Installing the Chrome Extension

The Chrome extension lets CIARA browse the web, read page content, fill forms, and extract information from websites. It is optional but strongly recommended.

### Option A — From the CIARA Setup Wizard (easiest)

During first launch, the setup wizard's second screen shows:

- **📥 Save Extension to Downloads** — click this. CIARA saves the extension folder to your Downloads and opens it in Finder automatically.

Then continue to **Step 3** below.

### Option B — From the Download Page

Download the `ciara-browser-bridge.zip` from your download page, then unzip it by double-clicking.

---

### Installing the Extension in Chrome

After getting the extension folder by either method:

1. Open **Google Chrome**
2. In the address bar type `chrome://extensions` and press **Enter**
3. Turn on **Developer mode** — toggle in the **top-right corner**
4. Click **"Load unpacked"** (appears top-left once Developer mode is on)
5. In the file picker, navigate to and **select the `ciara-browser-bridge` folder**
6. The **CIARA Browser Bridge** extension appears in your list ✓

### Pin the Extension (recommended)

1. Click the puzzle piece icon 🧩 in Chrome's toolbar
2. Click the pin 📌 next to **CIARA Browser Bridge**

The badge turns **green** when connected to the CIARA desktop app.

> **"Developer mode" banner:** Chrome shows a warning banner at the top. You can dismiss it. It reappears occasionally — this is a Chrome limitation for extensions loaded outside the Web Store. It is safe to ignore.

---

## 4. Using CIARA (Daily Use)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘ Shift Space` | Activate voice input — pill expands and listens |
| `⌥ Space` (Option+Space) | Open the text command panel — type a command |
| `Esc` | Dismiss the overlay or cancel the current action |

### Voice Commands

Press `⌘ Shift Space` (or say *"Hey CIARA"* if the wake word is active) and speak naturally:

```
"Open Spotify"
"Search for the best noise-cancelling headphones under $200"
"What's on my screen right now?"
"Write a follow-up to my last email"
"Open YouTube and search for lo-fi music"
"Turn the volume down to 40%"
"What time is it in London?"
"Take a screenshot"
"Remember that my flight is on March 22nd"
"Close all Safari windows"
```

### Text Commands

Press `⌥ Space` to open a floating text box. Type your command and press **Enter** or click the arrow button. Useful in quiet environments or when you need precise phrasing.

### Response Cards

After completing a task, CIARA shows a **response card** which can contain:
- Plain text summaries
- Formatted tables and lists
- Math equations (rendered with KaTeX)
- Code blocks with syntax highlighting
- Step timelines showing exactly what actions were taken

Press `Esc` or click outside the card to dismiss it.

### Plan Preview

For complex multi-step tasks, CIARA shows a **plan modal** first — a numbered list of what it intends to do. You can:
- Click **Proceed** to execute the plan
- Click **Cancel** to abort

---

## 5. Starting & Stopping the App

### Starting CIARA

- Open **CIARA** from your Applications folder
- Or click the CIARA icon in your Dock (if pinned)

The glass pill appears at the top-centre of your screen within 2–3 seconds. On the very first launch, allow ~60 seconds for the Python setup.

### Stopping / Quitting CIARA

CIARA is an overlay with no traditional window or menu bar. To quit:

| Method | How |
|--------|-----|
| Dock | Right-click the CIARA dock icon → **Quit** |
| Keyboard | Press `⌘ Q` while CIARA is the active app |
| Force quit | Press `⌘ Option Esc` → select CIARA → Force Quit |
| Activity Monitor | Open Activity Monitor, search for "CIARA" or "Python", force quit both |

When the Electron window quits, the Python backend process (running on port 8000) is automatically stopped with it.

### Restarting

Simply open CIARA again. It reconnects to any existing session and resumes conversation history from where you left off (up to 30 minutes of idle time before history clears).

---

## 6. Troubleshooting

| Problem | Solution |
|---------|----------|
| Glass pill doesn't appear | Check Activity Monitor — CIARA may be on another workspace. Try pressing `⌘ Shift Space`. |
| "Hey CIARA" not responding | Wake word requires a Picovoice key. Use `⌘⇧Space` instead, or add the key on first launch / in `backend/.env` (dev) |
| Want to change the API key | Delete `~/Library/Application Support/ciara/credentials.enc` and relaunch |
| App says "Backend not ready" | Wait 60 seconds on first launch. If it persists: quit and reopen. |
| "Cannot be opened" security error | Right-click the app → Open → Open. One-time only. |
| Chrome extension shows red badge | Make sure the CIARA app is running first, then click the extension badge to reconnect |
| Accessibility actions don't work | **System Settings → Privacy & Security → Accessibility** — toggle CIARA ON |
| Slow to respond on complex tasks | Normal — the AI is planning and executing multiple steps. Simple tasks (open app, volume) respond in under 2 seconds. |
| No spoken voice response | TTS requires Google Cloud credentials. Responses still appear as text cards. |
| `xattr` error on startup | Run: `xattr -cr /Applications/CIARA.app` in Terminal, then reopen |

---

# PART 2 — FOR DEVELOPERS & OPERATORS

---

## 7. Running the Development Server

### Prerequisites

| Tool | Min Version | Install |
|------|-------------|---------|
| Node.js | 18 | `brew install node` |
| Python | 3.10+ | `brew install python@3.13` |
| npm | 9+ | bundled with Node |

> ⚠️ **Python version matters.** The codebase uses `str | None` union type syntax which requires **Python 3.10+**. The system Python on macOS is 3.9 — always use a Homebrew or pyenv Python.

### First-Time Setup

```bash
# 1. Clone the repo
git clone https://github.com/mylife-as-miles/ciara.git
cd CIARA

# 2. Install Node dependencies
npm install

# 3. Create the Python virtual environment with Python 3.10+
python3.13 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r backend/requirements.txt

# 4. Set up environment variables
cp backend/.env.example backend/.env
nano backend/.env      # fill in GEMINI_API_KEY at minimum
```

### Starting the App

```bash
npm start
```

This does three things:
1. Launches the **Electron overlay** (glass pill UI)
2. Spawns the **Python backend** (`backend/servers/local_server.py`) on `ws://127.0.0.1:8000`
3. Starts the **browser bridge** (`backend/servers/browser_bridge_server.py`) on `ws://127.0.0.1:8765`

Expected output:
```
[Backend] Starting Python server...
[Python] Server running on ws://127.0.0.1:8000
Browser bridge running on ws://127.0.0.1:8765
[Backend] READY
[Python] Electron App Connected!
[Python] [Server] Agent initialized: V2
[Python] Porcupine initialized with CUSTOM wake word: 'Hey CIARA'
```

### Stopping the App

Press `Ctrl+C` in the terminal. Electron exits, then sends `SIGTERM` to Python. Both processes shut down cleanly.

### Running the Python Backend Standalone

Useful for testing agent logic without the Electron UI:

```bash
source venv/bin/activate
python backend/servers/local_server.py
```

The backend starts on `ws://127.0.0.1:8000`. Connect with any WebSocket client (e.g. `wscat -c ws://127.0.0.1:8000/ws`) and send JSON.

### Running the Browser Bridge Standalone

```bash
source venv/bin/activate
python backend/servers/browser_bridge_server.py
# Starts on ws://127.0.0.1:8765
```

---

## 8. Environment Variables

All variables are loaded from `backend/.env`. Copy the example to get started:

```bash
cp backend/.env.example backend/.env
```

### Required

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `GEMINI_API_KEY` | Gemma 4 through Google GenAI API key — the AI brain | [aistudio.google.com](https://aistudio.google.com) |

### Recommended

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `PICOVOICE_ACCESS_KEY` | Wake word detection ("Hey CIARA"). **Without this the wake word is fully disabled** — use `⌘⇧Space` instead. | [console.picovoice.ai](https://console.picovoice.ai) — free tier available |

### Optional — Model Overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_FAST_MODEL` | `gemini-3-flash-preview` | Simple/fast single-step tasks |
| `GEMINI_POWERFUL_MODEL` | `gemini-3.1-pro-preview-customtools` | Complex multi-step reasoning |
| `GEMINI_ROUTING_MODEL` | `gemini-2.5-flash` | Classifies requests (FAST vs POWERFUL) |
| `GEMINI_FALLBACK_MODEL` | `gemini-2.5-pro` | Emergency fallback on POWERFUL failure |

### Optional — Local data & vault recall

| Variable | Description |
|----------|-------------|
| `CIARA_DATA_DIR` | Root folder for sessions, vault, screenshots, plans, milestones, memories (Electron sets this under app userData by default) |
| `CIARA_DISABLE_LOCAL_VAULT_RAG` | Set to `1` to skip TF-IDF vault recall prefix on agent prompts |

### Optional — Voice / TTS

| Variable | Default | Description |
|----------|---------|-------------|
| `CIARA_TTS_VOICE` | `en-US-Neural2-J` | Google Cloud TTS Neural2 voice |
| `CIARA_TTS_SPEED` | `1.05` | Speaking rate (1.0 = normal speed) |

### Optional — Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `CIARA_BACKEND_PORT` | `8000` | Main Python WebSocket server port |
| `CIARA_BROWSER_BRIDGE_PORT` | `8765` | Chrome extension bridge port |

---

## 9. Project Structure

```
CIARA/
├── main.js                      # Electron main process — window, IPC, Python lifecycle
├── preload.js                   # contextBridge IPC (auth, credentials, extension export)
├── package.json                 # npm scripts, electron-builder config
├── setup.sh                     # Auto-runs on first launch: creates venv, installs deps
├── hey_ciara.ppn             # Picovoice custom wake word model ("Hey CIARA")
│
├── renderer/
│   ├── index.html               # Glass-pill overlay markup + all modal scaffolding
│   ├── styles.css               # Full UI (glassmorphism, state animations, modals)
│   └── renderer.js              # UI state machine, WebSocket client, audio capture
│
├── backend/
│   ├── servers/
│   │   ├── local_server.py      # Main desktop server: audio + wake word + agent
│   │   ├── mac_client.py        # Thin entry shim (starts local_server)
│   │   └── browser_bridge_server.py  # WebSocket server for Chrome extension
│   │
│   ├── agent/
│   │   ├── core_v2.py           # SPAV agent loop — the main brain
│   │   ├── planner.py           # Milestone & step data types (dataclasses)
│   │   ├── task_planner.py      # LLM-powered milestone plan generation
│   │   ├── milestone_executor.py  # LLM micro-loop executor per milestone
│   │   ├── perception.py        # 3-layer context capture (AppleScript + DOM + Vision)
│   │   ├── verifier.py          # Post-action verification engine
│   │   ├── world_state.py       # Typed desktop context + intent classification
│   │   ├── memory.py            # Local memory (conversation, vault, profile, tasks)
│   │   ├── rag.py               # Vault formatting helpers; optional provider embeddings
│   │   ├── glance.py            # Parallel screen perception
│   │   └── constants.py         # Shared tool classification sets
│   │
│   ├── browser/
│   │   ├── bridge.py            # Browser bridge state and action queue
│   │   ├── interpreter_ai.py    # AI-driven action interpretation
│   │   ├── listing_extractor.py # Structured data extraction from web pages
│   │   ├── resolver.py          # Browser state resolution
│   │   └── selector_ai.py       # AI-powered DOM element selection
│   │
│   ├── providers/
│   │   ├── gemini.py            # Gemma 4 through Google GenAI API client (google-genai SDK)
│   │   ├── router.py            # 4-tier model router (FAST / POWERFUL / ROUTING / FALLBACK)
│   │   └── base.py              # LLMProvider abstract interface
│   │
│   ├── tools/
│   │   ├── mac_tools.py         # Desktop GUI control (click, type, open app, screenshot)
│   │   ├── browser_aci.py       # High-level compound browser tools (ACI layer)
│   │   ├── browser_tools.py     # Raw browser DOM tools
│   │   ├── file_tools.py        # File read/write/search
│   │   ├── gworkspace_tools.py  # Google Workspace (Gmail, Drive, Docs, Calendar)
│   │   ├── vault_tools.py       # Vault memory tools
│   │   ├── cloud_tools.py       # Legacy cloud stubs (unused in desktop-only builds)
│   │   └── registry.py          # Global tool registry + @registry.tool decorator
│   │
│   ├── multi_agent/
│   │   ├── sub_agent_manager.py # Parallel milestone dispatch across sub-agents
│   │   └── remote_executor.py   # Remote milestone execution
│   │
│   ├── voice/
│   │   └── tts.py               # Streamed Google Cloud TTS (Neural2, OGG/Opus)
│   │
│   ├── runtime_state.py         # Shared cancel flag / runtime store
│   ├── runtime_paths.py         # CIARA_DATA_DIR folder layout
│   └── requirements.txt         # Python dependencies
│
├── chrome_extension/
│   ├── manifest.json            # MV3 manifest
│   ├── background.js            # Service worker: WebSocket bridge + keepalive
│   ├── content_script.js        # Injected in every page: DOM reader + snapshots
│   ├── Readability.js           # Mozilla article parser (bundled)
│   ├── popup.html / popup.js    # Extension popup: connection status display
│   └── options.html / options.js  # Settings: bridge URL + auth token
│
├── build/
│   ├── entitlements.mac.plist   # macOS hardened runtime entitlements
│   └── notarize.cjs             # Apple notarization afterSign hook
│
├── scripts/
│   ├── release.sh               # Package extension + build DMG (artifacts in dist/)
│   └── package-extension.mjs    # Package Chrome extension into customer zip

```

---

## 10. How CIARA Works (Architecture)

CIARA is split into three layers that communicate over WebSockets:

```
┌─────────────────────────────────────────────────────────────┐
│  ELECTRON  (Chromium renderer process)                      │
│  Glass pill UI · State machine · Audio capture (PCM)       │
│  WebSocket client → ws://127.0.0.1:8000/ws                 │
└────────────────────────┬────────────────────────────────────┘
                         │  JSON messages over WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PYTHON BACKEND  (local_server.py)                          │
│  Wake word (Picovoice) · STT (Google) · SPAV Agent V2      │
│  Desktop tools · Memory · TTS streaming                       │
└────────────────────────┬────────────────────────────────────┘
                         │  JSON messages over WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  CHROME EXTENSION  (background.js + content_script.js)      │
│  DOM snapshots · Page interaction · Form fill               │
│  ws://127.0.0.1:8765 ←→ browser_bridge_server.py           │
└─────────────────────────────────────────────────────────────┘
```

### Complete Data Flow — a voice command end-to-end

```
User: "Hey CIARA, search Amazon for AirPods"
         │
         ▼
Electron renderer.js
  → Raw PCM audio chunks captured from mic via Web Audio API
  → Streamed to Python as base64 over WebSocket
         │
         ▼
Python local_server.py
  → pvporcupine detects wake word "Hey CIARA" in audio stream
  → SpeechRecognition + Google STT transcribes the rest
  → Sends {type: "transcription", text: "search Amazon for AirPods"}
         │
         ▼
CiaraAgentV2 (core_v2.py)
  → L1 Perception: active app + window title via AppleScript (~50ms)
  → L2 Perception: DOM snapshot from Chrome extension (~200ms)
  → Router classifies: POWERFUL model (multi-step browser task)
         │
         ▼
TaskPlanner (task_planner.py)
  → Gemma 4 powerful tier generates a MilestonePlan:
    Milestone 1: Open Amazon and search for AirPods
    Milestone 2: Extract and return the top results
         │
         ▼
SubAgentManager (multi_agent/)
  → Dispatches milestones to executor(s)
         │
         ▼
MilestoneExecutor (milestone_executor.py) — LLM micro-loop:
  → action 1: open_url("https://www.amazon.com/s?k=AirPods")
  → Verifier: URL opened? ✓
  → action 2: get_web_information() — reads page via Chrome extension
  → Verifier: results received? ✓
  → Milestone 1 COMPLETE → Milestone 2 starts
  → action 3: send_response({results table})
         │
         ▼
Electron renderer.js
  → Receives response card payload
  → Renders results table in the overlay
  →  Optional: plays TTS audio (streamed OGG/Opus chunks from Google TTS)
```

### WebSocket Message Protocol

| Direction | Message type | Meaning |
|-----------|-------------|---------|
| Server → Renderer | `state-idle` | Show idle glass pill |
| Server → Renderer | `state-listening` | Show listening pill with typewriter transcription |
| Server → Renderer | `state-loading` | Show thinking dots |
| Server → Renderer | `state-doing` | Show spinner + action text |
| Server → Renderer | `response` | Final response card (Markdown / table / text) |
| Server → Renderer | `thinking` | Visible thought bubble during planning |
| Server → Renderer | `await_reply` | Keep mic open for follow-up reply |
| Server → Renderer | `tts_chunk` | Streamed audio chunk (base64 OGG/Opus) |
| Renderer → Server | `audio_data` | Raw PCM audio chunk (base64) |
| Renderer → Server | `user_action` | Button press: `approve_plan` / `cancel_plan` |
| Renderer → Server | `text_command` | Text typed in command panel |

---

## 11. The SPAV Agent Loop Explained

The core AI engine uses **SPAV**: **S**ense → **P**lan → **A**ct → **V**erify. This is implemented in `backend/agent/core_v2.py`.

### Stage 1 — Sense (Perception)

Three layers run in parallel before every LLM call:

| Layer | Method | What it captures | Latency |
|-------|--------|-----------------|---------|
| L1 | AppleScript (`osascript`) | Active app name, window title, browser URL | ~50ms |
| L2 | Chrome extension DOM snapshot | Page text, selected text, element refs | ~200ms |
| L3 | Gemma 4 vision (screenshot) | Full visual understanding of screen | ~1s (on demand only) |

The combined `ContextSnapshot` is serialised into a compact structured block and injected into every LLM system prompt so the model always knows exactly what's on screen.

### Stage 2 — Plan (Milestone Planning)

`TaskPlanner` calls Gemma 4 powerful tier with the user's intent + perceived context and generates a `MilestonePlan` — a list of `Milestone` dataclasses:

```python
@dataclass
class Milestone:
    id: int
    goal: str            # "What must be accomplished" (natural language outcome)
    success_signal: str  # "What observable evidence proves it is done"
    hint_tools: List[str]  # Suggested tool categories (advisory, not prescriptive)
```

This is the core design insight — the planner specifies **what** to achieve, never **how**. The executor figures out the how. This makes the system far more robust than step-by-step scripts.

### Stage 3 — Act (Milestone Executor)

Each milestone runs its own LLM micro-loop in `MilestoneExecutor`:

1. Show the LLM: milestone goal + success signal + available tools + results so far
2. LLM picks the next tool to call (or declares the milestone done)
3. Tool executes (desktop API / Chrome extension / web)
4. Result fed back to LLM
5. Repeat until the success signal is satisfied or the safety cap (50 actions) is hit

Independent milestone groups are dispatched **in parallel** by `SubAgentManager` to save time on multi-part tasks.

### Stage 4 — Verify

After every tool call, `ToolVerifier` checks:
- Tool output for error keywords and failure patterns
- For UI-mutating actions (click, type): re-reads the screen to confirm the action had effect
- High-confidence deterministic actions (e.g. `open_url`) get a fast-path skip to avoid wasted latency
- If verification fails, the executor can retry with a suggested fix from the verifier

### Model Routing

The `ModelRouter` classifies every incoming request before execution and picks the right Gemma 4 runtime tier:

| Tier | Model | When used |
|------|-------|-----------|
| ROUTER | `gemma-4-26b-a4b-it` or configured fast model | Classifies every request (FAST vs POWERFUL) |
| FAST | `gemma-4-26b-a4b-it` or local equivalent | Open app, volume, brightness, one-liner facts |
| POWERFUL | `gemma-4-31b-it` or configured powerful model | Complex, multi-step, browser, screen, and multimodal tasks |
| LOCAL | Ollama / llama.cpp OpenAI-compatible endpoint | Private or self-hosted Gemma 4-compatible local inference |

Only a small share of requests should go to FAST. The router is deliberately biased toward POWERFUL because routing a complex task to the weak path causes failures.
---

## 12. Google APIs & Local Data

CIARA can call Google APIs for Gemma 4 inference and voice, but sessions, vault, screenshots, plans, and milestones are stored on disk under `CIARA_DATA_DIR`.

### 1. Gemma 4 model routing - the AI brain

CIARA routes intelligent decisions through Gemma 4 via Google GenAI or local OpenAI-compatible runtimes (`backend/providers/router.py`, `backend/providers/gemini.py`, `backend/providers/openai_compatible.py`):

- **Fast tier** - routing and simple execution, defaulting to `gemma-4-26b-a4b-it`.
- **Powerful tier** - complex reasoning, browser tasks, screen understanding, and multimodal work, defaulting to `gemma-4-31b-it`.
- **Local tier** - Ollama or llama.cpp/OpenAI-compatible endpoints for private and self-hosted workflows.

The provider interface supports tool/function calls so the executor can directly call the right tool instead of parsing free text.

### 2. Google Cloud Text-to-Speech - voice output

Spoken responses use Google Cloud Text-to-Speech when configured:

- The response is split into sentences.
- Sentences can be synthesized concurrently.
- Audio chunks are yielded in order as they finish.
- Output format: OGG/Opus.

### 3. Local persistence & vault recall

The desktop server keeps durable state in folders such as `sessions/`, `vault/`, `screenshots/`, `plans/`, `milestones/`, and `memories/` (see `backend/runtime_paths.py`). Optional TF-IDF vault recall prefixes agent prompts with relevant vault snippets (`backend/servers/local_augment.py`, formatted via `backend/agent/rag.py`). Set `CIARA_DISABLE_LOCAL_VAULT_RAG=1` to turn that off.

### Infrastructure Summary

```text
Your desktop
  - Electron overlay (UI, audio, local tools)
  - local_server.py (Python WebSocket backend)
      - Gemma 4 API via Google GenAI or local Ollama/llama.cpp-compatible runtime
      - Optional Google Cloud TTS
      - Disk-backed memory / vault under CIARA_DATA_DIR
```

---

## 13. How the Software Was Built

### Technology Stack

| Layer | Technology | Why chosen |
|-------|-----------|-----------|
| Desktop shell | **Electron 36** | True OS-level transparent overlay; `setIgnoreMouseEvents` for click-through; Chromium renderer for CSS glassmorphism + KaTeX math |
| UI | **Vanilla JS + CSS** | No framework overhead; direct DOM manipulation for 60fps state transitions |
| Backend | **Python 3.13 + asyncio + websockets** | Local agent runtime, browser bridge, voice pipeline, tool execution, and clean concurrent I/O |
| AI provider | **Gemma 4 via Google GenAI, Ollama, or llama.cpp/OpenAI-compatible runtimes** | Tool calling, multimodal screen reasoning, hybrid cloud/local deployment, and provider choice |
| Desktop control | **Windows APIs, AppleScript, pyobjc/Quartz, screenshots, accessibility** | Gives CIARA a fallback ladder for app launching, keyboard, mouse, visual targeting, and native UI control |
| Wake word | **Picovoice Porcupine** | On-device, low-power, custom wake word ("Hey CIARA"); no audio leaves the device for detection |
| Voice output | **Google Cloud TTS Neural2** | Natural prosody; concurrent sentence synthesis for streaming feel; OGG/Opus output plays natively in Chromium |
| Browser bridge | **Chrome Extension MV3** | Bridges the real browser the user has open (with all their logged-in state and cookies) rather than a headless browser |
| Persistence | **Local disk (`CIARA_DATA_DIR`)** | Sessions, vault JSON, screenshots, plans/milestones — no hosted database in this tree |
| Vault recall | **TF-IDF + `rag.format_vault_results_for_prompt`** | Lightweight recall for desktop prompts; optional provider embeddings remain available in `rag.py` for advanced use |
| Distribution | **electron-builder** | Builds Windows installers and macOS DMGs; ships app and extension artifacts from `dist/` |

### Key Design Decisions

**Why SPAV instead of a simple chat loop?**
Early versions used a naive "LLM picks a tool, executes, repeats" loop. This failed on multi-step tasks because there was no separation between planning and execution. SPAV adds an explicit planning stage that produces observable, verifiable milestones — making complex tasks far more reliable and debuggable.

**Why milestone-based planning instead of step-by-step scripts?**
A step plan tells the LLM exactly which tool calls to make. A milestone plan tells it what observable outcome to achieve. Milestones are more robust because:
- The executor can adapt if an early step fails (different path, same goal)
- The verifier confirms the milestone was truly achieved before moving on
- Independent milestones can run in parallel (via `SubAgentManager`)
- The LLM isn't over-constrained — it has full autonomy within each milestone scope

**Why a separate Chrome extension instead of Electron's browser?**
CIARA is a desktop overlay, not a browser. The Chrome extension bridges the real browser the user already has open, complete with their logged-in sessions, cookies, and browser history. This means web automation works on any site, including banking and internal tools.

**Why keep the agent local-first?**
A desktop agent needs low-latency access to the user session, browser, files, screen, voice, and OS automation APIs. Running `local_server.py` locally keeps actions responsive and stores memory under the user data directory while still allowing cloud or local Gemma 4 providers.

**Memory architecture — four tiers**
CIARA mirrors how humans actually remember things:

| Tier | Implementation | Scope | Persistence |
|------|---------------|-------|-------------|
| Working memory | In-process Python dict | Current task, action log, entities | Until task ends |
| Short-term | `ConversationMemory` (20 turns) | Recent conversation | 30 min idle timeout |
| Long-term | `UserProfile` (auto-extracted facts) | Who you are, what you like | Permanent |
| Vault | `VaultMemory` (explicit storage) | Things you told CIARA to remember | Permanent, semantic search |

**How the Chrome extension element referencing works**
The content script assigns a stable `ref` ID to every interactive element on every page. These IDs are based on element position, tag, role, and text content — they survive re-renders if the element itself doesn't change. The agent uses these refs to click or type into elements reliably (e.g. `browser_click_ref(ref="btn_submit_1")`) rather than fragile CSS selectors or XPath.

---

## 14. Building Release Artifacts

### App Icon

electron-builder requires `build/icon.icns`. Create it from a 1024×1024 PNG:

```bash
mkdir -p build/icon.iconset
for size in 16 32 64 128 256 512; do
  sips -z $size $size icon.png --out build/icon.iconset/icon_${size}x${size}.png
  sips -z $((size*2)) $((size*2)) icon.png \
    --out build/icon.iconset/icon_${size}x${size}@2x.png
done
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
```

Then add to `package.json` → `build.mac`:
```json
"icon": "build/icon.icns"
```

### Build

```bash
# Universal DMG (Apple Silicon + Intel in one file)
npm run build:signed

# Output: dist/CIARA-1.0.0-universal.dmg
```

The DMG bundles: Electron runtime, all renderer files, the `backend/` folder, `hey_ciara.ppn`, `chrome_extension/`, and `setup.sh` (runs automatically on first launch to create the Python venv).

---

## 15. Code Signing & Notarization

Notarization removes the Gatekeeper security warning so customers can double-click to open the app without any friction.

### Prerequisites

- **Apple Developer Program** membership ($99/year) — [developer.apple.com](https://developer.apple.com)
- **Developer ID Application** certificate installed in your macOS Keychain (download from the Apple Developer portal)
- An **app-specific password** — generate at [appleid.apple.com](https://appleid.apple.com/account/manage) under *Sign-In and Security → App-Specific Passwords*
- Your 10-character **Team ID** — find it at [developer.apple.com/account](https://developer.apple.com/account) → Membership Details

### Set Environment Variables

```bash
# Identity installed in Keychain (exact string from Keychain Access)
export CSC_NAME="Developer ID Application: Your Name (XXXXXXXXXX)"

# Apple notary credentials
export APPLE_ID="your@apple.id"
export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # App-specific, NOT your Apple ID password
export APPLE_TEAM_ID="XXXXXXXXXX"                  # 10-character Team ID
```

### Build with Full Signing + Notarization

```bash
npm run build:signed
```

The `build/notarize.cjs` afterSign hook runs automatically after signing. It submits the `.app` to Apple's notary service and waits for approval (typically 2–5 minutes). Once approved, any Mac in the world can open the app by double-clicking — no Gatekeeper warning.

### Without Signing (development only)

Leave the env vars unset. The build still produces a working unsigned DMG. Customers must right-click → Open on first launch.

---

## 16. Shipping Release Artifacts

### One-command release (local artifacts)

```bash
./scripts/release.sh
```

This pipeline:
1. **Packages the Chrome extension** → `dist/ciara-browser-bridge.zip` (with an `INSTALL.md` guide inside for customers)
2. **Builds the signed + notarized macOS DMG** (when signing env vars are set) → `dist/CIARA-x.x.x-universal.dmg`

Artifacts remain in `dist/`. Host them however you prefer (email, internal drive, your own CDN). This repository does **not** include `upload-gcs.mjs` or a Cloud Run deploy script.

### Step-by-step

```bash
# 1. Package extension
npm run dist:extension
# → dist/ciara-browser-bridge.zip

# 2. Build release artifact
npm run build:signed
# → dist/CIARA-1.0.0-universal.dmg (version from package.json)
```

### Share with customers

Send users the installer/DMG (and optionally the extension zip) directly, or publish both files to your chosen download location.

---

## 17. Running Tests

```bash
# Full test suite
cd tests && bash run_test.sh

# Individual test modules
python -m pytest tests/test_agent_v2.py -v              # Core agent loop
python -m pytest tests/test_milestone_executor.py -v    # Milestone execution
python -m pytest tests/test_milestone_planning.py -v    # Plan generation
python -m pytest tests/test_browser_scenarios.py -v     # Browser automation
python -m pytest tests/test_verifier_aci.py -v          # Verification engine
python -m pytest tests/test_multi_agent.py -v           # Parallel sub-agents
python -m pytest tests/test_reliability_recovery.py -v  # Error recovery
python -m pytest tests/test_replanning.py -v            # Dynamic replanning
python -m pytest tests/test_router.py -v                # Model routing

# WebSocket integration test
node tests/ws_test.js

# Quality + intelligence benchmarks
python benchmarks/run_benchmarks.py
```

---

*Last updated: 9 May 2026*
