import { tmux_lib } from "../tmux_lib.ts";
import type { RunResult } from "../tmux_lib_internal.ts";

// === Bucket: Configure ===
// The Python file defines only helpers and fixtures: it has no test functions.

export class _FakeCompleted {
  returncode: number;
  stdout: string;
  stderr: string;

  constructor(returncode: number, stdout: string = "", stderr: string = "") {
    this.returncode = returncode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

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

// Fixture tmux_session_opts: unique isolated session; the caller passes the name to tmux_session_opts_teardown.
export function tmux_session_opts(): string {
  const name: string = `tmux-py-opt-test-${process.pid}`;
  tmux_lib.run(["tmux", "kill-session", "-t", name], { capture_output: true, check: false });
  const rc: number = tmux_lib.tmux_newSession(name);
  if (rc !== 0) {
    throw new Error("fixture failed to create tmux session");
  }
  return name;
}

export function tmux_session_opts_teardown(name: string): void {
  tmux_lib.run(["tmux", "kill-session", "-t", name], { capture_output: true, check: false });
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

// Helper: returns the first pane id (e.g. "%0") in the session.
export function _first_pane_id(session: string): string {
  const rows: string[] = tmux_lib.tmux_listPanes(session, "-F", "#{pane_id}");
  return rows.length > 0 ? rows[0]! : "";
}

// Fixture layout_session: real detached session with 3 panes for layout exercises.
export function layout_session(): string {
  const name: string = `tmux-py-lay-test-${process.pid}`;
  tmux_lib.tmux_newSession(name);
  tmux_lib.tmux_newPane(name);
  tmux_lib.tmux_newPane(name);
  return name;
}

export function layout_session_teardown(name: string): void {
  tmux_lib.tmux_killSession(name);
}
