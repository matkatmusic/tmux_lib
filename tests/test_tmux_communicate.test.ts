import { tmux_lib } from "../tmux_lib.ts";
import type { RunResult } from "../tmux_lib_internal.ts";

// === Bucket: Communicate ===
// The Python file defines only helpers and fixtures: it has no test functions.

export function _make_fake_run(
  rc: number,
  stdout: string = "",
  stderr: string = "",
  calls: string[][] | undefined = undefined,
): (argv: string[]) => RunResult {
  return (argv: string[]): RunResult => {
    if (calls !== undefined) {
      calls.push(argv);
    }
    return { returncode: rc, stdout, stderr };
  };
}

// Fixture live_tmux_session: setup creates a unique detached session; the caller passes the name to live_tmux_session_teardown.
export function live_tmux_session(): string {
  const session: string = `tmux-sh-send-test-${process.pid}-${process.hrtime.bigint()}`;
  const rc: number = tmux_lib.tmux_newSession(session);
  if (rc !== 0) {
    throw new Error("tmux_newSession failed; tmux likely unavailable");
  }
  return session;
}

export function live_tmux_session_teardown(session: string): void {
  tmux_lib.tmux_killSession(session);
}
