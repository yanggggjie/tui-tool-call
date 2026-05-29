# Test: Highlights Detection

Test tracking selected items by reading plain screen text after navigation.

Before starting: kill any stale daemon.
```bash
ttc daemon stop 2>/dev/null || true
```

---

## Scenario 1: Vertical menu

**Goal:** Track selection in a vertical menu.

```bash
ttc start temp-work python3 examples/menu.py
ttc now -d --text "Option"
```

**Step 1.1** — Verify initial selection:
```bash
ttc now
```
Assert: screen shows "Option A" as the selected item

**Step 1.2** — Move selection down:
```bash
ttc press arrow_down
```
Assert: screen shows "Option B" as selected

**Step 1.3** — Move to last option:
```bash
ttc press arrow_down
```
Assert: screen shows "Option C" as selected

**Cleanup:**
```bash
ttc kill
```

---

## Scenario 2: Inline tab bar

**Goal:** Track tab selection across an inline bar.

```bash
ttc start temp-work python3 examples/tabs.py
ttc now -d --text "Files"
```

**Step 2.1** — Verify initial tab:
```bash
ttc now
```
Assert: screen shows "Files" as the active tab

**Step 2.2** — Move to next tab:
```bash
ttc press arrow_right
```
Assert: screen shows "Git" as the active tab

**Step 2.3** — Move to third tab:
```bash
ttc press arrow_right
```
Assert: screen shows "Search" as the active tab

**Cleanup:**
```bash
ttc kill
```

---

## Scenario 3: Dialog box buttons

**Goal:** Detect highlighted button inside a dialog.

```bash
ttc start temp-work python3 examples/dialog.py
ttc now -d --text "Delete"
```

**Step 3.1** — Verify Yes button highlighted:
```bash
ttc now
```
Assert: screen shows "Yes" as the highlighted/default button

**Step 3.2** — Switch to No:
```bash
ttc press arrow_right
```
Assert: screen shows "No" as highlighted

**Cleanup:**
```bash
ttc kill
```

---
