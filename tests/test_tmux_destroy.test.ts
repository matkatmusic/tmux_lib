import { tmux_lib } from "../tmux_lib.ts";
import type { RunResult } from "../tmux_lib_internal.ts";

// === Bucket: Destroy ===
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

// Fixture session_name: setup clears any stale session; the caller passes the name to session_name_teardown.
export function session_name(): string {
  const name: string = `tmux-py-session-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  return name;
}

export function session_name_teardown(name: string): void {
  tmux_lib.tmux_killSession(name);
}

// Fixture tmux_session_panes: setup kills any stale session first.
export function tmux_session_panes(): string {
  const name: string = `tmux-py-pane-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  if (rc !== 0) {
    throw new Error("fixture precondition: new session must succeed");
  }
  return name;
}

export function tmux_session_panes_teardown(name: string): void {
  tmux_lib.tmux_killSession(name);
}
