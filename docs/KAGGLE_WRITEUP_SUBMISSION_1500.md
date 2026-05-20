# CIARA: Local-First Gemma 4 Desktop Agent for Everyday Computer Tasks

**A voice-driven desktop command layer that helps people operate computers through natural language. Powered by Gemma 4, with API, Ollama, and llama.cpp-compatible local runtimes.**

## Inspiration

At 9:40 p.m., someone is staring at a job application they know they can complete. Their resume is in Downloads. Their work history is in an old email. The form asks for dates, addresses, attachments, and a short answer. Five tabs are open. The file picker is waiting. One wrong click means starting over.

For confident computer users, this is ordinary friction. For people with low digital literacy, motor limitations, older adults, non-native speakers, students, small business owners, or users in low-connectivity/private environments, this is exclusion.

The digital divide is no longer only about whether a cable reaches a home. The International Telecommunication Union estimated that 2.6 billion people were still offline in 2024, and even among people who are online, skills remain a major barrier [1]. In the United States, NCES PIAAC 2023 reported that only 32% of adults ages 16 to 65 reached Level 3 or above in adaptive problem solving, while about 32% performed at Level 1 or below [2]. OECD describes this kind of assessment as measuring the ability to process information and solve tasks in digital environments [3].

The bottleneck is not willingness. The bottleneck is interface translation. People know the goal; the computer turns it into forms, tabs, file paths, settings, shortcuts, and tiny steps. Gemma 4 helps close this gap by giving CIARA the reasoning layer needed to understand user intent, interpret messy desktop context, and convert everyday goals into planned, tool-driven, and verified workflows.

## What it does

Gemma 4 powers CIARA as a local-first desktop agent for everyday computer tasks. The user speaks or types a goal, and CIARA runs a **Sense -> Plan -> Act -> Verify** loop.

**Sense:** CIARA gathers context from the current desktop and browser: active app, window title, browser URL, selected text, visible page text, Chrome extension DOM snapshots, and screenshots when visual reasoning is needed.

**Plan:** Gemma 4 interprets the user's natural-language goal and creates milestone plans. Each milestone describes an outcome and success signal, not a brittle click-by-click script.

**Act:** Gemma 4 selects tools inside a bounded execution loop. CIARA can use browser DOM actions, mouse and keyboard control, app launching, file tools, shell tools, and visual targeting.

**Verify:** Gemma 4 helps CIARA reason about whether progress happened, while deterministic checks inspect browser DOM generation, page state, screenshot hash, or tool-specific success signals.

CIARA is not a generic assistant beside the computer. Gemma 4 enables CIARA to act as a desktop command layer inside the workflow.

## How we built it

CIARA is an Electron desktop app with a local Python backend.

| Layer | Implementation |
| --- | --- |
| Desktop shell | Electron 36 |
| UI | HTML/CSS/JavaScript renderer |
| Backend | Python asyncio WebSocket server |
| Agent engine | `CiaraAgentV2` |
| Planning | `TaskPlanner` + `MilestoneExecutor` |
| Model routing | Gemma 4 cloud/local router |
| Browser bridge | Chrome Manifest V3 extension |
| Desktop automation | Keyboard, mouse, screenshots, app launch, accessibility, visual locate |
| Memory | Local sessions, vault, screenshots, plans, milestones, conversations |
| Verification | Tool verifier + UI mutation checks |

Gemma 4 is the core reasoning layer. It powers task interpretation, route selection, milestone planning, browser reasoning, screenshot understanding, tool choice, verification support, and natural-language explanations.

The router defaults to two Gemma 4 tiers:

| Role | Default model |
| --- | --- |
| Fast routing/simple tier | `gemma-4-26b-a4b-it` |
| Powerful reasoning/vision tier | `gemma-4-31b-it` |

Simple requests can use the fast path. Browser work, screen understanding, files, multi-step workflows, ambiguous voice requests, and recovery cases are routed to the powerful tier.

CIARA also supports hybrid Gemma 4 deployment:

| Mode | Why it matters |
| --- | --- |
| Gemma 4 API via Google GenAI | Fast onboarding and strong hosted intelligence |
| Ollama local mode | Private local inference and offline-friendly workflows |
| llama.cpp/OpenAI-compatible mode | Self-hosted control and resource-constrained deployment |

