/** lowercase word or hyphenated words: dev, temp-work, claude-agent */
export const SESSION_NAME_PATTERN = /^[a-z]+(-[a-z]+)*$/;

export function validateSessionName(name: string): string | null {
  if (!name?.trim()) {
    return "session name is required (e.g. temp-work, claude-agent, myapp-dev)";
  }
  if (!SESSION_NAME_PATTERN.test(name)) {
    return (
      `invalid session name "${name}": use lowercase letters and hyphens only ` +
      "(e.g. temp-work, claude-agent, myapp-dev)"
    );
  }
  return null;
}
