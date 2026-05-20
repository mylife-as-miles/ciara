# CIARA

**Control Intelligence Assistant for Real-time Automation** - a local-first Gemma 4 desktop agent for everyday computer tasks.

CIARA helps users operate browsers, forms, files, apps, and repetitive workflows through voice or text. It runs as an Electron desktop overlay with a local Python backend, Chrome extension bridge, OS automation tools, and hybrid model routing across Gemma 4 API, Ollama, and llama.cpp/OpenAI-compatible local runtimes.

Built with Electron + Python. Thinks with Gemma 4. Acts through browser DOM tools, screenshots, mouse/keyboard control, and platform automation APIs.

---

<p align="center">
  <img src="docs/screenshots/Moonwalk.png" alt="CIARA interface preview" width="480"/>
</p>

## Why CIARA

Many people know what they want to do on a computer, but the desktop turns that goal into dozens of small technical steps: open tabs, find fields, copy text, rename files, fill forms, compare pages, and avoid mistakes.

CIARA collapses those workflows into natural conversation:

> Tell CIARA the goal. CIARA senses context, creates a plan, acts through browser or desktop tools, and verifies the result.

## Features

- **Voice and text control** - say "Hey CIARA" or use the command panel, then describe the task naturally.
- **SPAV agent loop** - Sense -> Plan -> Act -> Verify with milestone-based execution.
- **Gemma 4 model routing** - API mode for easy onboarding, Ollama for local private use, llama.cpp/OpenAI-compatible endpoints for self-hosted control.
- **Screen understanding** - desktop metadata, browser DOM snapshots, and screenshot vision for visual tasks.
- **Browser automation** - Chrome extension bridge can read pages, find elements, click, type, fill forms, and extract data.
- **Desktop automation** - app launching, keyboard input, mouse control, screenshots, accessibility, and visual fallback paths.
- **Local-first memory** - sessions, vault, screenshots, plans, milestones, and memories stay under `CIARA_DATA_DIR` / `~/.ciara`.
- **Verification layer** - UI-mutating actions are checked through DOM changes, screenshot changes, or tool-specific success signals.

---

## UI States

The glass pill morphs between four states:

<table>
<tr>
<td align="center"><strong>Idle</strong><br/><img src="docs/screenshots/pill-idle.svg" width="280"/><br/><code>220px</code> - mic icon + "Hey CIARA"</td>
<td align="center"><strong>Listening</strong><br/><img src="docs/screenshots/pill-listening.svg" width="280"/><br/><code>440px</code> - typewriter transcription</td>
</tr>
<tr>
<td align="center"><strong>Thinking</strong><br/><img src="docs/screenshots/pill-loading.svg" width="280"/><br/><code>140px</code> - bouncing dots</td>
<td align="center"><strong>Doing</strong><br/><img src="docs/screenshots/pill-doing.svg" width="280"/><br/><code>320px</code> - spinner + app icon + action</td>
</tr>
</table>

### Response Card and Plan Preview

<table>
<tr>
<td align="center"><img src="docs/screenshots/response-card.svg" width="360"/><br/><strong>Streaming response card</strong><br/>Markdown, KaTeX math, code blocks</td>
<td align="center"><img src="docs/screenshots/plan-modal.svg" width="360"/><br/><strong>Plan preview modal</strong><br/>Step-by-step with approval controls</td>
</tr>
</table>

### Command Panel and Onboarding

<table>
<tr>
<td align="center"><img src="docs/screenshots/command-panel.svg" width="360"/><br/><strong>Command panel</strong><br/>Type-to-prompt with send button</td>
<td align="center"><img src="docs/screenshots/onboarding.svg" width="360"/><br/><strong>First-launch onboarding</strong><br/>Provider setup and keyboard shortcuts</td>
</tr>
</table>

---

## Architecture

<p align="center">
  <img src="docs/screenshots/architecture.svg" alt="CIARA architecture" width="800"/>
</p>

### Agent Loop

<p align="center">
  <img src="docs/screenshots/spav-loop.svg" alt="SPAV agent loop" width="600"/>
</p>

CIARA has three main action surfaces:

| Surface | What it does |
| --- | --- |
| Browser DOM | Reads pages, finds elements, clicks, types, selects, extracts structured data |
| Desktop UI | Uses screenshots, accessibility, keyboard, mouse, app launching, and visual targeting |
| Files/system | Reads, writes, organizes, searches, and runs local workflow commands |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/mylife-as-miles/ciara.git
cd ciara
npm install

# 2. Python environment
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# 3. Environment variables
copy .env.example .env
# Add your Google AI Studio key or configure local model settings in the app.

# 4. Launch
npm start
```

On macOS/Linux, use `chmod +x setup.sh && ./setup.sh` or create the virtual environment with your platform's activation command.

## Model Providers

CIARA supports hybrid Gemma 4 deployment:

| Mode | Best for |
| --- | --- |
| Gemma 4 API via Google GenAI | Fast onboarding, strongest hosted model quality |
| Ollama local mode | Private local inference and Ollama special-track demos |
| llama.cpp/OpenAI-compatible mode | Self-hosted or resource-constrained local runtimes |

Relevant environment variables:

```bash
CIARA_LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_FAST_MODEL=gemma-4-26b-a4b-it
GEMINI_POWERFUL_MODEL=gemma-4-31b-it

# Local examples
CIARA_LLM_PROVIDER=ollama
CIARA_LOCAL_MODEL=gemma-4
CIARA_LOCAL_BASE_URL=http://127.0.0.1:11434/v1
```

## Chrome Extension

The **CIARA Browser Bridge** extension enables web automation:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select `chrome_extension/`.
4. Open extension options and set the bridge URL/auth token if needed.

The agent can then search, read pages, extract listings, fill forms, and interact with sites through stable DOM references.

## Project Structure

```text
ciara/
  main.js                    Electron main process
  preload.js                 IPC bridge
  package.json               Electron + builder config
  renderer/                  Overlay UI
  backend/
    servers/local_server.py  Local WebSocket backend
    providers/               Gemma 4 API + local runtime routing
    agent/                   SPAV agent, planner, executor, verifier, memory
    browser/                 Chrome extension bridge and DOM state
    tools/                   Browser, file, shell, desktop, and OS tools
  chrome_extension/          MV3 browser bridge
  docs/                      Guides, diagrams, screenshots, hackathon audit
  tests/                     Test suite
  benchmarks/                Quality and intelligence scenarios
```

## Testing

```bash
python -m pytest tests/test_agent_v2.py -v
python -m pytest tests/test_milestone_executor.py -v
python -m pytest tests/test_browser_scenarios.py -v
python benchmarks/run_benchmarks.py
```

## Building

```bash
# Windows installer
npx electron-builder --win

# macOS DMG
npx electron-builder --mac --universal
```

See [docs/GUIDE.md](docs/GUIDE.md) for setup, packaging, Chrome extension installation, and release details.

## Hackathon Positioning

Recommended title:

> CIARA: Local-First Gemma 4 Desktop Agent for Everyday Computer Tasks

Recommended one-line pitch:

> CIARA collapses forms, tabs, files, apps, and repetitive workflows into natural conversation, using Gemma 4 as a hybrid cloud/local desktop agent that can sense, plan, act, and verify.

See [docs/HACKATHON_TECH_AUDIT.md](docs/HACKATHON_TECH_AUDIT.md) for the full technical audit.

## License

MIT

---

<p align="center">
  <strong>CIARA</strong> - Local-first desktop automation powered by Gemma 4<br/>
  <sub>Voice-first - Browser bridge - SPAV agent - Hybrid local/cloud runtime</sub>
</p>
