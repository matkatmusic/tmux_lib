import { expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, pyLambda, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_listPanes_uses_default_pane_id_and_title_format_when_no_extras_given", (): void => {
  const calls: string[][] = [];
  stubRun(0, "%0 alpha\n", "", calls);
  tmux_lib.tmux_listPanes("session:0");
  expect(calls).toEqual([["tmux", "list-panes", "-t", "session:0", "-F", "#{pane_id} #{pane_title}"]]);
});

test("test_tmux_listPanes_passes_extra_args_through_when_extras_given_and_omits_default_format", (): void => {
  const calls: string[][] = [];
  stubRun(0, "alpha\n", "", calls);
  tmux_lib.tmux_listPanes("session:0", "-F", "#{pane_title}");
  expect(calls).toEqual([["tmux", "list-panes", "-t", "session:0", "-F", "#{pane_title}"]]);
});

test("test_tmux_listPanes_returns_one_string_per_pane_line", (): void => {
  stubRun(0, "%0 alpha\n%1 beta\n%2 gamma\n");
  const panes: string[] = tmux_lib.tmux_listPanes("session:0");
  expect(panes).toEqual(["%0 alpha", "%1 beta", "%2 gamma"]);
});

test("test_tmux_listPanes_returns_empty_list_when_no_panes_in_stdout", (): void => {
  stubRun(0, "");
  expect(tmux_lib.tmux_listPanes("session:0")).toEqual([]);
});

test("test_tmux_listPanes_returns_empty_list_and_logs_caller_when_target_missing", (): void => {
  stubRun(1, "", "can't find session");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let panes: string[] | undefined;
  function test_tmux_listPanes_returns_empty_list_and_logs_caller_when_target_missing(): void {
    panes = tmux_lib.tmux_listPanes("nope");
  }
  test_tmux_listPanes_returns_empty_list_and_logs_caller_when_target_missing();
  const err: string = streams.err();
  expect(panes).toEqual([]);
  expect(err).toContain("test_tmux_listPanes_returns_empty_list_and_logs_caller_when_target_missing");
  expect(err).toContain("can't find session");
});

test("test_tmux_listWindows_uses_default_window_index_and_name_format_when_no_extras_given", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_listWindows("mysession");
  expect(calls).toEqual([["tmux", "list-windows", "-t", "mysession", "-F", "#{window_index} #{window_name}"]]);
});

test("test_tmux_listWindows_passes_extra_args_through_when_extras_given_and_omits_default_format", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_listWindows("mysession", "-F", "#{window_name}");
  expect(calls).toEqual([["tmux", "list-windows", "-t", "mysession", "-F", "#{window_name}"]]);
});

test("test_tmux_listWindows_returns_one_string_per_window_line", (): void => {
  stubRun(0, "0 main\n1 logs\n2 editor\n");
  const result: string[] = tmux_lib.tmux_listWindows("mysession");
  expect(result).toEqual(["0 main", "1 logs", "2 editor"]);
});

test("test_tmux_listWindows_returns_empty_list_when_no_windows_in_stdout", (): void => {
  stubRun(0, "\n");
  expect(tmux_lib.tmux_listWindows("mysession")).toEqual([]);
});

test("test_tmux_listWindows_returns_empty_list_and_logs_caller_when_session_missing", (): void => {
  stubRun(1, "", "can't find session: ghost");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let result: string[] | undefined;
  function test_tmux_listWindows_returns_empty_list_and_logs_caller_when_session_missing(): void {
    result = tmux_lib.tmux_listWindows("ghost");
  }
  test_tmux_listWindows_returns_empty_list_and_logs_caller_when_session_missing();
  const err: string = streams.err();
  expect(result).toEqual([]);
  expect(err).toContain("test_tmux_listWindows_returns_empty_list_and_logs_caller_when_session_missing");
  expect(err).toContain("ghost");
});

test("test_tmux_windowExists_returns_zero_when_window_name_appears_in_listed_windows", (): void => {
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation(
    pyLambda(1, Infinity, (_session: string, ..._args: string[]): string[] => ["main", "logs", "editor"]),
  );
  expect(tmux_lib.tmux_windowExists("sess", "logs")).toBe(0);
});

test("test_tmux_windowExists_returns_one_when_window_name_not_in_listed_windows", (): void => {
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation(
    pyLambda(1, Infinity, (_session: string, ..._args: string[]): string[] => ["main", "editor"]),
  );
  expect(tmux_lib.tmux_windowExists("sess", "logs")).toBe(1);
});

test("test_tmux_windowExists_uses_exact_match_not_substring", (): void => {
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation(
    pyLambda(1, Infinity, (_session: string, ..._args: string[]): string[] => ["logs"]),
  );
  expect(tmux_lib.tmux_windowExists("sess", "log")).toBe(1);
});

test("test_tmux_windowExists_invokes_tmux_listWindows_with_F_window_name_format", (): void => {
  const captured: { session: string | undefined; args: string[] | undefined } = { session: undefined, args: undefined };
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation(pyLambda(1, Infinity, (session: string, ...args: string[]): string[] => {
    captured.session = session;
    captured.args = args;
    return [];
  }));
  tmux_lib.tmux_windowExists("my-session", "anything");
  expect(captured.session).toBe("my-session");
  expect(captured.args).toEqual(["-F", "#{window_name}"]);
});

test("test_tmux_paneHasTitle_returns_zero_when_title_appears_in_listed_panes", (): void => {
  spyOn(tmux_lib, "tmux_listPanes").mockImplementation((): string[] => ["editor", "shell", "logs"]);
  expect(tmux_lib.tmux_paneHasTitle("sess:0", "shell")).toBe(0);
});

test("test_tmux_paneHasTitle_returns_one_when_title_not_in_listed_panes", (): void => {
  spyOn(tmux_lib, "tmux_listPanes").mockImplementation((): string[] => ["editor", "logs"]);
  expect(tmux_lib.tmux_paneHasTitle("sess:0", "shell")).toBe(1);
});

test("test_tmux_paneHasTitle_uses_exact_match_not_substring", (): void => {
  spyOn(tmux_lib, "tmux_listPanes").mockImplementation((): string[] => ["editor", "shell-extra", "logs"]);
  expect(tmux_lib.tmux_paneHasTitle("sess:0", "shell")).toBe(1);
});

test("test_tmux_paneHasTitle_invokes_tmux_listPanes_with_F_pane_title_format", (): void => {
  const captured: { args: string[] | undefined } = { args: undefined };
  const spy = spyOn(tmux_lib, "tmux_listPanes").mockImplementation((...args: string[]): string[] => {
    captured.args = args;
    return [];
  });
  tmux_lib.tmux_paneHasTitle("my-target", "anything");
  expect(captured.args).toEqual(["my-target", "-F", "#{pane_title}"]);
  expect(spy.mock.calls[0]!.length).toBe(3);
});
