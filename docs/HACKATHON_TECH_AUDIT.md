# CIARA Hackathon Technical Audit

## Executive read

CIARA is not a simple chatbot wrapper. The codebase is a full desktop agent stack built around a local Electron shell, a Python agent backend, a Chrome extension bridge, operating-system automation tools, browser DOM tools, local memory, provider routing, and verification logic.

For the Gemma 4 Good Hackathon, the strongest framing is:

> CIARA turns Gemma 4 into a local-first desktop agent for everyday computer tasks. It helps users operate browsers, forms, files, apps, and repetitive workflows through natural language while choosing the right balance of cloud quality, local privacy, cost, and connectivity.

The core technical identity is:

> Sense -> Plan -> Act -> Verify

Gemma 4 is central because it is used as the reasoning layer for task understanding, milestone planning, tool selection, browser and desktop workflow reasoning, screenshot understanding, verification support, and provider routing across API, Ollama, and llama.cpp/OpenAI-compatible local runtimes.

## Tech stack inventory

| Layer | Implementation | Evidence |
| --- | --- | --- |
| Desktop shell | Electron 36 app | `package.json`, `main.js` |
| Frontend UI | HTML/CSS/JS renderer | `renderer/index.html`, `renderer/renderer.js` |
| Backend | Python 3 local WebSocket server | `backend/servers/local_server.py` |
| Agent engine | CIARA Agent V2 with memory, planning, tools, verifier | `backend/agent/core_v2.py` |
| Planning | Milestone planner and milestone executor | `backend/agent/task_planner.py`, `backend/agent/milestone_executor.py` |
| Model routing | Gemma 4 cloud/local router | `backend/providers/router.py` |
| Cloud model provider | Google GenAI / Gemini API, using Gemma 4 model names | `backend/providers/gemini.py` |
| Local model provider | OpenAI-compatible adapter for Ollama, llama.cpp, self-hosted endpoints | `backend/providers/openai_compatible.py` |
| Browser control | Chrome MV3 extension plus WebSocket bridge | `chrome_extension/`, `backend/browser/bridge.py` |
| Desktop control | OS automation, keyboard, mouse, screenshots, accessibility | `backend/tools/mac_tools.py` |
| Verification | Tool result verification, visual verification, UI mutation checks | `backend/agent/verifier.py`, `backend/reliability.py` |
| Memory | Local data root, sessions, vault, plans, milestones, screenshots | `backend/runtime_paths.py`, `backend/agent/memory.py` |
| Voice | Wake word, speech recognition, TTS hooks | `backend/servers/local_server.py`, `backend/requirements.txt` |
| Packaging | Windows NSIS and macOS DMG | `electron-builder.yml` |
| Tests and benchmarks | Unit, browser, agent, reliability, and benchmark scenarios | `tests/`, `benchmarks/` |

## Runtime architecture

CIARA runs as a local desktop application.

1. Electron launches the user interface and starts or connects to the Python backend.
2. The backend exposes a WebSocket server for text, voice, task state, tool events, cancellation, and browser bridge events.
3. The agent receives a user goal, builds context from screen/browser/memory, routes the task to a Gemma 4 model tier, creates a milestone plan, executes tools, and verifies progress.
4. The Chrome extension connects back to the backend over localhost WebSocket and provides DOM snapshots, readable page extraction, element references, and browser actions.
5. Desktop tools provide OS-level fallback through screenshots, mouse movement, keyboard input, accessibility tree inspection, and visual targeting.

This means CIARA has three action surfaces:

| Surface | What it does |
| --- | --- |
| Browser DOM | Reads pages, finds elements, clicks/types/selects with stable refs |
| Desktop UI | Uses mouse, keyboard, screenshots, accessibility, app launching |
| Files/system | Reads/writes files, opens apps, manages local state and vault memory |

## Agentic architecture

CIARA's agent flow is built around a real planning and execution loop, not a single prompt.

### 1. Sense

The perception layer collects context before acting:

- Active app and window title.
- Browser URL and page title.
- Selected text.
- Visible page text.
- Browser DOM snapshots from the extension when available.
- Screenshot capture when vision is needed.
- Clipboard context when useful.

The key implementation is `backend/agent/perception.py`. It uses a layered approach:

| Layer | Meaning |
| --- | --- |
| L1 | Fast desktop metadata such as active app, window, browser URL |
| L2 | Browser and text context such as selected text, visible text, DOM snapshot |
| L3 | Screenshot vision for visual understanding |

