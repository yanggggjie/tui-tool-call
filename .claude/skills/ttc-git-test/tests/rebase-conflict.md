# Test: git rebase -i Conflict Resolution

Test that ttc can drive a full interactive rebase workflow: open the todo
list in vim, accept it, wait for a conflict, resolve the conflict in vim, complete
the rebase, and verify the result.

Note: git may use `master` or `main` as the default branch name depending on the
system. This spec uses `master`. Adjust if your git uses `main`.

Before starting: kill any stale daemon and remove temp repo.
```bash
ttc daemon stop 2>/dev/null || true
rm -rf /tmp/tui-git-test-repo
```

Set up a git repository with a conflict between `master` and `feature`:
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

# Commit C on feature branch (same line as B — will conflict)
git checkout -b feature
echo "hello from feature" > greeting.txt
git add greeting.txt
git commit -m "C: greet from feature"

# Commit B on master branch
git checkout master
echo "hello from master" > greeting.txt
git add greeting.txt
git commit -m "B: greet from master"

# Switch back to feature — ready to rebase onto master
git checkout feature
```

Assert: `git log --oneline` on `feature` shows commits C and A; `master` shows B and A.

---

## Scenario 1: Start interactive rebase, accept the todo list

**Goal:** Launch `git rebase -i master`, vim opens the rebase todo. Accept it as-is with `:wq`.

```bash
ttc start git-work --cwd /tmp/tui-git-test-repo "GIT_EDITOR=vim GIT_SEQUENCE_EDITOR=vim git rebase -i master"
ttc now -d --text "pick"
```

Assert: vim is open and the screen contains `pick` (the rebase todo entry for commit C).

**Step 1.1** — Accept the todo list:
```bash
ttc type ":wq"
ttc press enter
ttc now -d 500
```

Assert: vim closes and git begins applying commits.

---

## Scenario 2: Conflict is reported

**Goal:** Git reports a conflict on `greeting.txt` after trying to apply commit C on top of B.

**Step 2.1** — Wait for conflict notice:
```bash
ttc now -d --text "greeting.txt"
ttc now
```

Assert: screen contains `greeting.txt` (git conflict output mentions the file regardless of locale).

---

## Scenario 3: Resolve the conflict in vim

**Goal:** Open `greeting.txt` in vim, delete all conflict markers, keep `hello from feature`, save.

The conflict file has exactly 5 lines in this order:
```
<<<<<<< HEAD
hello from master
=======
hello from feature
>>>>>>> <hash> (C: greet from feature)
```

Strategy: go to line 1, delete 3 lines (`<<<`, `hello from master`, `===`),
then go to line 2 (the `>>>` marker) and delete it. Line 1 (`hello from feature`) remains.

**Step 3.1** — Open the conflicted file:
```bash
ttc start temp-work vim /tmp/tui-git-test-repo/greeting.txt
ttc now -d --text "<<<<<<<"
```

Assert: vim is open and conflict markers (`<<<<<<<`) are visible on screen.

**Step 3.2** — Delete the first 3 lines (`<<<<<<< HEAD`, `hello from master`, `=======`):
```bash
ttc type "1G"
ttc now -d 200
ttc type "dd"
ttc now -d 200
ttc type "dd"
ttc now -d 200
ttc type "dd"
ttc now -d 200
```

Assert: `hello from feature` is now on line 1.

**Step 3.3** — Delete the `>>>>>>> ...` closing marker (now line 2):
```bash
ttc type "2G"
ttc now -d 200
ttc type "dd"
ttc now -d 200
ttc now
```

Assert: only `hello from feature` remains on screen, no conflict markers visible.

**Step 3.4** — Save and exit vim:
```bash
ttc type ":wq"
ttc press enter
ttc now -d
```

Assert: status is `exited`, exit_code is `0`.

---

## Scenario 4: Stage the file and complete the rebase

**Goal:** `git add greeting.txt`, then `git rebase --continue`. Vim opens for the commit
message; accept it with `:wq`.

**Step 4.1** — Stage the resolved file:
```bash
ttc start git-work --cwd /tmp/tui-git-test-repo git add greeting.txt
ttc now -d
```

Assert: exit_code is `0`.

**Step 4.2** — Continue the rebase (vim will open for commit message):
```bash
ttc start git-work --cwd /tmp/tui-git-test-repo "GIT_EDITOR=vim git rebase --continue"
ttc now -d --text "greet from feature"
ttc now
```

Assert: vim is open showing the commit message buffer (contains "C: greet from feature").

**Step 4.3** — Accept the commit message:
```bash
ttc type ":wq"
ttc press enter
ttc now -d 1000
ttc now
```

Assert: session has exited, screen contains confirmation that rebase succeeded
(look for "feature" in the output — git prints the rebased branch name).

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

Assert: log shows 3 commits (A, B on master, C rebased on top), no merge commit.

**Cleanup:**
```bash
ttc kill 2>/dev/null || true
ttc daemon stop 2>/dev/null || true
rm -rf /tmp/tui-git-test-repo
```
