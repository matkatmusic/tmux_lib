import { Readable } from "node:stream";
import { tmux_lib } from "../tmux_lib.ts";
import type { RunResult } from "../tmux_lib_internal.ts";
import { addTeardown, buildPyLambda } from "./test_tmux_lib_helpers_c.ts";

// === Bucket: Read ===
// The Python file defines only helpers and fixtures: it has no test functions.

// Helper: replace process.stdin with an in-memory stream carrying the payload; teardown restores it.
export function _stdin(payload: string): void {
  const original: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", { value: Readable.from([payload]), configurable: true });
  addTeardown((): void => {
    Object.defineProperty(process, "stdin", original!);
  });
}

export class _FakeProc {
  stdout: string;
  stderr: string;
  returncode: number;

  constructor(stdout: string = "", stderr: string = "", returncode: number = 0) {
    this.stdout = stdout;
    this.stderr = stderr;
    this.returncode = returncode;
  }
}

export function _make_fake_run(
  rc: number,
  stdout: string = "",
  stderr: string = "",
  calls: string[][] | undefined = undefined,
): (argv: string[]) => RunResult & { args: string[] } {
  return buildPyLambda(1, Infinity, (argv: string[]): RunResult & { args: string[] } => {
    if (calls !== undefined) {
      calls.push(argv);
    }
    return { args: argv, returncode: rc, stdout, stderr };
  });
}

// Fixture session_name: setup clears any stale session; teardown kills it again.
export function session_name(): string {
  const name: string = `tmux-py-session-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

// export function session_name_teardown(name: string): void {
//   tmux_lib.tmux_killSession(name);
// }

// Fixture tmux_session_panes: setup kills any stale session first.
export function tmux_session_panes(): string {
  const name: string = `tmux-py-pane-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  if (rc !== 0) {
    throw new Error("fixture precondition: new session must succeed");
  }
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

// export function tmux_session_panes_teardown(name: string): void {
//   tmux_lib.tmux_killSession(name);
// }

// Helper: returns the first pane id (e.g. "%0") in the session.
export function _first_pane_id(session: string): string {
  const rows: string[] = tmux_lib.tmux_listPanes(session, "-F", "#{pane_id}");
  return rows.length > 0 ? rows[0]! : "";
}