There is also a lightweight glance system in `backend/agent/glance.py`. It can cheaply peek at UI state, refresh accessibility state, or do a deeper screenshot-based visual look when necessary.

### 2. Plan

The planner converts user goals into milestone plans.

`backend/agent/task_planner.py` instructs the model to define what must happen, not every low-level click. A milestone includes:

- A user-visible description.
- A success signal.
- Tool hints.
- Dependencies.
- Risk and approval posture.

This is important for the hackathon story because the user can see the agent thinking in terms of goals, not hidden automation.

### 3. Act

`backend/agent/milestone_executor.py` runs each milestone through a bounded micro-loop:

1. Perceive the current state.
2. Ask the model for the next best tool action.
3. Execute exactly one action or a small safe step.
4. Feed the result back.
5. Continue until success or a safety cap is reached.

The executor uses a hard safety cap and explicitly tells the model to inspect browser or screen state before interacting. Browser interactions are encouraged through high-level ACI tools instead of raw low-level primitives.

### 4. Verify

Verification is implemented at several levels:

- `backend/agent/verifier.py` checks tool-specific success.
- `backend/reliability.py` captures pre-action and post-action context for UI-mutating tools.
- Browser actions use DOM generation changes and snapshot changes.
- Desktop actions use screenshot perceptual hash changes.
- Milestone completion claims can be checked against visual or DOM state.

This is the Safety & Trust angle: CIARA does not just click blindly. It senses, plans, acts, checks whether the world changed, and can recover or pause when it did not.

## How Gemma 4 is central

Gemma 4 should be described as the agent brain, not as a chat feature.

The current router defaults to Gemma 4 models:

| Role | Model |
| --- | --- |
| Fast model | `gemma-4-26b-a4b-it` |
| Powerful model | `gemma-4-31b-it` |

The router decides whether a task needs fast or powerful reasoning. Simple commands can use the fast path. Browser tasks, UI reasoning, multistep work, files, and screen tasks are routed to the stronger model tier.

Gemma 4 is used for:

- Understanding natural-language user goals.
- Classifying task complexity.
- Creating milestone plans.
- Choosing tools during the execution loop.
- Reasoning over browser state and page text.
- Understanding screenshots through multimodal calls.
- Verifying whether a milestone is complete.
- Explaining actions back to the user.

This is the important judging line:

> CIARA does not put Gemma 4 behind a chat box. It turns Gemma 4 into a desktop command layer that can see context, plan work, call tools, control the browser and desktop, and verify outcomes.

## Provider routing: API, Ollama, llama.cpp

CIARA has a strong hybrid runtime story.

`backend/providers/router.py` supports:

- Google GenAI / Gemini API mode for Gemma 4 cloud access.
- Ollama mode through an OpenAI-compatible local endpoint.
- llama.cpp mode through an OpenAI-compatible local endpoint.
- Generic `openai-compatible-local` mode for self-hosted runtimes.

`backend/providers/openai_compatible.py` adapts CIARA's internal model interface to `/v1/chat/completions`. It handles:

- Message conversion.
- Tool declarations.
- Tool call parsing.
- Optional vision support.
- Base URL and API key configuration.

Electron stores and passes provider settings into the backend via environment variables:

- `CIARA_LLM_PROVIDER`
- `CIARA_LOCAL_MODEL`
- `CIARA_LOCAL_BASE_URL`
- `CIARA_LOCAL_API_KEY`
- `CIARA_LOCAL_SUPPORTS_TOOLS`
- `CIARA_LOCAL_SUPPORTS_VISION`
- `GEMINI_API_KEY`

The renderer UI exposes provider choices for Gemma 4 API, Ollama, and llama.cpp-compatible local runtimes.

For the hackathon, this should be framed as a product decision:

> API mode makes onboarding easy. Ollama mode gives private local inference. llama.cpp-compatible mode gives advanced self-hosted control and resource-constrained deployment.

That turns "multiple providers" into a clear impact story: CIARA adapts to the user's reality.

## Screen understanding

CIARA understands the screen through multiple methods.

### Desktop metadata

It can inspect active app, window title, browser URL, and selected text. On macOS this uses AppleScript. On Windows, parts of the stack use Windows APIs and screenshot fallbacks.

### Browser DOM

When Chrome extension support is available, CIARA does not need to guess from pixels. It can read a structured page snapshot with:

- URL.
- Title.
- Viewport.
- DOM generation.
- Interactive elements.
- Readable text.
- Element bounds.
- Stable element references.

### Screenshot vision

`read_screen` in `backend/tools/mac_tools.py` captures the screen, optionally overlays a grid, encodes the image, and sends it to the powerful Gemma 4-compatible model for analysis.

This supports requests like:

- "What is on my screen?"
- "Click the button near the top right."
- "Find the price on this page."
- "Tell me what changed."
- "Help me fill this form."

The visual path is especially important when DOM access fails, the user is outside the browser, or the app is a native desktop UI.

## Mouse and keyboard control

CIARA has real desktop automation.

Key capabilities in `backend/tools/mac_tools.py` include:

- Open apps.
- Type text.
- Press keys and key combinations.
- Move the mouse.
- Click coordinates.
- Double click.
- Right click.
- Drag.
- Scroll.
- Read screen.
- Locate UI elements visually.
- Click UI by label or description.
- Type into fields by label or description.
- Inspect an accessibility tree on macOS.

Windows support exists through `ctypes.windll.user32` for mouse actions and clipboard paste for text entry. macOS support uses AppleScript, Quartz, and accessibility-oriented flows.

The important technical point:

> CIARA can use DOM refs when the browser extension is connected, accessibility refs when native UI structure is available, and visual coordinates when it has to operate from pixels.

That gives it a practical fallback ladder:

1. Structured browser action.
2. Accessibility action.
3. Visual locate.
4. Coordinate click/type.

## Chrome extension architecture

The Chrome extension is a major strength for the demo and writeup.

It is a Manifest V3 extension with:

- `content_script.js`
- `background.js`
- `Readability.js`
- `options.html`

The background script maintains a WebSocket connection to the local backend at `ws://127.0.0.1:8765`.

The content script:

- Tags interactive DOM elements with `data-agent-id`.
- Builds snapshots of visible and interactive elements.
- Assigns stable refs.
- Extracts role, tag, text, aria label, name, placeholder, href, bounds, and action types.
- Executes click/type/select actions.
- Extracts readable article content.
- Watches DOM mutations and sends change events.

This is more robust than pure computer vision because CIARA can often act on semantic browser elements instead of fragile coordinates.

For the video, show the extension bridge as the reason CIARA can operate websites reliably:

> The browser bridge gives Gemma 4 a structured view of the page: buttons, fields, text, links, and form controls. Gemma 4 plans the task, then CIARA executes through stable browser references and verifies the page changed.

## Tool registry and action safety

`backend/tools/registry.py` is a key safety layer.

It:

- Registers tools.
- Converts tools into model function declarations.
- Requires a `reasoning` field for most tool calls.
- Applies timeouts.
- Retries non-UI tools when safe.
- Emits tool events to the UI.
- Captures pre-action context for UI-mutating tools.
- Verifies post-action changes.

Requiring reasoning is useful for trust:

> Each action is paired with a short reason, so the system can expose why it is about to click, type, open, or change something.

## Automation and recovery

`backend/reliability.py` defines UI-mutating tools and checks whether an action changed anything visible.

Examples:

- Browser click should change DOM generation, URL, focused element, or page state.
- Desktop click/type should change the screenshot hash or UI state.
- If no visible change occurs, the tool can return a `no_visible_change` signal instead of pretending success.

This is a practical agent reliability feature. It supports the claim that CIARA verifies actions instead of blindly continuing.

## Local-first data model

`backend/runtime_paths.py` keeps CIARA data under a local user data root, defaulting to `~/.ciara` unless `CIARA_DATA_DIR` is set.

Local data folders include:

- Sessions.
- Conversations.
- Vault.
- Screenshots.
- Plans.
- Milestones.
- Memories.

This supports the privacy story:

> CIARA keeps task memory and user context local by default. The user can choose API mode for convenience or local inference mode for privacy-sensitive and low-connectivity workflows.

## Voice and conversational control

The backend includes voice-oriented dependencies and flow:

- Porcupine wake word support.
- Microphone recording.
- Speech recognition.
- Text-to-speech hooks.
- Conversation mode toggles.
- Cancellation support.

For the hackathon, voice should be framed as an accessibility and digital inclusion feature:

> Users can speak a goal instead of knowing menus, keyboard shortcuts, file paths, or exact UI terminology.

