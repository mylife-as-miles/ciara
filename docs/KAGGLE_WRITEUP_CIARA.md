# CIARA: Local-First Gemma 4 Desktop Agent for Everyday Computer Tasks

**Subtitle:** A voice-driven desktop command layer that uses Gemma 4 to help people operate computers through natural language, with hybrid API, Ollama, and llama.cpp-compatible local runtimes.

## Kaggle Writeup Draft

### Project name

**CIARA: Local-First Gemma 4 Desktop Agent for Everyday Computer Tasks**

### Your team

Miles - solo builder. Product design, desktop architecture, agent runtime, browser automation bridge, provider routing, local-first memory, packaging, and demo implementation.

### Problem statement

At 9:40 p.m., someone is staring at a job application they know they can complete. Their resume is in Downloads. Their work history is in an old email. The form asks for dates, addresses, attachments, and a short answer. Five tabs are open. The file picker is waiting. One wrong click means starting over.

For confident computer users, this is ordinary friction. For people with low digital literacy, motor limitations, older adults, non-native speakers, students, small business owners, or users in low-connectivity/private environments, this is exclusion.

The digital divide is no longer only about whether a cable reaches a home. The International Telecommunication Union estimated that 2.6 billion people were still offline in 2024, and even among people who are online, skills remain a major barrier [1]. In the United States, NCES PIAAC 2023 reported that only 32% of adults ages 16 to 65 reached Level 3 or above in adaptive problem solving, while about 32% performed at Level 1 or below [2]. OECD describes this kind of assessment as measuring the ability to process information and solve tasks in digital environments [3].

The bottleneck is not willingness. The bottleneck is interface translation. People know the goal; the computer turns it into forms, tabs, file paths, settings, shortcuts, and tiny steps. Most AI chatbots help with answers, but stop before the hard part: operating the computer.

CIARA addresses that gap. Gemma 4 gives CIARA the reasoning layer needed to act as a desktop command layer that lets users describe a goal in natural language and have the computer execute the workflow through visible, verifiable actions.

The impact target is Digital Equity & Inclusivity: reducing the skill barrier required to use modern software. If a person can say what they want, CIARA should help them get there without requiring them to master browser conventions, file systems, settings, shortcuts, or web forms first.

### Overall solution

CIARA is a local-first desktop agent built around a Sense -> Plan -> Act -> Verify loop.

1. **Sense:** CIARA gathers the current desktop and browser context: active app, window title, browser URL, selected text, visible page text, Chrome extension DOM snapshots, and screenshots when visual reasoning is needed.
2. **Plan:** Gemma 4 converts the user's goal into milestone plans. A milestone describes the outcome and success signal, not a brittle click-by-click script.
3. **Act:** Gemma 4 chooses tools inside a bounded execution loop. CIARA can use browser DOM actions, mouse/keyboard control, app launching, file tools, shell tools, and visual targeting.
4. **Verify:** CIARA checks whether actions changed the world: browser DOM generation changed, page state changed, screenshot hash changed, or a tool-specific success condition was met.

This makes CIARA different from a normal assistant. It is not only answering questions; it is a Gemma 4-powered command layer inside the workflow.

### Why Gemma 4 is essential

Gemma 4 is the core reasoning layer at the center of CIARA. It is used for task interpretation, route selection, milestone planning, tool choice, browser reasoning, screenshot understanding, action verification, and user-facing explanations.

The model router defaults to two Gemma 4 tiers:

| Role | Default model |
| --- | --- |
| Fast routing/simple tier | `gemma-4-26b-a4b-it` |
| Powerful reasoning/vision tier | `gemma-4-31b-it` |

Simple requests such as opening an app can use the fast path. Browser work, screen understanding, files, multi-step workflows, ambiguous voice requests, and anything requiring recovery are routed to the powerful tier.

CIARA also supports hybrid deployment:

| Mode | Why it matters |
| --- | --- |
| Gemma 4 API via Google GenAI | Fast onboarding and strong hosted intelligence |
| Ollama local mode | Private local inference and offline-friendly workflows |
| llama.cpp/OpenAI-compatible mode | Self-hosted control and resource-constrained deployment |

This provider routing is not a convenience feature. It is part of the impact story. Cloud-only assistants are easier to start with, but fail users who need privacy, cost control, or resilience. Pure local assistants are private, but setup and performance vary by device. CIARA supports both so the user can choose the right balance of quality, privacy, cost, and connectivity.

### Technical details

