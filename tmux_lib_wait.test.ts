import { expect, spyOn, test } from "bun:test";
import { buildPyLambda } from "./tests/test_tmux_lib_helpers_c.ts";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_wait } from "./tmux_lib_wait.ts";
import { setStubRun } from "./tests/test_tmux_lib_helpers_a.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_answerDialog_presses_Enter_for_an_Esc_to_cancel_dialog", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib_wait.tmux_answerDialog("%1", "Esc to cancel")).toBe(true);
  expect(calls).toEqual([["tmux", "send-keys", "-t", "%1", "Enter"]]);
});

test("tmux_answerDialog_is_false_and_silent_for_a_plain_screen", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib.tmux_answerDialog("%1", "hello")).toBe(false);
  expect(calls).toEqual([]);
});

test("tmux_waitForClaudeReadiness_timeout_is_in_seconds", (): void => {
  const captures: string[] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(buildPyLambda(1, 2, (pane: string, _l?: number): string => {
    captures.push(pane);
    return "loading";
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (_s: number): void => {}));
  expect(tmux_lib.tmux_waitForClaudeReadiness("%1", 2, 0.5)).toBe(1);
  expect(captures.length).toBe(4);
});

test("tmux_waitForClaudeReadiness_throws_when_signed_out", (): void => {
  setStubRun(0, "Select login method");
  expect((): number => tmux_lib.tmux_waitForClaudeReadiness("%1", 1)).toThrow("signed out");
});
