import { expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { setStubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { getCaptureStreams, buildPyLambda, installTestHooks } from "./test_tmux_lib_helpers_c.ts";

installTestHooks();

test("test_tmux_sendKeys_invokes_tmux_send_keys_with_dash_t_target_then_text", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  tmux_lib.tmux_sendKeys("session:0.1", "ls");
  expect(calls).toEqual([["tmux", "send-keys", "-t", "session:0.1", "ls"]]);
});

test("test_tmux_sendKeys_returns_zero_on_success", (): void => {
  setStubRun(0);
  expect(tmux_lib.tmux_sendKeys("sess:0", "echo hi")).toBe(0);
});

test("test_tmux_sendKeys_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  setStubRun(1, "", "can't find pane: nope");
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  let rc: number | undefined;
  function test_tmux_sendKeys_returns_nonzero_and_logs_caller_when_target_missing(): void {
    rc = tmux_lib.tmux_sendKeys("nope", "ls");
  }
  test_tmux_sendKeys_returns_nonzero_and_logs_caller_when_target_missing();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_sendKeys_returns_nonzero_and_logs_caller_when_target_missing");
  expect(err).toContain("can't find pane: nope");
});

test("test_tmux_sendKeys_passes_text_with_special_chars_unchanged", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  const payload: string = "hello world; echo 'hi'";
  tmux_lib.tmux_sendKeys("s:0.0", payload);
  expect(calls[0]![4]).toBe(payload);
  expect(calls).toEqual([["tmux", "send-keys", "-t", "s:0.0", payload]]);
});

test("test_tmux_sendEnter_invokes_tmux_send_keys_with_dash_t_target_and_literal_Enter_token", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  tmux_lib.tmux_sendEnter("session:0.1");
  expect(calls).toEqual([["tmux", "send-keys", "-t", "session:0.1", "Enter"]]);
});

test("test_tmux_sendEnter_returns_zero_on_success", (): void => {
  setStubRun(0);
  expect(tmux_lib.tmux_sendEnter("session:0.0")).toBe(0);
});

test("test_tmux_sendEnter_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  setStubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  let rc: number | undefined;
  function outer_caller(): void {
    rc = tmux_lib.tmux_sendEnter("nope:9.9");
  }
  outer_caller();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("[outer_caller]");
  expect(err).toContain("tmux send-keys -t nope:9.9 Enter");
  expect(err).toContain("can't find pane");
});

test("test_tmux_sendCtrlC_invokes_tmux_send_keys_with_dash_t_target_and_literal_C_dash_c_token", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  tmux_lib.tmux_sendCtrlC("mySession:0.1");
  expect(calls).toEqual([["tmux", "send-keys", "-t", "mySession:0.1", "C-c"]]);
});

test("test_tmux_sendCtrlC_returns_zero_on_success", (): void => {
  setStubRun(0);
  expect(tmux_lib.tmux_sendCtrlC("any:0")).toBe(0);
});

test("test_tmux_sendCtrlC_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  setStubRun(1, "", "can't find pane: ghost");
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  let rc: number | undefined;
  function caller_frame_under_test(): void {
    rc = tmux_lib.tmux_sendCtrlC("ghost:0");
  }
  caller_frame_under_test();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("caller_frame_under_test");
  expect(err).toContain("tmux send-keys -t ghost:0 C-c");
  expect(err).toContain("can't find pane: ghost");
});

test("test_tmux_sendAndSubmit_calls_sendKeys_then_sendEnter_with_same_target", (): void => {
  const calls: string[][] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation(buildPyLambda(2, 2, (p: string, t: string): number => {
    calls.push(["sendKeys", p, t]);
    return 0;
  }));
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(buildPyLambda(1, 1, (p: string): number => {
    calls.push(["sendEnter", p]);
    return 0;
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (_s: number): void => {}));
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation(buildPyLambda(1, 1, (_p: string): boolean => false));
  tmux_lib.tmux_sendAndSubmit("sess:0.1", "hello");
  expect(calls).toEqual([["sendKeys", "sess:0.1", "hello"], ["sendEnter", "sess:0.1"]]);
});

test("test_tmux_sendAndSubmit_returns_zero_when_both_sends_succeed", (): void => {
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation(buildPyLambda(2, 2, (_p: string, _t: string): number => 0));
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(buildPyLambda(1, 1, (_p: string): number => 0));
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (_s: number): void => {}));
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation(buildPyLambda(1, 1, (_p: string): boolean => false));
  expect(tmux_lib.tmux_sendAndSubmit("p", "x")).toBe(0);
});

test("test_tmux_sendAndSubmit_short_circuits_when_sendKeys_fails", (): void => {
  const enter_calls: string[] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation(buildPyLambda(2, 2, (_p: string, _t: string): number => 7));
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(buildPyLambda(1, 1, (p: string): number => {
    enter_calls.push(p);
    return 0;
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (_s: number): void => {}));
  const rc: number = tmux_lib.tmux_sendAndSubmit("p", "x");
  expect(rc).toBe(7);
  expect(enter_calls).toEqual([]);
});

test("test_tmux_sendAndSubmit_returns_sendEnter_rc_when_only_sendEnter_fails", (): void => {
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation(buildPyLambda(2, 2, (_p: string, _t: string): number => 0));
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(buildPyLambda(1, 1, (_p: string): number => 3));
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (_s: number): void => {}));
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation(buildPyLambda(1, 1, (_p: string): boolean => false));
  expect(tmux_lib.tmux_sendAndSubmit("p", "x")).toBe(3);
});