CIARA is implemented as an Electron desktop app with a local Python backend.

| Layer | Implementation |
| --- | --- |
| Desktop shell | Electron 36 |
| UI | HTML/CSS/JavaScript renderer |
| Backend | Python asyncio WebSocket server |
| Agent engine | `CiaraAgentV2` in `backend/agent/core_v2.py` |
| Planning | `TaskPlanner` and `MilestoneExecutor` |
| Model routing | `backend/providers/router.py` |
| Cloud provider | Google GenAI provider for Gemma 4 |
| Local providers | OpenAI-compatible adapter for Ollama and llama.cpp |
| Browser bridge | Chrome Manifest V3 extension |
| Desktop automation | Keyboard, mouse, screenshots, app launch, accessibility, visual locate |
| Memory | Local sessions, vault, screenshots, plans, milestones, conversations |
| Verification | Tool verifier and UI mutation reliability checks |

The Chrome extension is a major part of the architecture. Its content script tags interactive elements, creates stable element references, extracts visible text, records bounds, tracks DOM generation, and sends snapshots to the Python backend through a localhost WebSocket. This lets CIARA click and type through semantic DOM references instead of guessing coordinates.

When DOM access is unavailable, CIARA falls back to desktop automation. On Windows it uses user-session APIs and clipboard-based text entry paths; on macOS it can use AppleScript, Quartz, and accessibility APIs. For visual tasks, `read_screen` captures the display and sends it to the powerful Gemma 4-compatible vision path for interpretation. That gives CIARA a practical fallback ladder: browser DOM -> accessibility tree -> visual locate -> coordinate action.

Safety is built into the loop. Tool calls require a reasoning field, UI-mutating actions emit events, the executor uses a hard action cap, plans can be user-approved, and post-action verification checks for visible or structural changes. If a click or keypress produces no visible change, CIARA can treat that as a failed action instead of blindly continuing.

### Results and proof of work

The repository includes:

- A working Electron desktop app.
- A local Python backend server.
- Gemma 4 API and local runtime routing.
- Chrome extension browser automation.
- Desktop mouse, keyboard, screenshot, and app tools.
- Local memory and vault storage.
- A SPAV milestone planning/execution loop.
- Verification and reliability modules.
- Tests for agent behavior, browser scenarios, model routing, milestone execution, and reliability recovery.
- A Windows installer landing asset and macOS packaging support.

The demo path should show a user blocked by a real workflow, such as comparing information across websites, filling a form, saving the result, and verifying completion. The important thing to show is transformation: the user states an intent, CIARA turns it into a visible plan, Gemma 4 drives tool actions, and the agent verifies the result.

### Limitations

CIARA is a proof-of-concept desktop agent, not a fully autonomous operating system. Browser automation is strongest when the Chrome extension is installed. Native desktop automation depends on OS permissions and application accessibility support. Local Gemma 4 performance depends on the user's hardware and runtime configuration. The current project should describe itself as local-first and hybrid, not as guaranteed fully offline in every configuration.

### Impact

CIARA's impact is not that it makes expert users slightly faster. Its larger promise is that it changes who can use computers effectively. A computer becomes more accessible when the interface can be driven by intent instead of technical skill. For a student, that may mean turning research into organized notes. For a small business owner, it may mean comparing suppliers and preparing outreach. For an older adult, it may mean completing a web form without knowing browser conventions. For a privacy-sensitive user, it may mean doing more work with local inference.

Gemma 4 gives CIARA the reasoning layer needed to bridge human intention and computer action.

## Required Section Version

### Inspiration

CIARA started from a simple observation: people are not blocked because they lack goals. They are blocked because computers turn goals into tiny technical chores. Tabs, forms, file paths, buttons, settings, logins, and copy-paste loops are easy to ignore when you are technical, but they exclude millions of people from digital productivity.

The inspiration was to use Gemma 4 to make the desktop itself conversational: not another generic assistant beside the computer, but a command layer inside the workflow.

### What it does

CIARA lets a user speak or type an everyday computer task, then helps complete it through a Sense -> Plan -> Act -> Verify loop.

It can:

- Understand desktop and browser context.
- Create visible milestone plans.
- Read web pages through a Chrome extension.
- Click, type, select, and extract information from websites.
- Use screenshots and Gemma 4 vision-style reasoning for visual tasks.
- Move the mouse, type text, press keys, open apps, and interact with desktop UI.
- Route Gemma 4 across API mode, Ollama local mode, and llama.cpp/OpenAI-compatible runtimes.
- Store memory locally under the user's data directory.
- Verify whether actions succeeded before moving forward.

