import { describe, expect } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { LIVE_TIMEOUT_MS, executeRealTmux, test } from "./test_tmux_lib_helpers_a.ts";
import { getFirstPaneId, createLayoutSessionFixture, createSessionOptsFixture, createSessionPanesFixture } from "./test_tmux_lib_helpers_b.ts";
import { getCaptureStreams, stopRealSession, installTestHooks } from "./test_tmux_lib_helpers_c.ts";

installTestHooks();

describe("live", (): void => {
  test("test_setOptionForWindow_rejects_nonexistent_window", (): void => {
    const session: string = createSessionOptsFixture();
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const bogus_win: string = `nosuch-${process.pid}`;
    const rc: number = tmux_lib.tmux_setOptionForWindow(`${session}:${bogus_win}`, "aggressive-resize", "on");
    expect(rc).not.toBe(0);
    streams.out();
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_setOptionForWindow_accepts_valid_window_option", (): void => {
    const session: string = createSessionOptsFixture();
    const win: string = `optwin-${process.pid}`;
    const rc_new: number = tmux_lib.tmux_newWindow(session, win);
    expect(rc_new, "precondition: tmux_newWindow should succeed").toBe(0);
    const rc: number = tmux_lib.tmux_setOptionForWindow(`${session}:${win}`, "aggressive-resize", "on");
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_setOptionGlobally_rejects_invalid_option", (): void => {
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const rc: number = tmux_lib.tmux_setOptionGlobally("not-a-real-option", "foo");
    expect(rc).not.toBe(0);
    streams.out();
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_setOptionGlobally_accepts_valid_global_option", (): void => {
    const proc: RunResult = executeRealTmux("show-options", "-gv", "mouse");
    const current: string = tmux_lib_internal.strip(proc.stdout || "") || "off";
    const rc: number = tmux_lib.tmux_setOptionGlobally("mouse", current);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_setOptionForTarget_rejects_nonexistent_target", (): void => {
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const bogus: string = `nonexistent-${process.pid}`;
    stopRealSession(bogus);
    const rc: number = tmux_lib.tmux_setOptionForTarget(bogus, "mouse", "on");
    expect(rc).not.toBe(0);
    streams.out();
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_setOptionForTarget_rejects_invalid_option", (): void => {
    const session: string = createSessionOptsFixture();
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const rc: number = tmux_lib.tmux_setOptionForTarget(session, "not-a-real-option", "foo");
    expect(rc).not.toBe(0);
    streams.out();
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_setOptionForTarget_accepts_valid_session_option", (): void => {
    const session: string = createSessionOptsFixture();
    const rc: number = tmux_lib.tmux_setOptionForTarget(session, "remain-on-exit", "off");
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_selectPane_byKnownPaneId_succeeds", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    const pid: string = getFirstPaneId(tmux_session_panes);
    expect(pid, "precondition: a pane id must exist").toBeTruthy();
    const rc: number = tmux_lib.tmux_selectPane(pid);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_setPaneTitle_succeeds", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    const pid: string = getFirstPaneId(tmux_session_panes);
    const rc: number = tmux_lib.tmux_setPaneTitle(pid, `titletest-${process.pid}`);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_setPaneTitle_roundTripsThroughListPanes", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    const pid: string = getFirstPaneId(tmux_session_panes);
    const title: string = `titletest-${process.pid}`;
    expect(tmux_lib.tmux_setPaneTitle(pid, title)).toBe(0);
    const rows: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
    expect(rows.some((row: string): boolean => row.includes(title))).toBe(true);
  }, LIVE_TIMEOUT_MS);

  test("test_selectPane_failsOnNonexistentTarget", (): void => {
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const bogus: string = `nonexistent-${process.pid}`;
    const rc: number = tmux_lib.tmux_selectPane(bogus);
    expect(rc).not.toBe(0);
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_selectLayout_tiled_succeeds", (): void => {
    const layout_session: string = createLayoutSessionFixture();
    const rc: number = tmux_lib.tmux_selectLayout(layout_session, "tiled");
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_selectLayout_evenHorizontal_succeeds", (): void => {
    const layout_session: string = createLayoutSessionFixture();
    const rc: number = tmux_lib.tmux_selectLayout(layout_session, "even-horizontal");
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_selectLayout_invalidName_fails", (): void => {
    const layout_session: string = createLayoutSessionFixture();
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const rc: number = tmux_lib.tmux_selectLayout(layout_session, "not-a-layout");
    expect(rc).not.toBe(0);
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_retile_succeeds", (): void => {
    const layout_session: string = createLayoutSessionFixture();
    const rc: number = tmux_lib.tmux_retile(layout_session);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_retile_nonexistentTarget_fails", (): void => {
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const bogus: string = `nonexistent-${process.pid}-xyz`;
    const rc: number = tmux_lib.tmux_retile(bogus);
    expect(rc).not.toBe(0);
    streams.err();
  }, LIVE_TIMEOUT_MS);
});
