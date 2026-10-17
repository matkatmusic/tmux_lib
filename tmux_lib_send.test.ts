import { expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_send } from "./tmux_lib_send.ts";
import { setStubRun } from "./tests/test_tmux_lib_helpers_a.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_sendEnter_sends_the_Enter_token", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib_send.tmux_sendEnter("%1")).toBe(0);
  expect(calls).toEqual([["tmux", "send-keys", "-t", "%1", "Enter"]]);
});

test("tmux_sendCtrlC_sends_the_C_c_token", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib.tmux_sendCtrlC("%1")).toBe(0);
  expect(calls).toEqual([["tmux", "send-keys", "-t", "%1", "C-c"]]);
});

test("tmux_inputBoxHoldsText_is_true_only_for_a_glyph_line_with_content", (): void => {
  setStubRun(0, "❯ hello\n");
  expect(tmux_lib.tmux_inputBoxHoldsText("%1")).toBe(true);
  setStubRun(0, "❯  \n");
  expect(tmux_lib.tmux_inputBoxHoldsText("%1")).toBe(false);
});
