import { expect } from "bun:test";
import { test } from "./test_tmux_lib_helpers_a.ts";
import { isTmuxSessionPresent, isTmuxWindowPresent } from "./test_tmux_lib_helpers_b.ts";

test("isTmuxSessionPresent_is_false_for_a_session_that_does_not_exist", (): void => {
  expect(isTmuxSessionPresent("no-such-session-for-helper-test")).toBe(false);
});

test("isTmuxWindowPresent_is_false_for_a_session_that_does_not_exist", (): void => {
  expect(isTmuxWindowPresent("no-such-session-for-helper-test", "w")).toBe(false);
});
