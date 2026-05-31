---
name: ttc
description: Operate interactive terminal programs (REPLs, debuggers, TUI apps) using PTY automation. Agents must run every ttc command synchronously—never timed waits or background execution.
---

# ttc

## Workflow

All options use **short names** and **`--name=value`** syntax. Session names are letters/digits only.

**Two APIs — never mix them:**

| API | Prefix | Purpose | stdout on success |
|-----|--------|---------|-------------------|
| **Action** | `ttc act …` | Mutate PTY | **empty** (exit 0) |
| **Observation** | `ttc obs …` | Read screen | **terminal screen text** |

**Agent pattern — act then obs:**

```
ttc act …  →  ttc obs done --sess=<name>
```

```bash
ttc act start --sess=dev --cmd="npm run dev"
ttc obs done --sess=dev

ttc act type --sess=dev --txt="hello"
ttc obs done --sess=dev

ttc act press --sess=dev --key=enter
ttc obs done --sess=dev

ttc obs scroll --sess=dev --dire=up
ttc obs now --sess=dev
```

## Parameters

| Flag | Meaning |
|------|---------|
| `--sess=` | Session name |
| `--cmd=` | Program command line (single string, e.g. `"npm run dev"`) |
| `--cwd=` | Working directory for `act start` (optional, default: current directory) |
| `--txt=` | Text for `act type` |
| `--key=` | Key for `act press` |
| `--dire=` | Scroll direction: up, down, top, bottom |

```bash
ttc act start --sess=webdev --cwd=./apps/web --cmd="npm run dev"
ttc act start --sess=temp --cmd=lazygit
ttc act start --sess=temp --cmd='python3 -c "print(1+1)"'
```

## Execution (required — agents)

- Every command blocks until it exits; one at a time
- After an action that may change the screen → **`ttc obs done --sess=<name>`**
- **Forbidden:** `ttc watch`, sleep/polling, background ttc, screen output from `ttc act …`

## Commands

```
ttc act start --sess=<name> --cmd=<command> [--cwd=<path>]
ttc act type --sess=<name> --txt=<text>
ttc act press --sess=<name> --key=<key>
ttc act kill --sess=<name>
ttc act killall
ttc act list

ttc obs now --sess=<name>
ttc obs done --sess=<name>
ttc obs scroll --sess=<name> --dire=up|down|top|bottom

ttc keys
ttc watch                          # human-only
```

## Examples

```bash
ttc act start --sess=dev --cmd="npm run dev"
ttc obs done --sess=dev

ttc act start --sess=tempwork --cmd=python3
ttc obs done --sess=tempwork
ttc act type --sess=tempwork --txt="1+1"
ttc obs done --sess=tempwork
ttc act press --sess=tempwork --key=enter
ttc obs done --sess=tempwork
ttc act kill --sess=tempwork
```

Human checks output live: `ttc watch` in another terminal.
