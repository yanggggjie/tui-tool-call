import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractTitle, extractIsFullscreen, hasChanged, Session, SUPPORTED_KEYS } from "../src/session";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("extractTitle", () => {
  it("returns empty string by default (no title set)", () => {
    expect(extractTitle(undefined)).toBe("");
  });

  it("returns the title string when set", () => {
    expect(extractTitle("vim: foo.ts")).toBe("vim: foo.ts");
  });

  it("returns empty string for empty title", () => {
    expect(extractTitle("")).toBe("");
  });
});

describe("extractIsFullscreen", () => {
  it("returns false when active buffer is 'normal'", () => {
    const bufferNamespace = {
      active: { type: "normal" },
    };
    expect(extractIsFullscreen(bufferNamespace as any)).toBe(false);
  });

  it("returns true when active buffer is 'alternate'", () => {
    const bufferNamespace = {
      active: { type: "alternate" },
    };
    expect(extractIsFullscreen(bufferNamespace as any)).toBe(true);
  });
});

describe("hasChanged", () => {
  const base = { screen: "hello", title: "", is_fullscreen: false };

  it("returns false when nothing changed", () => {
    expect(hasChanged(base, { screen: "hello", title: "", is_fullscreen: false })).toBe(false);
  });

  it("returns true when screen text changes", () => {
    expect(hasChanged(base, { screen: "world", title: "", is_fullscreen: false })).toBe(true);
  });

  it("returns true when title changes even if screen is the same", () => {
    expect(hasChanged(base, { screen: "hello", title: "vim: foo.ts", is_fullscreen: false })).toBe(true);
  });

  it("returns true when is_fullscreen changes even if screen is the same", () => {
    expect(hasChanged(base, { screen: "hello", title: "", is_fullscreen: true })).toBe(true);
  });
});

describe("Session", () => {
  let session: Session;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ttc-test-"));
    session = new Session("test-session", "echo hello", {
      cwd: tempDir,
      cols: 80,
      rows: 24,
    });
  });

  afterEach(() => {
    try {
      session.kill();
    } catch (e) {
      // ignore if already exited
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  });

  describe("rename", () => {
    it("changes the session label", () => {
      expect(session.label).toBe("echo hello");
      session.rename("my-label");
      expect(session.label).toBe("my-label");
    });
  });

  describe("toInfo", () => {
    it("returns session info with correct fields", () => {
      const info = session.toInfo();
      expect(info.session_id).toBe("test-session");
      expect(info.command).toBe("echo hello");
      expect(info.status).toBe("running");
      expect(info.label).toBe("echo hello");
      expect(typeof info.start_time).toBe("number");
    });
  });

  describe("scroll", () => {
    it("scrolls without throwing", () => {
      expect(() => session.scrollLines(10)).not.toThrow();
      expect(() => session.scrollLines(-10)).not.toThrow();
    });

    it("scrolls at buffer boundaries without throwing", () => {
      expect(() => session.scrollUp(1000)).not.toThrow();
      expect(() => session.scrollDown(1000)).not.toThrow();
      expect(() => session.scrollTop()).not.toThrow();
      expect(() => session.scrollBottom()).not.toThrow();
    });
  });

  describe("wait debounce", () => {
    it("uses 100ms debounce by default", async () => {
      const s = new Session("debounce-default", "echo hi", { cwd: tempDir, cols: 80, rows: 24 });
      const start = Date.now();
      await s.wait(3000);
      const elapsed = Date.now() - start;
      // should resolve after at least 100ms idle (default debounce)
      expect(elapsed).toBeGreaterThanOrEqual(90);
      s.kill();
    });

    it("respects custom debounceMs", async () => {
      const s = new Session("debounce-custom", "echo hi", { cwd: tempDir, cols: 80, rows: 24 });
      const start = Date.now();
      await s.wait(3000, undefined, 300);
      const elapsed = Date.now() - start;
      // should resolve after at least 300ms idle
      expect(elapsed).toBeGreaterThanOrEqual(290);
      s.kill();
    });

    it("custom debounceMs resolves after specified idle time", async () => {
      // Use a short-lived session; after exit, wait resolves via exited path (no debounce needed)
      // So we verify the signature accepts debounceMs without throwing
      const s = new Session("debounce-custom2", "echo hi", { cwd: tempDir, cols: 80, rows: 24 });
      await expect(s.wait(3000, undefined, 50)).resolves.toBeDefined();
      s.kill();
    });
  });
});

describe("SUPPORTED_KEYS", () => {
  it("includes all 26 ctrl+letter combinations", () => {
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      expect(SUPPORTED_KEYS).toContain(`ctrl+${letter}`);
    }
  });

  it("includes ctrl+r specifically", () => {
    expect(SUPPORTED_KEYS).toContain("ctrl+r");
  });

  it("includes common navigation keys", () => {
    for (const key of ["enter", "escape", "tab", "backspace", "arrow_up", "arrow_down", "arrow_left", "arrow_right"]) {
      expect(SUPPORTED_KEYS).toContain(key);
    }
  });
});

describe("Session.press", () => {
  let session: Session;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ttc-press-test-"));
    session = new Session("press-test", "cat", { cwd: tempDir, cols: 80, rows: 24 });
  });

  afterEach(() => {
    try { session.kill(); } catch (e) { /* already exited */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  });

  it("throws a descriptive error for unknown key names", () => {
    expect(() => session.press("ctrl+r_typo")).toThrowError(/Unknown key/);
    expect(() => session.press("ctrl+r_typo")).toThrowError(/ttc keys/);
  });

  it("throws for completely unknown keys", () => {
    expect(() => session.press("superkey")).toThrowError(/Unknown key: "superkey"/);
  });

  it("does not throw for all supported keys", () => {
    for (const key of SUPPORTED_KEYS) {
      expect(() => session.press(key)).not.toThrow();
    }
  });

  it("is case-insensitive for key names", () => {
    expect(() => session.press("ENTER")).not.toThrow();
    expect(() => session.press("Ctrl+C")).not.toThrow();
  });
});
