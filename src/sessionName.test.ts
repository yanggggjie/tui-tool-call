import { describe, it, expect } from "vitest";
import { validateSessionName } from "./sessionName";

describe("validateSessionName", () => {
  it("accepts valid names", () => {
    for (const name of ["dev", "temp-work", "claude-agent", "myapp-dev"]) {
      expect(validateSessionName(name)).toBeNull();
    }
  });

  it("rejects empty and invalid names", () => {
    expect(validateSessionName("")).not.toBeNull();
    expect(validateSessionName("Temp-Work")).not.toBeNull();
    expect(validateSessionName("temp_work")).not.toBeNull();
    expect(validateSessionName("-bad")).not.toBeNull();
    expect(validateSessionName("bad-")).not.toBeNull();
  });
});
