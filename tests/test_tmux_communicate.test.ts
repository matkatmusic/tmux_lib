import { tmux_lib } from "../tmux_lib.ts";
import type { RunResult } from "../tmux_lib_internal.ts";
import { generateUniqueSuffix } from "./test_tmux_lib_helpers_a.ts";
import { addTeardown, buildPyLambda } from "./test_tmux_lib_helpers_c.ts";

// === Bucket: Communicate ===
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

// Bun cannot skip inside a running test: Python's pytest.skip is liveSessionTest in helpers_b, so this throws.
export function live_tmux_session(): string {
  const session: string = `tmux-sh-send-test-${generateUniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_newSession(session);
  if (rc !== 0) {
    throw new Error("tmux_newSession failed; tmux likely unavailable");
  }
  addTeardown((): void => {
    tmux_lib.tmux_killSession(session);
  });
  return session;
}

// export function live_tmux_session_teardown(session: string): void {
//   tmux_lib.tmux_killSession(session);
// }
