# ttc-git-test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `ttc-git-test` Claude Code skill that tests ttc's ability to drive a full `git rebase -i` conflict resolution workflow entirely through the terminal using vim.

**Architecture:** Two files form the skill — `SKILL.md` (entry point, mirrors `ttc-vim-test` conventions) and `tests/rebase-conflict.md` (the test spec). The test spec sets up a real git repo in `/tmp`, triggers an interactive rebase that produces a conflict, resolves it by driving vim via ttc, and verifies the result. No shell file edits are used after repo setup.

**Tech Stack:** ttc CLI, vim, git, bash

---

### Task 1: Create SKILL.md

**Files:**
- Create: `.claude/skills/ttc-git-test/SKILL.md`

- [ ] **Step 1: Create the skill directory and SKILL.md**

```bash
mkdir -p .claude/skills/ttc-git-test
```

Create `.claude/skills/ttc-git-test/SKILL.md` with this exact content:

```markdown
---
name: ttc-git-test
description: Use when you need to verify ttc's ability to drive git workflows — interactive rebase, conflict resolution with vim, and verifying repository state.
---

# ttc git Tests

Run tests to verify ttc can drive real git workflows involving interactive rebase and conflict resolution.

## Usage

```
/ttc-git-test              # Run all test suites
/ttc-git-test <suite>      # Run specific test suite
```

## Available Test Suites

| Suite | Description |
|-------|-------------|
| `rebase-conflict` | Interactive rebase with conflict, resolve in vim, verify result |

Test specifications are in `tests/` directory.

## Reporting

After running tests, report results as:

```
<suite>:
  <scenario>      — PASS / FAIL / PARTIAL
    - <step description>: PASS / FAIL (<reason or actual output>)
```

If any test fails, include the actual screen content and what was expected.
```

- [ ] **Step 2: Verify the file exists**

```bash
cat .claude/skills/ttc-git-test/SKILL.md
```

Expected: file prints cleanly with the frontmatter `name: ttc-git-test`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/ttc-git-test/SKILL.md
git commit -m "feat: add ttc-git-test skill entry point"
```

---

### Task 2: Create tests/rebase-conflict.md

**Files:**
- Create: `.claude/skills/ttc-git-test/tests/rebase-conflict.md`

- [ ] **Step 1: Create the tests directory**

```bash
mkdir -p .claude/skills/ttc-git-test/tests
```

- [ ] **Step 2: Create the test spec**

Create `.claude/skills/ttc-git-test/tests/rebase-conflict.md` with this exact content:

````markdown
# Test: git rebase -i Conflict Resolution

Test that ttc can drive a full interactive rebase workflow: open the todo
list in vim, accept it, wait for a conflict, resolve the conflict in vim, complete
the rebase, and verify the result.

Before starting: kill any stale daemon and remove temp repo.
```bash
ttc daemon stop 2>/dev/null || true
rm -rf /tmp/tui-git-test-repo
```

Set up a git repository with a conflict between `main` and `feature`:
```bash
mkdir /tmp/tui-git-test-repo
cd /tmp/tui-git-test-repo
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Commit A: shared base
echo "hello world" > greeting.txt
git add greeting.txt
git commit -m "A: initial greeting"

# Commit C on feature branch
git checkout -b feature
echo "hello from feature" > greeting.txt
git add greeting.txt
git commit -m "C: greet from feature"

# Commit B on main branch (same line — will conflict)
git checkout main
echo "hello from main" > greeting.txt
git add greeting.txt
git commit -m "B: greet from main"

