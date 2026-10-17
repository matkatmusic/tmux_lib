import { expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_internal } from "./tmux_lib_internal.ts";
import { tmux_lib_layout } from "./tmux_lib_layout.ts";
import { setStubRun } from "./tests/test_tmux_lib_helpers_a.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_splitWindow_throws_ValueError_for_a_direction_other_than_h_or_v", (): void => {
  expect((): number => tmux_lib_layout.tmux_splitWindow("w", "x")).toThrow(tmux_lib_internal.ValueError);
});

test("tmux_retile_selects_the_tiled_layout", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib.tmux_retile("w")).toBe(0);
  expect(calls).toEqual([["tmux", "select-layout", "-t", "w", "tiled"]]);
});

test("tmux_splitWorkerPane_returns_the_stripped_pane_id", (): void => {
  setStubRun(0, " %7\n");
  expect(tmux_lib.tmux_splitWorkerPane("w", "/tmp", "sleep 1")).toBe("%7");
});
