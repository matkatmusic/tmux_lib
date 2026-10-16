import { expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_options } from "./tmux_lib_options.ts";
import { setStubRun } from "./tests/test_tmux_lib_helpers_a.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_setOptionGlobally_runs_set_option_with_the_g_flag", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib_options.tmux_setOptionGlobally("mouse", "on")).toBe(0);
  expect(calls).toEqual([["tmux", "set-option", "-g", "mouse", "on"]]);
});

test("tmux_setOptionForWindow_runs_set_option_with_the_w_and_t_flags", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib.tmux_setOptionForWindow("w:1", "mouse", "on")).toBe(0);
  expect(calls).toEqual([["tmux", "set-option", "-w", "-t", "w:1", "mouse", "on"]]);
});

test("tmux_requireVersion_fails_when_the_tmux_version_is_too_old", (): void => {
  setStubRun(0, "tmux 3.2a\n");
  expect(tmux_lib.tmux_requireVersion("9.0")).toBe(1);
  expect(tmux_lib.tmux_requireVersion("3.0")).toBe(0);
});
