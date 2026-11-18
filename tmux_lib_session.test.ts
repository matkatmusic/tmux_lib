import { describe, expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import type { RunResult } from "./tmux_lib_internal.ts";
import { tmux_lib_session } from "./tmux_lib_session.ts";
import { LIVE_TIMEOUT_MS, executeRealTmux, generateUniqueSuffix, setStubRun, test as liveTest } from "./tests/test_tmux_lib_helpers_a.ts";
import { addTeardown, installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_killSession_runs_kill_session_for_the_named_session", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "$7 s\n", "", calls);
  expect(tmux_lib_session.tmux_killSession("s")).toBe(0);
  expect(calls).toEqual([
    ["tmux", "list-sessions", "-F", "#{session_id} #{session_name}"],
    ["tmux", "kill-session", "-t", "$7"],
  ]);
});

test("tmux_listClients_returns_non_empty_lines", (): void => {
  setStubRun(0, "c1\n\nc2\n");
  expect(tmux_lib.tmux_listClients("s")).toEqual(["c1", "c2"]);
});

test("tmux_hasSession_returns_the_exit_code_without_logging_for_one", (): void => {
  setStubRun(1);
  expect(tmux_lib.tmux_hasSession("s")).toBe(1);
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
  liveTest("tmux_hasSession is false when only a longer name exists", (): void => {
    const shortName: string = `tl-prefix-${generateUniqueSuffix()}`;
    startRealSessionAndGetId(`${shortName}-longer`);
    expect(tmux_lib.tmux_hasSession(shortName)).toBe(1);
  }, LIVE_TIMEOUT_MS);

  liveTest("tmux_hasSession is true for a name with a dot", (): void => {
    const dotName: string = `tl.dot ${generateUniqueSuffix()}`;
    startRealSessionAndGetId(dotName);
    expect(tmux_lib.tmux_hasSession(dotName)).toBe(0);
  }, LIVE_TIMEOUT_MS);

  liveTest("tmux_killSession closes a session whose name has a dot", (): void => {
    const dotName: string = `tl.kill ${generateUniqueSuffix()}`;
    const sessionId: string = startRealSessionAndGetId(dotName);
    expect(tmux_lib.tmux_killSession(dotName)).toBe(0);
    expect(executeRealTmux("has-session", "-t", sessionId).returncode).toBe(1);
  }, LIVE_TIMEOUT_MS);
});
