# dsh-shoucang-memory

**[简体中文](README.md) | [English](README.en.md)**

![License](https://img.shields.io/badge/license-Apache--2.0-green) ![DSH](https://img.shields.io/badge/DSH-0.1.2--rc.1-blue) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)

A long-term memory plugin for DeepSeek Harness (DSH). **Gives DSH persistent memory across sessions**:

- 🧠 **Long-term memory library** — layered structure (principles / indexes / details), loaded automatically each session; the more you use it, the better it knows you
- 🏭 **Session distillation** — wakes up when a session goes idle, an LLM subagent decides *what is worth remembering*, then condenses it back into the library
- 🌙 **Deep sleep** — once all sessions go quiet, automatically distills the day's memories into transferable principles
- 👤 **Dual persona channels** — USER.md (your profile) + AGENT.md (the agent's self-model), maintained by both distillation and deep sleep
- 🖥️ **Settings panel** — sidebar entry: memory browser, distillation stats, parameter tuning, deep-sleep view; theme follows the host
- 🛡️ **Whitelist gate** — anything outside the whitelist is simply not stored; quality over quantity

> Shoucang (守藏): "to guard and preserve — collect well, never forget."

## 🧠 Memory library

The library separates an **index layer** from a **detail layer**: sessions load lightweight indexes only; details are recalled on demand via pointers, never occupying context.

| Layer | Content |
|---|---|
| `PRINCIPLES.md` | Principles (L0) — cross-task general lessons distilled by deep sleep, hard cap 1,000 chars, single write path |
| `MEMORY.md` | Knowledge index (L1) — tool usage / workflows / lessons / environment facts, one line per pointer |
| `USER.md` / `AGENT.md` | Persona indexes (L1) — your preferences / the agent's own discipline; maintained via distillation + deep sleep |
| `notes/*.md` | Details (L2) — topic files (tools / flows / lessons / env / release / user / agent) |

Details trigger an audit reorganization at 85% capacity; long-unrecalled entries are automatically **demoted and purified** (details pushed down, lessons pulled up) — the library never grows unbounded.

## 🏭 Session distillation (auto-sedimentation)

About 10 minutes after a session ends: scan the incremental transcript → signal-word pre-filter (zero LLM cost for irrelevant sessions) → LLM subagent adjudicates via the distillation contract → whitelist gate → write back.

- **Granularity anchor** — only coarse-grained guidance ("how to approach a similar task next time"); fine details are better left out
- **Project facts go to the workspace** — project-specific lessons are written straight to `<workspace>/docs/devref/shoucang/`, isolated by a cross-workspace red line
- **Rejection audit** — gate-rejected entries are logged; distillation runs / accepted / rejected distribution visible in the panel
- **Crash-safe** — watermark advancement + in-flight concurrency guard; host restarts never duplicate distillation

## 🌙 Deep sleep (memory consolidation)

When all sessions have been idle for ≥ 3 hours (configurable), one consolidation pass runs automatically: today's traces → subagent distills principles → write_gate validation → atomic write to `PRINCIPLES.md` (while maintaining USER/AGENT personas).

- **Session activity FSM** — five states (RUNNING / ENDED / PROBING / SUSPECT / STALLED); multi-round sampling + multi-signal cross-checks distinguish "legit long task / stuck / crashed"; everything except a long task sleeps normally
- **Retry-safe** — transient failures roll the watermark back; restart replay neither duplicates nor loses traces

## 🖥️ Settings panel

Sidebar entry in the DSH web UI (pure-DOM panel; theme follows the host):

- **Memory** — capacity cards for all indexes, notes browsing with one-click section jump, distillation stats & trends
- **Persona** — USER / AGENT pointer rows, click through to detail sections
- **Parameters** — injection tier sliders and boolean switches, written back instantly (backup-first)
- **Deep sleep** — five-state badge, session details, idle timers, manual consolidation, tunable thresholds
- **Suite / Config** — suite assembly status, root-directory management, raw YAML editing

## 🚀 Install

```sh
dsh plugin --profile web add github:Fishsb/dsh-shoucang-memory
```

Restart DSH (`dsh web`) — the Shoucang entry appears in the sidebar.

> Requires [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The memory data root defaults to the DSH skills directory; customize via the `MEMORY_ROOT` environment variable.

## ⚙️ Configuration

Flat, single-layer plugin config (panel or config file):

| Key | Description |
|---|---|
| `state_path` | Where the panel root registry lives (default `~/.dsh/storages/`) |
| `members` | External suite member registry (default empty; the plugin is self-sufficient) |
| `enableDistill` | Distillation switch (default on) |
| `idleWakeMs` | Idle-wake threshold (default 10 min) |
| `distillPrescan` | Signal-word pre-filter (default on) |
| `llmProvider` / `llmModel` | Distillation subagent model (default: follow the main session) |
| `enableDeepSleep` / `deepSleepIdleMs` | Deep-sleep switch and idle threshold (default on / 3 h) |
| `deepSleepProbe*` | Long-task probing: samples / confirm rounds / retries / max duration |

## 📚 Docs

- [CHANGELOG](CHANGELOG.md)
- [Memory spec & discipline](skill/memory-whitelist-spec.md) — whitelist gate / R0 routing / four-level hierarchy / persona write paths (Chinese)
- [Distillation contract](skill/engine/distill-contract.md) (Chinese)

> 🔒 **Privacy**: all memory data stays on your machine — never published with the repo, never reported anywhere.

## 🛠️ Development

```sh
npm install --legacy-peer-deps
npm run typecheck && npm run build
```

---

License: [Apache-2.0](LICENSE)
