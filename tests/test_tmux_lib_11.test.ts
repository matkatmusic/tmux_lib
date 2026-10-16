import { expect } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_hasSession_returns_zero_when_session_exists", (): void => {
  stubRun(0);
  const rc: number = tmux_lib.tmux_hasSession("mysess");
  expect(rc).toBe(0);
});

test("test_tmux_hasSession_returns_one_when_session_does_not_exist", (): void => {
  stubRun(1);
  const rc: number = tmux_lib.tmux_hasSession("ghost");
  expect(rc).toBe(1);
});

test("test_tmux_hasSession_invokes_tmux_has_session_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_hasSession("alpha");
  expect(calls).toEqual([["tmux", "has-session", "-t", "alpha"]]);
});

test("test_tmux_hasSession_does_not_log_to_stderr_when_session_is_simply_absent", (): void => {
  stubRun(1, "", "can't find session: ghost");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.tmux_hasSession("ghost");
  expect(streams.err()).toBe("");
});

test("test_tmux_hasSession_logs_caller_name_to_stderr_on_unexpected_nonzero_rc", (): void => {
  stubRun(2, "", "boom");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function test_tmux_hasSession_logs_caller_name_to_stderr_on_unexpected_nonzero_rc(): void {
    rc = tmux_lib.tmux_hasSession("weird");
  }
  test_tmux_hasSession_logs_caller_name_to_stderr_on_unexpected_nonzero_rc();
  const captured_err: string = streams.err();
  expect(rc).toBe(2);
  expect(captured_err).toContain("test_tmux_hasSession_logs_caller_name_to_stderr_on_unexpected_nonzero_rc");
  expect(captured_err).toContain("tmux has-session -t weird");
  expect(captured_err).toContain("boom");
});

test("test_tmux_listClients_invokes_tmux_list_clients_with_dash_t_session_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_listClients("mysess");
  expect(calls).toEqual([["tmux", "list-clients", "-t", "mysess"]]);
});

test("test_tmux_listClients_returns_empty_list_when_no_clients_attached", (): void => {
  stubRun(0, "");
  expect(tmux_lib.tmux_listClients("sess")).toEqual([]);
});

test("test_tmux_listClients_returns_one_string_per_client_line_on_stdout", (): void => {
  const stdout: string = "/dev/ttys001: 0: [80x24 xterm-256color] (utf8)\n/dev/ttys002: 1: [120x40 xterm-256color] (utf8)\n";
  stubRun(0, stdout);
  const result: string[] = tmux_lib.tmux_listClients("sess");
  expect(result).toEqual([
    "/dev/ttys001: 0: [80x24 xterm-256color] (utf8)",
    "/dev/ttys002: 1: [120x40 xterm-256color] (utf8)",
  ]);
});

test("test_tmux_listClients_returns_empty_list_and_logs_caller_when_session_not_found", (): void => {
  stubRun(1, "", "can't find session: ghost\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let result: string[] | undefined;
  function caller_frame(): void {
    result = tmux_lib.tmux_listClients("ghost");
  }
  caller_frame();
  const err: string = streams.err();
  expect(result).toEqual([]);
  expect(err).toContain("caller_frame");
  expect(err).toContain("tmux list-clients -t ghost");
});

test("test_tmux_capturePane_invokes_tmux_capture_pane_with_dash_p_dash_t_target_when_no_scrollback_requested", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_capturePane("session:0.1");
  expect(calls).toEqual([["tmux", "capture-pane", "-p", "-t", "session:0.1"]]);
});

test("test_tmux_capturePane_returns_pane_stdout_text_on_success", (): void => {
  const pane_text: string = "line one\nline two\n";
  stubRun(0, pane_text);
  const result: string = tmux_lib.tmux_capturePane("foo:1.0");
  expect(result).toBe(pane_text);
});

test("test_tmux_capturePane_includes_dash_S_negative_offset_when_scrollback_lines_given", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_capturePane("sess:0.0", 200);
  expect(calls).toEqual([["tmux", "capture-pane", "-p", "-t", "sess:0.0", "-S", "-200"]]);
});

test("test_tmux_capturePane_returns_empty_string_and_logs_caller_when_target_missing", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  const result: string = tmux_lib.tmux_capturePane("bogus:9.9");
  const err: string = streams.err();
  expect(result).toBe("");
  expect(err).toContain("command 'tmux capture-pane -p -t bogus:9.9' failed");
  expect(err).toContain("can't find pane");
});
