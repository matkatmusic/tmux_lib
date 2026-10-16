import { describe, expect } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { LIVE_TIMEOUT_MS, stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { sessionNameFixture, tmuxSessionPanesFixture } from "./test_tmux_lib_helpers_b.ts";
import { captureStreams, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_killSession_invokes_tmux_kill_session_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_killSession("my-sess");
  expect(calls).toEqual([["tmux", "kill-session", "-t", "my-sess"]]);
});

test("test_tmux_killSession_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_killSession("any")).toBe(0);
});

test("test_tmux_killSession_returns_nonzero_and_logs_caller_when_kill_fails", (): void => {
  stubRun(1, "", "can't find session: ghost");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function caller_frame(): void {
    rc = tmux_lib.tmux_killSession("ghost");
  }
  caller_frame();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("caller_frame");
  expect(err).toContain("tmux kill-session -t ghost");
  expect(err).toContain("can't find session: ghost");
});

test("test_tmux_killPane_invokes_tmux_kill_pane_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_killPane("session:0.1");
  expect(calls).toEqual([["tmux", "kill-pane", "-t", "session:0.1"]]);
});

test("test_tmux_killPane_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_killPane("any:0.0")).toBe(0);
});

test("test_tmux_killPane_returns_nonzero_and_logs_caller_when_kill_fails", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function caller_frame_marker(): void {
    rc = tmux_lib.tmux_killPane("missing:9.9");
  }
  caller_frame_marker();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("[caller_frame_marker]");
  expect(err).toContain("tmux kill-pane -t missing:9.9");
  expect(err).toContain("can't find pane");
});

test("test_tmux_killWindow_invokes_tmux_kill_window_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_killWindow("session:1");
  expect(calls).toEqual([["tmux", "kill-window", "-t", "session:1"]]);
});

test("test_tmux_killWindow_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_killWindow("session:1")).toBe(0);
});

test("test_tmux_killWindow_returns_nonzero_and_logs_caller_when_window_missing", (): void => {
  stubRun(1, "", "can't find window: ghost\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  let rc: number | undefined;
  function test_tmux_killWindow_returns_nonzero_and_logs_caller_when_window_missing(): void {
    rc = tmux_lib.tmux_killWindow("ghost");
  }
  test_tmux_killWindow_returns_nonzero_and_logs_caller_when_window_missing();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_killWindow_returns_nonzero_and_logs_caller_when_window_missing");
  expect(err).toContain("tmux kill-window -t ghost");
  expect(err).toContain("can't find window: ghost");
});

describe("live", (): void => {
  test("test_killSession_fails_onNonexistentSession", (): void => {
    const session_name: string = sessionNameFixture();
    const streams: { out: () => string; err: () => string } = captureStreams();
    const rc: number = tmux_lib.tmux_killSession(session_name);
    expect(rc).not.toBe(0);
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_killSession_succeeds_onExistingSession", (): void => {
    const session_name: string = sessionNameFixture();
    expect(tmux_lib.tmux_newSession(session_name)).toBe(0);
    const rc: number = tmux_lib.tmux_killSession(session_name);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_killPane_removesLivePane", (): void => {
    const tmux_session_panes: string = tmuxSessionPanesFixture();
    expect(tmux_lib.tmux_newPane(tmux_session_panes)).toBe(0);
    const ids: string[] = tmux_lib.tmux_listPanes(tmux_session_panes, "-F", "#{pane_id}");
    expect(ids.length, "precondition: need at least 2 panes").toBeGreaterThanOrEqual(2);
    const second_id: string = ids[1]!;
    const rc: number = tmux_lib.tmux_killPane(second_id);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_killPane_failsOnNonexistentTarget", (): void => {
    const streams: { out: () => string; err: () => string } = captureStreams();
    const bogus: string = `nonexistent-${process.pid}`;
    const rc: number = tmux_lib.tmux_killPane(bogus);
    expect(rc).not.toBe(0);
    streams.err();
  }, LIVE_TIMEOUT_MS);
});
