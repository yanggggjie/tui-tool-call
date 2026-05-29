# Test: Scroll Terminal Buffer

Test scroll commands: `u`/`d`/`t`/`b` (print screen after scroll).

Before starting: kill any stale daemon.
```bash
ttc daemon stop 2>/dev/null || true
```

---

## Scenario 1: Scroll through large output

```bash
ttc start temp-work --cwd /tmp "seq 200"
ttc now -d --text "^200$"
```

**Step 1.1** — Bottom of output:
```bash
ttc now
```
Assert: lines near 200 (e.g. 172–174)

**Step 1.2** — Scroll up 20 lines:
```bash
ttc u 20
```
Assert: earlier lines (e.g. 152–154)

**Step 1.3** — Scroll down 20 lines:
```bash
ttc d 20
```
Assert: back near bottom (172–174)

**Step 1.4** — Scroll to top then bottom:
```bash
ttc t
```
Assert: shows early lines (e.g. 1, 2, 3)

```bash
ttc b
```
Assert: back near line 200

**Cleanup:** `ttc kill`

---

## Scenario 2: Default one-screen scroll

```bash
ttc start temp-work --cwd /tmp "seq 200"
ttc now -d --text "^200$"
ttc u
```
Assert: viewport moved up by ~30 lines (one screen)

```bash
ttc d
```
Assert: viewport moved back down

**Cleanup:** `ttc kill`

---

## Scenario 3: Boundary scroll

```bash
ttc start temp-work echo "line1"
ttc now -d
ttc u
ttc d
ttc t
ttc b
```
Assert: each command prints screen without error

**Cleanup:** `ttc kill`

---
