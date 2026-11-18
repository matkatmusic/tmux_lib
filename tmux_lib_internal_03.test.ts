import { describe, expect, test } from "bun:test";
import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";
import { LIVE_TIMEOUT_MS, executeRealTmux, generateUniqueSuffix, test as liveTest } from "./tests/test_tmux_lib_helpers_a.ts";
import { addTeardown, installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";
import { setInternalRunStub, setInternalRunThrow } from "./tests/test_tmux_lib_internal_helpers.ts";

installTestHooks();

test("_tmux_default_runner_returns_the_exit_code_and_silences_output", (): void => {
  const calls: string[][] = [];
  setInternalRunStub(3, "", "", calls);
  expect(tmux_lib_internal._tmux_default_runner(["tmux", "new-session"])).toBe(3);
  expect(calls).toEqual([["tmux", "new-session"]]);
});

test("_tmux_run_joins_output_and_strips_trailing_newlines", (): void => {
  const calls: string[][] = [];
  setInternalRunStub(0, "out\n", "err\n\n", calls);
  expect(tmux_lib_internal._tmux_run("list-sessions", "-F")).toBe("out\nerr");
  expect(calls).toEqual([["tmux", "list-sessions", "-F"]]);
});

test("_tmux_run_reports_a_missing_tmux", (): void => {
  setInternalRunThrow(new tmux_lib_internal.FileNotFoundError("gone"));
  expect(tmux_lib_internal._tmux_run("ls")).toBe("(tmux not found)");
});

test("_tmux_session_exists_is_true_only_for_exit_code_zero", (): void => {
  setInternalRunStub(0, "other\ns\n");
  expect(tmux_lib_internal._tmux_session_exists("s")).toBe(true);
  setInternalRunStub(0, "other\n");
  expect(tmux_lib_internal._tmux_session_exists("s")).toBe(false);
  setInternalRunStub(1, "s\n");
  expect(tmux_lib_internal._tmux_session_exists("s")).toBe(false);
});

test("_tmux_session_exists_is_false_when_tmux_is_missing", (): void => {
  setInternalRunThrow(new tmux_lib_internal.FileNotFoundError("gone"));
  expect(tmux_lib_internal._tmux_session_exists("s")).toBe(false);
});

// Starts a detached real session and returns its id; teardown kills it by id, never by name.
function startRealSessionAndGetId(session_name: string): string {
  const result: RunResult = executeRealTmux("new-session", "-d", "-P", "-F", "#{session_id}", "-s", session_name);
  expect(result.returncode).toBe(0);
  const sessionId: string = result.stdout.trim();
  addTeardown((): void => {
    executeRealTmux("kill-session", "-t", sessionId);
  });
  return sessionId;
}

describe("live", (): void => {
  liveTest("_tmux_session_exists is true for a name with a dot", (): void => {
    const dotName: string = `tl.exists ${generateUniqueSuffix()}`;
    startRealSessionAndGetId(dotName);
    expect(tmux_lib_internal._tmux_session_exists(dotName)).toBe(true);
  }, LIVE_TIMEOUT_MS);

  liveTest("_tmux_session_exists is false when only a longer name exists", (): void => {
    const shortName: string = `tl-exists-${generateUniqueSuffix()}`;
    startRealSessionAndGetId(`${shortName}-longer`);
    expect(tmux_lib_internal._tmux_session_exists(shortName)).toBe(false);
  }, LIVE_TIMEOUT_MS);
});

test("_tmux_default_send_sends_keys_to_the_pane", (): void => {
  const calls: string[][] = [];
  setInternalRunStub(0, "", "", calls);
  tmux_lib_internal._tmux_default_send("%1", "Enter");
  expect(calls).toEqual([["tmux", "send-keys", "-t", "%1", "Enter"]]);
});

test("_tmux_live_pane_ids_strips_lines_and_drops_blanks", (): void => {
  setInternalRunStub(0, " %1 \n\n%2\n");
  expect(tmux_lib_internal._tmux_live_pane_ids()).toEqual(new Set<string>(["%1", "%2"]));
});

test("_tmux_listLivePaneIds_is_empty_on_nonzero_exit", (): void => {
  setInternalRunStub(1, "%1\n");
  expect(tmux_lib_internal._tmux_listLivePaneIds("w")).toEqual(new Set<string>());
});

test("_tmux_paneCurrentCommand_strips_the_command_name", (): void => {
  setInternalRunStub(0, "bash\n");
  expect(tmux_lib_internal._tmux_paneCurrentCommand("%1")).toBe("bash");
});

test("_tmux_kill_pane_targets_the_pane", (): void => {
  const calls: string[][] = [];
  setInternalRunStub(0, "", "", calls);
  tmux_lib_internal._tmux_kill_pane("%9");
  expect(calls).toEqual([["tmux", "kill-pane", "-t", "%9"]]);
});

test("strip_and_splitlines_match_Python_on_unicode_whitespace", (): void => {
  expect(tmux_lib_internal.strip("  a 　")).toBe("a");
  expect(tmux_lib_internal.splitlines("a\r\nb c\n")).toEqual(["a", "b", "c"]);
});
