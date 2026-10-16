import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { executeRealTmux } from "./test_tmux_lib_helpers_a.ts";
import { addTeardown, buildPyLambda } from "./test_tmux_lib_helpers_c.ts";

// === Bucket: Create ===
// The Python file defines only helpers and fixtures: it has no test functions.

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

// Setup helper: shell out to real tmux to check session existence.
export function _tmux_has_session(name: string): boolean {
  return executeRealTmux("has-session", "-t", name).returncode === 0;
}

// Setup helper: list windows and look for an exact name match.
export function _tmux_window_exists(session: string, window: string): boolean {
  const r: RunResult = executeRealTmux("list-windows", "-t", session, "-F", "#{window_name}");
  if (r.returncode !== 0) {
    return false;
  }
  return tmux_lib_internal.splitlines(r.stdout).includes(window);
}

// Setup helper: query pane_title via display-message.
export function _tmux_pane_has_title(target: string, title: string): boolean {
  const r: RunResult = executeRealTmux("display-message", "-p", "-t", target, "#{pane_title}");
  return r.returncode === 0 && tmux_lib_internal.strip(r.stdout) === title;
}

// Setup helper: read tmux option value, empty string on miss.
export function _tmux_show_option(target: string, opt: string): string {
  const r: RunResult = executeRealTmux("show-options", "-t", target, "-v", opt);
  return r.returncode === 0 ? tmux_lib_internal.strip(r.stdout) : "";
}

// Teardown helper: best-effort session kill.
export function _kill(name: string): void {
  executeRealTmux("kill-session", "-t", name);
}

// Fixture tmux_session_clean: unique session name, killed before and after the test.
export function tmux_session_clean(): string {
  const name: string = `tmux-sh-launcher-test-${process.pid}`;
  _kill(name);
  addTeardown((): void => {
    _kill(name);
  });
  return name;
}

export function _writeSidecar(tmpdir_inv: string, pane_id: string): void {
  writeFileSync(join(tmpdir_inv, "tmux_target"), pane_id + "\n");
}

// Fixture kill_calls: captures pane-id + retile-target instead of touching tmux.
export function kill_calls(): { calls: [string, string][]; fake_bg: (pane_target: string, retile_target: string) => void } {
  const calls: [string, string][] = [];
  const fake_bg = buildPyLambda(2, 2, (pane_target: string, retile_target: string): void => {
    calls.push([pane_target, retile_target]);
  });
  return { calls, fake_bg };
}

// Fixture fake_tmux: fakes tmux_lib._tmux_live_pane_ids with a configurable set; undone at teardown.
export function fake_tmux(): { live: Set<string> } {
  const state: { live: Set<string> } = { live: new Set<string>() };
  const spy = spyOn(tmux_lib, "_tmux_live_pane_ids").mockImplementation(buildPyLambda(0, 0, (): Set<string> => new Set<string>(state.live)));
  addTeardown((): void => {
    spy.mockRestore();
  });
  return state;
}

// Writes a minimal per-invocation tmpdir with a tmux_target sidecar.
export function _make_tmpdir(tmp_path: string, tmux_target: string = "%42"): string {
  const d: string = join(tmp_path, "todo.XXXX");
  mkdirSync(d);
  writeFileSync(join(d, "tmux_target"), `${tmux_target}\n`);
  return d;
}
