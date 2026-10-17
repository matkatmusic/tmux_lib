import { expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_pane } from "./tmux_lib_pane.ts";
import { setStubRun } from "./tests/test_tmux_lib_helpers_a.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_killPane_runs_kill_pane_for_the_target", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib_pane.tmux_killPane("%1")).toBe(0);
  expect(calls).toEqual([["tmux", "kill-pane", "-t", "%1"]]);
});

test("tmux_capturePane_returns_stdout_and_adds_scrollback", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "screen", "", calls);
  expect(tmux_lib.tmux_capturePane("%1", 5)).toBe("screen");
  expect(calls).toEqual([["tmux", "capture-pane", "-p", "-t", "%1", "-S", "-5"]]);
});

test("tmux_paneHasTitle_matches_the_exact_title", (): void => {
  setStubRun(0, "one\ntwo\n");
  expect(tmux_lib.tmux_paneHasTitle("w", "two")).toBe(0);
  expect(tmux_lib.tmux_paneHasTitle("w", "tw")).toBe(1);
});