### How we built it

CIARA is built as an Electron desktop application with a local Python backend.

The frontend is a glass-pill desktop overlay. The backend runs a WebSocket server that receives voice/text input, streams state updates, calls the agent runtime, and coordinates tools.

The agent is built around SPAV:

- **Sense:** gather active app, browser URL, selected text, DOM snapshots, screenshots, and memory.
- **Plan:** Gemma 4 creates milestone plans with observable success signals.
- **Act:** Gemma 4 selects tools inside a bounded milestone executor.
- **Verify:** deterministic and visual checks confirm that actions changed the UI or completed the goal.

The browser automation layer is a Chrome Manifest V3 extension. It injects a content script, tags elements with stable references, extracts text and bounds, watches DOM mutations, and sends action results back over localhost WebSocket.

The model layer supports Gemma 4 through Google GenAI, Ollama, and llama.cpp-compatible endpoints. This hybrid runtime lets CIARA adapt to different user needs: cloud quality, local privacy, or self-hosted control.

### Challenges we ran into

The hardest challenge was reliability. A desktop is not a clean API. Buttons move, pages re-render, accessibility trees differ across apps, browser state changes, and a click can silently fail.

We handled this by building a fallback ladder:

1. Use browser DOM references when possible.
2. Use accessibility/UI tree information when available.
3. Use screenshot understanding and visual locate when structure is missing.
4. Use coordinate-level mouse/keyboard actions as a final path.

Another challenge was preventing blind automation. CIARA needed to inspect state before acting and verify after acting. That is why the system uses milestone success signals, required tool reasoning, post-action checks, and hard execution caps.

The third challenge was model deployment. Some users need easy API setup; others need privacy or local operation. The provider router lets the same agent architecture work across Gemma 4 API, Ollama, and llama.cpp-compatible local runtimes.

### Accomplishments that we're proud of

- Built a real desktop agent stack, not just a mock UI.
- Integrated Gemma 4 as the planning, reasoning, tool-selection, and verification brain.
- Built a Chrome extension bridge with DOM snapshots and stable element references.
- Added desktop automation with mouse, keyboard, screenshots, and visual fallback paths.
- Designed the SPAV architecture so the agent plans in outcomes and verifies progress.
- Added hybrid provider routing for API, Ollama, and llama.cpp-compatible local runtimes.
- Kept memory, sessions, screenshots, plans, and vault data local-first.
- Added tests and benchmark scaffolding for agent behavior, routing, browser automation, and recovery.

### What we learned

We learned that a useful desktop agent needs more than a strong model. It needs context, tools, state, recovery, and verification. Gemma 4 is powerful, but the surrounding architecture determines whether that intelligence can safely affect the real world through context, tools, state, recovery, and verification.

We also learned that local-first is not only a privacy feature. It changes who can use the system. Local and self-hosted runtimes make the product more resilient for users with cost, connectivity, or trust constraints.

Finally, we learned that planning should describe outcomes, not brittle steps. A milestone like "extract supplier prices and save a comparison" gives the executor room to adapt when a website changes.

### What's next

Next, CIARA should improve in five areas:

- **Stronger local Gemma 4 demos:** show Ollama and llama.cpp workflows clearly in the video and benchmark them on realistic hardware.
- **Accessibility-focused workflows:** build task templates for form filling, job applications, email, document organization, and learning support.
- **Better evaluation:** add benchmark suites for task completion rate, verification accuracy, latency, and fallback recovery.
- **More OS coverage:** continue hardening Windows and macOS automation paths with permission-aware setup.
- **Trust controls:** add richer user approvals, action previews, reversible actions, and audit logs for sensitive workflows.

The long-term vision is simple: CIARA should make computers usable through intent, not technical skill.

## References

[1] International Telecommunication Union, "Facts and Figures 2024." https://www.itu.int/en/mediacentre/Pages/PR-2024-11-27-facts-and-figures.aspx  
[2] NCES, "PIAAC Highlights of U.S. National Results, 2023." https://nces.ed.gov/surveys/piaac/2023/national_results.asp  
[3] OECD, "Do Adults Have the Skills They Need to Thrive in a Changing World?" https://www.oecd.org/en/publications/2024/12/do-adults-have-the-skills-they-need-to-thrive-in-a-changing-world_4396f1f1/full-report/the-relevance-of-information-processing-skills-in-rapidly-changing-societies_be4f1345.html
