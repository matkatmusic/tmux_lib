import { describe, expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import type { RunResult } from "./tmux_lib_internal.ts";
import { tmux_lib_window } from "./tmux_lib_window.ts";
import { LIVE_TIMEOUT_MS, executeRealTmux, generateUniqueSuffix, setStubRun, test as liveTest } from "./tests/test_tmux_lib_helpers_a.ts";
import { addTeardown, installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_killWindow_runs_kill_window_for_the_target", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib_window.tmux_killWindow("s:1")).toBe(0);
  expect(calls).toEqual([["tmux", "kill-window", "-t", "s:1"]]);
});

test("tmux_windowExists_matches_the_exact_window_name", (): void => {
  setStubRun(0, "main\nmain2\n");
  expect(tmux_lib.tmux_windowExists("s", "main")).toBe(0);
  expect(tmux_lib.tmux_windowExists("s", "mai")).toBe(1);
});

describe("live", (): void => {
  liveTest("tmux_listWindows lists the windows of a session whose name has a dot", (): void => {
    const dotName: string = `tl.win ${generateUniqueSuffix()}`;
    const result: RunResult = executeRealTmux("new-session", "-d", "-P", "-F", "#{session_id}", "-s", dotName, "-n", "first");
    expect(result.returncode).toBe(0);
    const sessionId: string = result.stdout.trim();
    addTeardown((): void => {
      executeRealTmux("kill-session", "-t", sessionId);
    });
    const windows: string[] = tmux_lib.tmux_listWindows(dotName, "-F", "#{window_name}");
    expect(windows).toEqual(["first"]);
  }, LIVE_TIMEOUT_MS);
});