This is intentional. Cloud-only agents are easy to start with, but fail users who need privacy, cost control, or resilience. Pure local agents are private, but setup and performance vary by device. CIARA supports API and local runtimes so Gemma 4 can meet users where they are.

The Chrome extension is a major part of the architecture. Its content script tags interactive elements, creates stable references, extracts visible text, records bounds, tracks DOM generation, and sends snapshots to the Python backend over localhost WebSocket. This gives Gemma 4 structured browser context so CIARA can click and type through semantic DOM references instead of guessing coordinates.

When DOM access is unavailable, CIARA falls back to desktop automation. On Windows it uses user-session APIs and clipboard-based text entry paths; on macOS it can use AppleScript, Quartz, and accessibility APIs. For visual tasks, `read_screen` captures the display and sends it to the powerful Gemma 4-compatible vision path for interpretation. CIARA's fallback ladder is: browser DOM -> accessibility tree -> visual locate -> coordinate action.

Safety is built into the loop. Tool calls require reasoning, UI-mutating actions emit events, the executor has a hard action cap, plans can be user-approved, and post-action verification checks for visible or structural changes.

## Challenges we ran into

The hardest challenge was reliability. A desktop is not a clean API. Buttons move, pages re-render, browser state changes, accessibility trees differ across apps, and a click can silently fail.

Gemma 4 helped CIARA handle messy real-world workflows by interpreting ambiguous user goals, reasoning over partial screen/browser context, and adapting tool choices when the first path failed. But reliability required more than model intelligence. We built surrounding infrastructure: a Chrome extension bridge, a fallback ladder, milestone success signals, execution caps, and post-action verification.

We handled this by separating outcomes from actions. The planner defines milestones and success signals; Gemma 4 chooses tools dynamically; the verifier checks whether progress actually happened.

The second challenge was deployment. Some users need easy API setup; others need privacy or local operation. The provider router lets the same Gemma 4-centered architecture work across Google GenAI, Ollama, and llama.cpp-compatible local runtimes.

## Accomplishments that we're proud of

- Built a real desktop agent stack, not just a mock UI.
- Made Gemma 4 central to planning, reasoning, tool selection, browser/screen understanding, verification support, and explanations.
- Built a Chrome extension bridge with DOM snapshots and stable element references.
- Added desktop automation with mouse, keyboard, screenshots, and visual fallback paths.
- Designed SPAV so the agent plans in outcomes and verifies progress.
- Added hybrid Gemma 4 provider routing for API, Ollama, and llama.cpp-compatible local runtimes.
- Kept memory, sessions, screenshots, plans, and vault data local-first.
- Added tests and benchmark scaffolding for agent behavior, routing, browser automation, and recovery.

## What we learned

We learned that Gemma 4 provides the intelligence needed to bridge human intention and computer action, but a useful desktop agent also needs context, tools, state, recovery, and verification. The model can reason over goals and messy interfaces, but the architecture must make those decisions observable, bounded, and recoverable.

We also learned that local-first is not only a privacy feature. It changes who can use the system. Local and self-hosted runtimes make CIARA more resilient for users with cost, connectivity, or trust constraints.

## What's next

Next, CIARA will focus on stronger local Gemma 4 demos, accessibility-first workflow templates, task-completion benchmarks, more OS hardening, and richer trust controls such as action previews, reversible actions, and audit logs.

The long-term vision is simple: Gemma 4 can help make computers usable through intent, not technical skill.

## References

[1] International Telecommunication Union, "Facts and Figures 2024." https://www.itu.int/en/mediacentre/Pages/PR-2024-11-27-facts-and-figures.aspx  
[2] NCES, "PIAAC Highlights of U.S. National Results, 2023." https://nces.ed.gov/surveys/piaac/2023/national_results.asp  
[3] OECD, "Do Adults Have the Skills They Need to Thrive in a Changing World?" https://www.oecd.org/en/publications/2024/12/do-adults-have-the-skills-they-need-to-thrive-in-a-changing-world_4396f1f1/full-report/the-relevance-of-information-processing-skills-in-rapidly-changing-societies_be4f1345.html

