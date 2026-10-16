import { expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { fakeRun, stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, pyLambda, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_splitWindow_invokes_tmux_split_window_with_dash_h_for_horizontal", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_splitWindow("s1", "h");
  expect(calls).toEqual([["tmux", "split-window", "-h", "-t", "s1"]]);
});

test("test_tmux_splitWindow_invokes_tmux_split_window_with_dash_v_for_vertical", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_splitWindow("win:0", "v");
  expect(calls).toEqual([["tmux", "split-window", "-v", "-t", "win:0"]]);
});

test("test_tmux_splitWindow_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_splitWindow("s1", "h")).toBe(0);
});

test("test_tmux_splitWindow_returns_nonzero_and_logs_caller_when_split_fails", (): void => {
  stubRun(1, "", "no such target");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function test_tmux_splitWindow_returns_nonzero_and_logs_caller_when_split_fails(): void {
    rc = tmux_lib.tmux_splitWindow("missing", "h");
  }
  test_tmux_splitWindow_returns_nonzero_and_logs_caller_when_split_fails();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("tmux split-window -h -t missing");
  expect(err).toContain("test_tmux_splitWindow_returns_nonzero_and_logs_caller_when_split_fails");
});

test("test_tmux_splitWindow_raises_ValueError_for_invalid_direction", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  expect((): number => tmux_lib.tmux_splitWindow("s1", "x")).toThrow(tmux_lib_internal.ValueError);
  expect((): number => tmux_lib.tmux_splitWindow("s1", "x")).toThrow("direction must be 'h' or 'v'");
  expect(calls).toEqual([]);
});

test("test_tmux_splitWorkerPane_returns_pane_id_on_success", (): void => {
  const captured: { cmd: string[]; options: object | undefined } = { cmd: [], options: undefined };
  spyOn(tmux_lib, "run").mockImplementation(fakeRun(pyLambda(2, 2, (cmd: string[], options: object): RunResult => {
    captured.cmd = [...cmd];
    captured.options = options;
    return { returncode: 0, stdout: "%42\n", stderr: "" };
  })));
  const result: string | undefined = tmux_lib.tmux_splitWorkerPane("sess:win", "/tmp/work", "sleep 1");
  expect(result).toBe("%42");
  expect(captured.options).toEqual({ capture_output: true, text: true, check: false });
  expect(captured.cmd.slice(0, 2)).toEqual(["tmux", "split-window"]);
  expect(captured.cmd.includes("-t") && captured.cmd.includes("sess:win")).toBe(true);
  expect(captured.cmd.includes("-c") && captured.cmd.includes("/tmp/work")).toBe(true);
  expect(captured.cmd).toContain("-P");
  expect(captured.cmd.includes("-F") && captured.cmd.includes("#{pane_id}")).toBe(true);
  expect(captured.cmd).toContain("sleep 1");
});

test("test_tmux_splitWorkerPane_returns_None_when_tmux_fails", (): void => {
  stubRun(1, "", "boom");
  expect(tmux_lib.tmux_splitWorkerPane("sess:win", "/tmp", "cmd")).toBeUndefined();
});

test("test_tmux_splitWorkerPane_returns_None_when_pane_id_blank", (): void => {
  stubRun(0, "\n");
  expect(tmux_lib.tmux_splitWorkerPane("sess:win", "/tmp", "cmd")).toBeUndefined();
});

test("test_tmux_splitWorkerPane_logs_caller_attributed_stderr_on_failure", (): void => {
  stubRun(1, "", "boom");
  const streams: { out: () => string; err: () => string } = captureStreams();
  function caller_frame_under_test(): void {
    tmux_lib.tmux_splitWorkerPane("s:w", "/tmp", "cmd");
  }
  caller_frame_under_test();
  const err: string = streams.err();
  expect(err).toContain("caller_frame_under_test");
  expect(err).toContain("tmux split-window -t s:w");
  expect(err).toContain("boom");
});

test("test_tmux_ensureKeepalivePane_returns_early_when_pane_with_title_exists", (): void => {
  const has_title = spyOn(tmux_lib, "tmux_paneHasTitle").mockImplementation((): number => 0);
  const split_worker = spyOn(tmux_lib, "tmux_splitWorkerPane").mockImplementation((): string | undefined => undefined);
  const set_title = spyOn(tmux_lib, "tmux_setPaneTitle").mockImplementation((): number => 0);
  const retile = spyOn(tmux_lib, "tmux_retile").mockImplementation((): number => 0);
  const result: void = tmux_lib.tmux_ensureKeepalivePane("sess:win", "/tmp", "sleep 9999", "keepalive");
  expect(result).toBeUndefined();
  expect(has_title.mock.calls).toEqual([["sess:win", "keepalive"]]);
  expect(split_worker).not.toHaveBeenCalled();
  expect(set_title).not.toHaveBeenCalled();
  expect(retile).not.toHaveBeenCalled();
});

test("test_tmux_ensureKeepalivePane_creates_pane_sets_title_and_retiles_when_absent", (): void => {
  spyOn(tmux_lib, "tmux_paneHasTitle").mockImplementation((): number => 1);
  const split_worker = spyOn(tmux_lib, "tmux_splitWorkerPane").mockImplementation((): string | undefined => "%42");
  const set_title = spyOn(tmux_lib, "tmux_setPaneTitle").mockImplementation((): number => 0);
  const retile = spyOn(tmux_lib, "tmux_retile").mockImplementation((): number => 0);
  tmux_lib.tmux_ensureKeepalivePane("sess:win", "/work", "sleep 9999", "keepalive");
  expect(split_worker.mock.calls).toEqual([["sess:win", "/work", "sleep 9999"]]);
  expect(set_title.mock.calls).toEqual([["%42", "keepalive"]]);
  expect(retile.mock.calls).toEqual([["sess:win"]]);
});

test("test_tmux_ensureKeepalivePane_skips_set_title_when_split_returns_none", (): void => {
  spyOn(tmux_lib, "tmux_paneHasTitle").mockImplementation((): number => 1);
  const split_worker = spyOn(tmux_lib, "tmux_splitWorkerPane").mockImplementation((): string | undefined => undefined);
  const set_title = spyOn(tmux_lib, "tmux_setPaneTitle").mockImplementation((): number => 0);
  const retile = spyOn(tmux_lib, "tmux_retile").mockImplementation((): number => 0);
  tmux_lib.tmux_ensureKeepalivePane("sess:win", "/work", "sleep 9999", "keepalive");
  expect(split_worker.mock.calls).toEqual([["sess:win", "/work", "sleep 9999"]]);
  expect(set_title).not.toHaveBeenCalled();
  expect(retile.mock.calls).toEqual([["sess:win"]]);
});
