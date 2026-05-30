/**
 * Human-only entry for the watch dashboard (served by daemon).
 */
import { ensureDaemonRunning, sendRequest } from "./client";
import { DAEMON_URL } from "./daemon";

/** Print watch dashboard URL. Blocks until Ctrl+C (daemon keeps running). */
export async function runWatchServer(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "Error: ttc watch is for human observation only. Agents must not run this command.\n"
    );
    process.exit(1);
  }

  await ensureDaemonRunning();

  const res = await sendRequest({ type: "list" });
  if (res.type === "error") {
    process.stderr.write(`Error: ${res.message}\n`);
    process.exit(1);
  }

  process.stderr.write("ttc watch — read-only session observer (Ctrl+C to exit)\n");
  console.log(DAEMON_URL);

  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
