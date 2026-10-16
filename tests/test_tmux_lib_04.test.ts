import { expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, pyLambda, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_setOptionForTarget_passes_target_flag_then_target_then_name_then_value_to_tmux_setOption", (): void => {
  const captured_args: { args: string[] | undefined } = { args: undefined };
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((...args: string[]): number => {
    captured_args.args = args;
    return 0;
  });
  tmux_lib.tmux_setOptionForTarget("mysession", "status", "on");
  expect(captured_args.args).toEqual(["-t", "mysession", "status", "on"]);
});

test("test_tmux_setOptionForTarget_returns_the_exit_code_from_tmux_setOption", (): void => {
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((): number => 42);
  const result: number = tmux_lib.tmux_setOptionForTarget("win0", "remain-on-exit", "off");
  expect(result).toBe(42);
});

test("test_tmux_setOptionGlobally_passes_dash_g_flag_then_name_then_value_to_tmux_setOption", (): void => {
  const captured_args: { args: string[] | undefined } = { args: undefined };
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((...args: string[]): number => {
    captured_args.args = args;
    return 0;
  });
  tmux_lib.tmux_setOptionGlobally("status-interval", "5");
  expect(captured_args.args).toEqual(["-g", "status-interval", "5"]);
});

test("test_tmux_setOptionGlobally_returns_the_exit_code_from_tmux_setOption", (): void => {
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((): number => 42);
  const result: number = tmux_lib.tmux_setOptionGlobally("foo", "bar");
  expect(result).toBe(42);
});

test("test_tmux_setOptionForWindow_passes_dash_w_then_dash_t_then_target_then_name_then_value_to_tmux_setOption", (): void => {
  const captured: { args: string[] | undefined } = { args: undefined };
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((...args: string[]): number => {
    captured.args = args;
    return 0;
  });
  tmux_lib.tmux_setOptionForWindow("mywin", "remain-on-exit", "on");
  expect(captured.args).toEqual(["-w", "-t", "mywin", "remain-on-exit", "on"]);
});

test("test_tmux_setOptionForWindow_returns_the_exit_code_from_tmux_setOption", (): void => {
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((): number => 42);
  const result: number = tmux_lib.tmux_setOptionForWindow("win", "opt", "val");
  expect(result).toBe(42);
});

test("test_tmux_selectPane_invokes_tmux_select_pane_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_selectPane("sess:0.1");
  expect(calls).toEqual([["tmux", "select-pane", "-t", "sess:0.1"]]);
});

test("test_tmux_selectPane_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_selectPane("good-target")).toBe(0);
});

test("test_tmux_selectPane_returns_nonzero_and_logs_caller_when_select_fails", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function caller_frame(): void {
    rc = tmux_lib.tmux_selectPane("missing");
  }
  caller_frame();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("caller_frame");
  expect(err).toContain("can't find pane");
});

test("test_tmux_setPaneTitle_invokes_tmux_select_pane_with_dash_t_target_and_dash_T_title", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_setPaneTitle("%42", "my-title");
  expect(calls).toEqual([["tmux", "select-pane", "-t", "%42", "-T", "my-title"]]);
});

test("test_tmux_setPaneTitle_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_setPaneTitle("%0", "title")).toBe(0);
});

test("test_tmux_setPaneTitle_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function test_tmux_setPaneTitle_returns_nonzero_and_logs_caller_when_target_missing(): void {
    rc = tmux_lib.tmux_setPaneTitle("%999", "x");
  }
  test_tmux_setPaneTitle_returns_nonzero_and_logs_caller_when_target_missing();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("[test_tmux_setPaneTitle_returns_nonzero_and_logs_caller_when_target_missing]");
  expect(err).toContain("can't find pane");
});

test("test_tmux_selectLayout_invokes_tmux_select_layout_with_dash_t_target_then_layout_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_selectLayout("session:0.0", "tiled");
  expect(calls).toEqual([["tmux", "select-layout", "-t", "session:0.0", "tiled"]]);
});

test("test_tmux_selectLayout_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_selectLayout("sess:0", "even-horizontal")).toBe(0);
});

test("test_tmux_selectLayout_returns_nonzero_and_logs_caller_when_layout_invalid", (): void => {
  stubRun(1, "", "invalid layout: bogus");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function test_tmux_selectLayout_returns_nonzero_and_logs_caller_when_layout_invalid(): void {
    rc = tmux_lib.tmux_selectLayout("sess:0", "bogus");
  }
  test_tmux_selectLayout_returns_nonzero_and_logs_caller_when_layout_invalid();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_selectLayout_returns_nonzero_and_logs_caller_when_layout_invalid");
  expect(err).toContain("tmux select-layout -t sess:0 bogus");
  expect(err).toContain("invalid layout: bogus");
});

test("test_tmux_retile_invokes_tmux_selectLayout_with_tiled_for_the_given_target", (): void => {
  const calls: string[][] = [];
  spyOn(tmux_lib, "tmux_selectLayout").mockImplementation(pyLambda(2, 2, (target: string, layout: string): number => {
    calls.push([target, layout]);
    return 0;
  }));
  tmux_lib.tmux_retile("session:1");
  expect(calls).toEqual([["session:1", "tiled"]]);
});

test("test_tmux_retile_returns_the_exit_code_from_tmux_selectLayout", (): void => {
  spyOn(tmux_lib, "tmux_selectLayout").mockImplementation((): number => 42);
  expect(tmux_lib.tmux_retile("any-target")).toBe(42);
});
