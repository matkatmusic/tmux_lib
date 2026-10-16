import { expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_window } from "./tmux_lib_window.ts";
import { setStubRun } from "./tests/test_tmux_lib_helpers_a.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

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