## Tests and benchmarks

The repository has meaningful test coverage and benchmark scaffolding:

- Router tests.
- Agent V2 tests.
- Milestone planner and executor tests.
- Browser scenario tests.
- Reliability and recovery tests.
- Tool reasoning tests.
- Benchmark scenarios for agent quality and intelligence.

This is useful for judging because it proves CIARA is more than a UI mockup.

Suggested writeup language:

> CIARA includes unit tests and benchmark scenarios for planning, tool calling, browser interaction, reliability recovery, and agent routing. The demo is backed by a working agent runtime rather than a scripted frontend.

## Hackathon strengths

### 1. Strong Digital Equity fit

CIARA helps users who struggle with computers because of low digital literacy, accessibility needs, language barriers, privacy requirements, unreliable connectivity, or cost constraints.

The pain is easy to understand:

> People know what they want to do, but the computer turns the goal into dozens of small technical steps.

### 2. Strong Gemma 4 fit

Gemma 4 is used for agentic reasoning, not just conversation.

CIARA needs:

- Natural language understanding.
- Tool calling.
- Multistep planning.
- Browser reasoning.
- Screen understanding.
- Verification.
- Local/cloud model routing.

Those are exactly the capabilities the hackathon brief emphasizes.

### 3. Strong local-first story

CIARA can work through local runtimes when privacy, cost, or connectivity matter. This mirrors the winning pattern from recent Google hackathons: deployment constraints are part of the product story, not a side note.

### 4. Strong demo potential

CIARA can show visible transformation:

1. A user states a goal.
2. CIARA senses the current page or desktop.
3. CIARA creates a plan.
4. The user approves.
5. CIARA acts in browser/desktop.
6. CIARA verifies the task.
7. The result is visible on screen.

This is better than demoing a list of features.

## Submission risks to clean before deadline

### 1. Special track proof must be visible

If choosing the Ollama special technology track, the video must visibly show:

- Local provider selected as Ollama.
- Gemma 4 model available or pulled.
- A real task using that local runtime.

If choosing llama.cpp instead, make that the visible proof.

### 2. Claims should match tested reality

Avoid overclaiming full offline operation if the current demo still requires setup, a model download, or browser extension installation. Phrase it as:

> CIARA supports local-first operation through Ollama and llama.cpp-compatible runtimes.

That is safer and still strong.

## Judge-facing architecture paragraph

CIARA is an Electron desktop app with a Python agent backend, a Chrome extension bridge, and OS-level automation tools. At its center is a Sense -> Plan -> Act -> Verify loop. Gemma 4 interprets the user's natural-language goal, reasons over the current desktop and browser context, creates a milestone plan, selects tools, and verifies whether the task succeeded. The provider router lets CIARA run through Gemma 4 API mode for fast onboarding, Ollama for private local inference, and llama.cpp/OpenAI-compatible endpoints for self-hosted control. The browser extension gives the agent structured DOM snapshots and stable element references, while desktop tools provide screenshots, mouse control, keyboard input, and accessibility fallbacks. CIARA is designed to make everyday computer tasks accessible through intent instead of technical skill.

## Recommended final title

> CIARA: Local-First Gemma 4 Desktop Agent for Everyday Computer Tasks

This is clearer than "Digital Access" for a public audience. The writeup can still explain that everyday computer task automation is the mechanism for digital equity.

## Recommended one-line pitch

> CIARA collapses forms, tabs, files, apps, and repetitive workflows into natural conversation, using Gemma 4 as a hybrid cloud/local desktop agent that can sense, plan, act, and verify.

## Recommended 3-minute demo arc

1. Problem: a user knows the goal but gets blocked by tabs, forms, files, and UI steps.
2. User speaks or types the goal.
3. CIARA senses the current browser/desktop context.
4. CIARA creates a visible plan.
5. The user approves.
6. CIARA acts through browser refs, desktop tools, mouse/keyboard, or files.
7. CIARA verifies the result.
8. Show provider routing: Gemma 4 API, Ollama, llama.cpp-compatible local endpoint.
9. Close with the impact: everyday computer tasks become accessible through natural language.

## Bottom line

CIARA has enough real technical depth for the hackathon. The strongest story is not "AI assistant." It is:

> A local-first Gemma 4 desktop command layer that helps people complete everyday computer tasks through natural language, with visible planning, real browser and desktop control, local/private runtime options, and verification after actions.
