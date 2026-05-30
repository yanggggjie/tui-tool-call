---
name: ttc
description: Operate interactive terminal programs (REPLs, debuggers, TUI apps) using PTY automation.
---

# ttc

## Workflow

```
start <session> → type/press <session> … → kill <session>
```

Every command takes an explicit **session name** (letters/digits only). There is no implicit current session.

## Waiting (required)

**Never** use timing tools to wait for ttc output — no `sleep`, fixed delays, `timeout`, polling with arbitrary intervals, or any other clock-based wait.

`ttc done <session>` is the correct wait: it debounces PTY changes until the screen is stable.

| Situation | Use |
|-----------|-----|
| After `start` | screen is printed after internal done (no extra wait) |
| After `type` / `press` | screen is printed after internal done (no extra wait) |
| Peek without waiting | `ttc now <session>` |
| Explicit wait | `ttc done <session>` |
| Live refresh (human) | `ttc watch <session>` — not a substitute for `done` |

## Session naming (required)

Names are **letters and digits only** (`^[a-zA-Z0-9]+$`). Prefer short letter-only names:

| Purpose | Example names |
|---------|----------------|
| Short-lived reuse | `tempwork`, `work` |
| Agent CLI | `agent`, `claude` |
| Dev server | `dev`, `webdev` |

If a name is already in use, pick a different session name, or run `ttc kill <name>` before `ttc start <name>` again.

## Observe

| Command | Alias | Action |
|---------|-------|--------|
| `ttc now <session>` | — | Current screen |
| `ttc done <session>` | — | Wait until stable, then screen |
| `ttc watch <session>` | — | Refresh every 1s in-place (Ctrl+C) |
| `ttc up <session>` | `u` | Scroll up one screen |
| `ttc down <session>` | `d` | Scroll down one screen |
| `ttc top <session>` | `t` | Scroll to top |
| `ttc bottom <session>` | `b` | Scroll to bottom |

## Session

`ttc start <session>` opens interactive **bash** in the **current working directory** (120×30). Use `ttc type` / `ttc press` to cd or launch programs.

```
ttc start <session>
ttc kill <session>
ttc list
```

## Input (auto-done, prints screen)

```
ttc type <session> <text>     # \n Enter, \t Tab
ttc press <session> <key>     # enter, ctrl+c, arrow_up, …
ttc keys                      # list supported key names
```

## Examples

```bash
# TUI tool — reuse tempwork
ttc start tempwork
ttc type tempwork "lazygit"
ttc press tempwork enter

# Agent CLI
ttc start agent
ttc type agent "claude"
ttc press agent enter

# Dev server
ttc start dev
ttc type dev "npm run dev"
ttc press dev enter
```

```bash
# REPL smoke test
ttc start tempwork
ttc type tempwork "python3"
ttc press tempwork enter
ttc type tempwork "1+1"
ttc press tempwork enter
# leave tempwork running; kill only when tearing down
ttc kill tempwork
```
