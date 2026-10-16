import { expect } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_newSession_invokes_tmux_new_session_with_dash_d_dash_s_and_session_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newSession("mysess");
  expect(calls).toEqual([["tmux", "new-session", "-d", "-s", "mysess"]]);
});

test("test_tmux_newSession_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_newSession("ok")).toBe(0);
});

test("test_tmux_newSession_returns_nonzero_and_logs_caller_when_creation_fails", (): void => {
  stubRun(1, "", "duplicate session: dup");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function test_tmux_newSession_returns_nonzero_and_logs_caller_when_creation_fails(): void {
    rc = tmux_lib.tmux_newSession("dup");
  }
  test_tmux_newSession_returns_nonzero_and_logs_caller_when_creation_fails();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_newSession_returns_nonzero_and_logs_caller_when_creation_fails");
  expect(err).toContain("tmux new-session -d -s dup");
  expect(err).toContain("duplicate session: dup");
});

test("test_tmux_newSession_passes_extra_args_through_to_tmux_after_session_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newSession("s1", "-n", "win", "-c", "/tmp", "bash");
  expect(calls).toEqual([["tmux", "new-session", "-d", "-s", "s1", "-n", "win", "-c", "/tmp", "bash"]]);
});

test("test_tmux_newPane_invokes_tmux_split_window_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newPane("sess:0.0");
  expect(calls).toEqual([["tmux", "split-window", "-t", "sess:0.0"]]);
});

test("test_tmux_newPane_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_newPane("sess:0.0")).toBe(0);
});

test("test_tmux_newPane_returns_nonzero_and_logs_caller_when_split_fails", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function test_tmux_newPane_returns_nonzero_and_logs_caller_when_split_fails(): void {
    rc = tmux_lib.tmux_newPane("nope:0.0");
  }
  test_tmux_newPane_returns_nonzero_and_logs_caller_when_split_fails();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_newPane_returns_nonzero_and_logs_caller_when_split_fails");
  expect(err).toContain("can't find pane");
});

test("test_tmux_newPane_passes_extra_args_through_after_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newPane("sess:0.0", "-c", "/tmp", "-P", "-F", "#{pane_id}", "bash");
  expect(calls).toEqual([["tmux", "split-window", "-t", "sess:0.0", "-c", "/tmp", "-P", "-F", "#{pane_id}", "bash"]]);
});

test("test_tmux_newPane_prints_stdout_to_caller_on_success", (): void => {
  stubRun(0, "%42\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_newPane("sess:0.0", "-P", "-F", "#{pane_id}");
  const out: string = streams.out();
  expect(rc).toBe(0);
  expect(out).toBe("%42\n");
});

test("test_tmux_newWindow_invokes_tmux_new_window_with_dash_t_session_and_dash_n_window", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newWindow("mysess", "mywin");
  expect(calls).toEqual([["tmux", "new-window", "-t", "mysess", "-n", "mywin"]]);
});

test("test_tmux_newWindow_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_newWindow("s", "w")).toBe(0);
});

test("test_tmux_newWindow_returns_nonzero_and_logs_caller_when_creation_fails", (): void => {
  stubRun(2, "", "duplicate window");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function caller_fn(): void {
    rc = tmux_lib.tmux_newWindow("s", "w");
  }
  caller_fn();
  const err: string = streams.err();
  expect(rc).toBe(2);
  expect(err).toContain("[caller_fn]");
  expect(err).toContain("duplicate window");
});

test("test_tmux_newWindow_passes_extra_args_through_after_window_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newWindow("s", "w", "-c", "/tmp", "echo hi");
  expect(calls).toEqual([["tmux", "new-window", "-t", "s", "-n", "w", "-c", "/tmp", "echo hi"]]);
});