# Switch back to feature — ready to rebase onto main
git checkout feature
```

Assert: `git log --oneline` on `feature` shows commits A and C; `main` shows A and B.

---

## Scenario 1: Start interactive rebase, accept the todo list

**Goal:** Launch `git rebase -i main`, vim opens the rebase todo. Accept it as-is with `:wq`.

```bash
cd /tmp/tui-git-test-repo && GIT_EDITOR=vim GIT_SEQUENCE_EDITOR=vim ttc start git-work git rebase -i main
ttc sc -d --text "pick"
```

Assert: vim is open and the screen contains `pick` (the rebase todo entry for commit C).

**Step 1.1** — Accept the todo list:
```bash
ttc type ":wq"
ttc press enter
ttc sc -d 500
```

Assert: vim closes and git begins applying commits.

---

## Scenario 2: Conflict is reported

**Goal:** Git reports a conflict on `greeting.txt` after trying to apply commit C on top of B.

**Step 2.1** — Wait for conflict notice:
```bash
ttc sc -d --text "CONFLICT"
ttc sc
```

Assert: screen contains both `CONFLICT` and `greeting.txt`.

---

## Scenario 3: Resolve the conflict in vim

**Goal:** Open `greeting.txt` in vim, delete all conflict markers, keep `hello from feature`, save.

**Step 3.1** — Open the conflicted file:
```bash
cd /tmp/tui-git-test-repo && ttc start temp-work vim greeting.txt
ttc sc -d --text "<<<<<<<"
```

Assert: vim is open and conflict markers (`<<<<<<<`) are visible on screen.

**Step 3.2** — Delete the conflict header line (`<<<<<<< HEAD`):
```bash
ttc type "1G"
ttc sc -d 200
ttc type "dd"
ttc sc -d 200
```

Assert: first line (`<<<<<<< HEAD` or similar) is removed.

**Step 3.3** — Delete the `hello from main` line (now line 1):
```bash
ttc type "dd"
ttc sc -d 200
```

**Step 3.4** — Delete the `=======` separator line (now line 1):
```bash
ttc type "dd"
ttc sc -d 200
```

**Step 3.5** — Delete the `>>>>>>> ...` closing marker (now line 2, after `hello from feature`):
```bash
ttc type "2G"
ttc sc -d 200
ttc type "dd"
ttc sc -d 200
ttc sc
```

Assert: only `hello from feature` remains, no conflict markers visible.

**Step 3.6** — Save and exit vim:
```bash
ttc type ":wq"
ttc press enter
ttc sc -d
```

Assert: status is `exited`, exit_code is `0`.

---

## Scenario 4: Stage the file and complete the rebase

**Goal:** `git add greeting.txt`, then `git rebase --continue`. If vim opens for the commit message, accept it with `:wq`.

**Step 4.1** — Stage the resolved file:
```bash
cd /tmp/tui-git-test-repo && ttc start git-work git add greeting.txt
ttc sc -d
```

Assert: exit_code is `0`.

**Step 4.2** — Continue the rebase:
```bash
cd /tmp/tui-git-test-repo && GIT_EDITOR=vim ttc start git-work git rebase --continue
ttc sc -d 1000
ttc sc
```

**Step 4.3** — If vim opens for commit message, accept it:
```bash
```

If vim is open (screen contains the commit message buffer), run:
```bash
ttc type ":wq"
ttc press enter
```

**Step 4.4** — Wait for rebase to finish:
```bash
ttc sc -d --text "Successfully rebased"
ttc sc -d
```

Assert: status is `exited`, exit_code is `0`.

---

## Scenario 5: Verify the result

**Goal:** Confirm `greeting.txt` contains the resolved content and git log looks correct.

**Step 5.1** — Check file content:
```bash
cat /tmp/tui-git-test-repo/greeting.txt
```

Assert: output is exactly `hello from feature` with no conflict markers.

**Step 5.2** — Check git log:
```bash
cd /tmp/tui-git-test-repo && git log --oneline
```

Assert: log shows 3 commits (A, B, C rebased on top), no merge commit.

**Cleanup:**
```bash
ttc kill 2>/dev/null || true
ttc daemon stop 2>/dev/null || true
rm -rf /tmp/tui-git-test-repo
```
````

- [ ] **Step 3: Verify the file exists and looks correct**

```bash
head -5 .claude/skills/ttc-git-test/tests/rebase-conflict.md
```

Expected: first line is `# Test: git rebase -i Conflict Resolution`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/ttc-git-test/tests/rebase-conflict.md
git commit -m "feat: add rebase-conflict test spec to ttc-git-test skill"
```

---

### Task 3: Smoke-test the skill end-to-end

**Files:**
- Read: `.claude/skills/ttc-git-test/SKILL.md`
- Read: `.claude/skills/ttc-git-test/tests/rebase-conflict.md`

- [ ] **Step 1: Invoke the skill**

Run `/ttc-git-test` (or ask Claude to invoke the `ttc-git-test` skill). This loads `SKILL.md` and presents the suite table.

Expected: skill loads cleanly, shows `rebase-conflict` in the suite table.

- [ ] **Step 2: Run the rebase-conflict suite**

Run `/ttc-git-test rebase-conflict`.

Claude should execute every bash block in `tests/rebase-conflict.md` in order, check each Assert, and report:

```
rebase-conflict:
  Scenario 1: Start interactive rebase, accept the todo list   — PASS / FAIL
    - vim opens with pick todo: PASS / FAIL
    - :wq closes vim: PASS / FAIL
  Scenario 2: Conflict is reported                             — PASS / FAIL
    - screen contains CONFLICT and greeting.txt: PASS / FAIL
  Scenario 3: Resolve the conflict in vim                      — PASS / FAIL
    - vim opens with conflict markers: PASS / FAIL
    - conflict markers deleted: PASS / FAIL
    - only hello from feature remains: PASS / FAIL
    - vim saves and exits cleanly: PASS / FAIL
  Scenario 4: Stage and complete the rebase                    — PASS / FAIL
    - git add succeeds: PASS / FAIL
    - git rebase --continue exits 0: PASS / FAIL
  Scenario 5: Verify the result                                — PASS / FAIL
    - greeting.txt contains hello from feature: PASS / FAIL
    - git log shows 3 commits, no merge commit: PASS / FAIL
```

- [ ] **Step 3: Fix any failures before moving on**

If any scenario fails, diagnose from the actual screen output reported, adjust the test spec (timing, key sequences, line numbers), and re-run.

- [ ] **Step 4: Commit final state**

```bash
git add -p
git commit -m "fix: adjust rebase-conflict test spec after smoke-test"
```

(Skip this commit if no changes were needed.)
