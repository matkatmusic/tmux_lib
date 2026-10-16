import { describe, expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { LIVE_TIMEOUT_MS, test } from "./test_tmux_lib_helpers_a.ts";
import { createSessionNameFixture, isTmuxSessionPresent, isTmuxPaneTitled, createSessionCleanFixture, createSessionPanesFixture, getTmuxOption, isTmuxWindowPresent } from "./test_tmux_lib_helpers_b.ts";
import { getCaptureStreams, installTestHooks } from "./test_tmux_lib_helpers_c.ts";

installTestHooks();

test("test_tmux_ensureSession_creates_session_when_absent", (): void => {
  const has_session = spyOn(tmux_lib, "tmux_hasSession").mockImplementation((): number => 1);
  const new_session = spyOn(tmux_lib, "tmux_newSession").mockImplementation((): number => 0);
  const set_option = spyOn(tmux_lib, "tmux_setOptionForTarget").mockImplementation((): number => 0);
  const set_title = spyOn(tmux_lib, "tmux_setPaneTitle").mockImplementation((): number => 0);
  const window_exists = spyOn(tmux_lib, "tmux_windowExists").mockImplementation((): number => 0);
  const new_window = spyOn(tmux_lib, "tmux_newWindow").mockImplementation((): number => 0);
  const ensure_keepalive = spyOn(tmux_lib, "tmux_ensureKeepalivePane").mockImplementation((): void => {});
  const rc: number = tmux_lib.tmux_ensureSession("sess", "win", "/tmp", "sleep 9999", "KA");
  expect(rc).toBe(0);
  expect(has_session.mock.calls).toEqual([["sess"]]);
  expect(new_session.mock.calls).toEqual([["sess", "-n", "win", "-c", "/tmp", "sleep 9999"]]);
  expect(window_exists).not.toHaveBeenCalled();
  expect(new_window).not.toHaveBeenCalled();
  expect(ensure_keepalive).not.toHaveBeenCalled();
  expect(set_option.mock.calls).toEqual([
    ["sess", "remain-on-exit", "off"],
    ["sess", "mouse", "on"],
    ["sess", "pane-border-status", "top"],
    ["sess", "pane-border-format", " #{pane_title} "],
  ]);
  expect(set_title.mock.calls).toEqual([["sess:win.0", "KA"]]);
});

test("test_tmux_ensureSession_creates_window_when_session_exists_but_window_absent", (): void => {
  spyOn(tmux_lib, "tmux_hasSession").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_windowExists").mockImplementation((): number => 1);
  const new_session = spyOn(tmux_lib, "tmux_newSession").mockImplementation((): number => 0);
  const set_option = spyOn(tmux_lib, "tmux_setOptionForTarget").mockImplementation((): number => 0);
  const new_window = spyOn(tmux_lib, "tmux_newWindow").mockImplementation((): number => 0);
  const set_title = spyOn(tmux_lib, "tmux_setPaneTitle").mockImplementation((): number => 0);
  const ensure_keepalive = spyOn(tmux_lib, "tmux_ensureKeepalivePane").mockImplementation((): void => {});
  const rc: number = tmux_lib.tmux_ensureSession("sess", "win", "/work", "sleep 1", "KA2");
  expect(rc).toBe(0);
  expect(new_session).not.toHaveBeenCalled();
  expect(set_option).not.toHaveBeenCalled();
  expect(ensure_keepalive).not.toHaveBeenCalled();
  expect(new_window.mock.calls).toEqual([["sess", "win", "-c", "/work", "sleep 1"]]);
  expect(set_title.mock.calls).toEqual([["sess:win.0", "KA2"]]);
});

test("test_tmux_ensureSession_delegates_to_keepalive_pane_when_both_exist", (): void => {
  spyOn(tmux_lib, "tmux_hasSession").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_windowExists").mockImplementation((): number => 0);
  const new_session = spyOn(tmux_lib, "tmux_newSession").mockImplementation((): number => 0);
  const new_window = spyOn(tmux_lib, "tmux_newWindow").mockImplementation((): number => 0);
  const set_option = spyOn(tmux_lib, "tmux_setOptionForTarget").mockImplementation((): number => 0);
  const set_title = spyOn(tmux_lib, "tmux_setPaneTitle").mockImplementation((): number => 0);
  const ensure_keepalive = spyOn(tmux_lib, "tmux_ensureKeepalivePane").mockImplementation((): void => {});
  const rc: number = tmux_lib.tmux_ensureSession("sess", "win", "/d", "sleep 2", "KA3");
  expect(rc).toBe(0);
  expect(new_session).not.toHaveBeenCalled();
  expect(new_window).not.toHaveBeenCalled();
  expect(set_option).not.toHaveBeenCalled();
  expect(set_title).not.toHaveBeenCalled();
  expect(ensure_keepalive.mock.calls).toEqual([["sess:win", "/d", "sleep 2", "KA3"]]);
});

describe("live", (): void => {
  test("test_newSession_createsSession", (): void => {
    const session_name: string = createSessionNameFixture();
    const rc: number = tmux_lib.tmux_newSession(session_name);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_newSession_rejectsDuplicate", (): void => {
    const session_name: string = createSessionNameFixture();
    expect(tmux_lib.tmux_newSession(session_name)).toBe(0);
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const rc: number = tmux_lib.tmux_newSession(session_name);
    expect(rc).not.toBe(0);
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_newPane_addsPaneToSession", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    const rc: number = tmux_lib.tmux_newPane(tmux_session_panes);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_newPane_failsOnNonexistentSession", (): void => {
    const streams: { out: () => string; err: () => string } = getCaptureStreams();
    const bogus: string = `nonexistent-${process.pid}`;
    const rc: number = tmux_lib.tmux_newPane(bogus);
    expect(rc).not.toBe(0);
    streams.err();
  }, LIVE_TIMEOUT_MS);

  test("test_ensure_session_creates_new_session", (): void => {
    const tmux_session_clean: string = createSessionCleanFixture();
    tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
    expect(isTmuxSessionPresent(tmux_session_clean)).toBe(true);
  }, LIVE_TIMEOUT_MS);

  test("test_ensure_session_sets_keepalive_pane_title", (): void => {
    const tmux_session_clean: string = createSessionCleanFixture();
    tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
    expect(isTmuxPaneTitled(`${tmux_session_clean}:main`, "keepalive")).toBe(true);
  }, LIVE_TIMEOUT_MS);

  test("test_ensure_session_applies_pane_border_status_top", (): void => {
    const tmux_session_clean: string = createSessionCleanFixture();
    tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
    const border: string = getTmuxOption(tmux_session_clean, "pane-border-status");
    expect(border).toBe("top");
  }, LIVE_TIMEOUT_MS);

  test("test_split_worker_pane_returns_pane_id", (): void => {
    const tmux_session_clean: string = createSessionCleanFixture();
    tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
    const worker: string | undefined = tmux_lib.tmux_splitWorkerPane(`${tmux_session_clean}:main`, "/tmp", "sleep 30");
    expect(worker).toBeTruthy();
    expect(String(worker).startsWith("%")).toBe(true);
  }, LIVE_TIMEOUT_MS);

  test("test_ensure_session_idempotent_on_existing_session", (): void => {
    const tmux_session_clean: string = createSessionCleanFixture();
    tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
    tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
    expect(isTmuxSessionPresent(tmux_session_clean)).toBe(true);
  }, LIVE_TIMEOUT_MS);

  test("test_ensure_session_adds_new_window_to_existing_session", (): void => {
    const tmux_session_clean: string = createSessionCleanFixture();
    tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
    const second: string = `secondwin-${process.pid}`;
    tmux_lib.tmux_ensureSession(tmux_session_clean, second, "/tmp", "sleep 30", "keepalive-2");
    expect(isTmuxWindowPresent(tmux_session_clean, second)).toBe(true);
  }, LIVE_TIMEOUT_MS);
});
