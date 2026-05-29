# Test: Session Management

Test session lifecycle: start, use, info, rename, list, kill.

Before starting: kill any stale daemon.
```bash
ttc daemon stop 2>/dev/null || true
```

---

## Scenario 1: Basic session lifecycle

**Goal:** Create, identify, and destroy a session.

```bash
ttc start temp-work python3
ttc now -d --text ">>>"
```

**Step 1.1** — Verify info shows correct details:
```bash
ttc info
```
Assert: Output contains `Command: python3`, `Status: running`, `Size: 120x30`

**Step 1.2** — Rename the session:
```bash
ttc rename "my-python-session"
ttc list
```
Assert: `list` shows `my-python-session` as label

**Step 1.3** — Kill and verify cleanup:
```bash
ttc kill
ttc list
```
Assert: `list` shows "No active sessions" or session not in list

---

## Scenario 2: Multiple sessions

**Goal:** Manage multiple concurrent sessions.

```bash
SID1=$(ttc start test-first python3 2>/dev/null)
SID2=$(ttc start test-second python3 2>/dev/null)
ttc list
```

Note: redirect stderr to /dev/null so daemon startup messages don't pollute the captured session ID.

**Step 2.1** — Verify both sessions exist:
```bash
ttc list
```
Assert: `list` shows both "first" and "second" labels

**Step 2.2** — Switch between sessions:
```bash
ttc use $SID1
ttc info
```
Assert: `info` shows `Label: first`

```bash
ttc use $SID2
ttc info
```
Assert: `info` shows `Label: second`

**Step 2.3** — Cleanup:
```bash
ttc use $SID1
ttc kill
ttc use $SID2
ttc kill
```
Assert: Both sessions killed

---
