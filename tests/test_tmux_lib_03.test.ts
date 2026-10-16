import { describe, expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import type { RunResult } from "../tmux_lib_internal.ts";
import { LIVE_TIMEOUT_MS, wrapFakeRun, setStubRun, test, generateUniqueSuffix } from "./test_tmux_lib_helpers_a.ts";
import { liveSessionTest, createLiveSessionFixture } from "./test_tmux_lib_helpers_b.ts";
import { getCaptureStreams, installTestHooks } from "./test_tmux_lib_helpers_c.ts";

installTestHooks();

describe("live", (): void => {
  liveSessionTest("test_sendKeys_returnsZero_onLiveSession", (): void => {
    const live_tmux_session: string = createLiveSessionFixture();
    const marker: string = `marker-${process.pid}`;
    const rc: number = tmux_lib.tmux_sendKeys(live_tmux_session, marker);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  liveSessionTest("test_sendKeys_textVisible_inPaneCapture", (): void => {
    const live_tmux_session: string = createLiveSessionFixture();
    const marker: string = `marker-${process.pid}-visible`;
    expect(tmux_lib.tmux_sendKeys(live_tmux_session, marker)).toBe(0);
    tmux_lib.sleep(0.1);
    const captured: string = tmux_lib.tmux_capturePane(live_tmux_session);
    expect(captured).toContain(marker);
  }, LIVE_TIMEOUT_MS);

  liveSessionTest("test_sendCtrlC_returnsZero_onLiveSession", (): void => {
    const live_tmux_session: string = createLiveSessionFixture();
    tmux_lib.tmux_sendKeys(live_tmux_session, "junk-text");
    const rc: number = tmux_lib.tmux_sendCtrlC(live_tmux_session);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  liveSessionTest("test_sendEnter_returnsZero_onLiveSession", (): void => {
    const live_tmux_session: string = createLiveSessionFixture();
    const rc: number = tmux_lib.tmux_sendEnter(live_tmux_session);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  liveSessionTest("test_sendAndSubmit_returnsZero_onLiveSession", (): void => {
    const live_tmux_session: string = createLiveSessionFixture();
    const payload: string = `submit-${process.pid}`;
    const rc: number = tmux_lib.tmux_sendAndSubmit(live_tmux_session, `echo ${payload}`);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  liveSessionTest("test_sendAndSubmit_outputVisible_inPaneCapture", (): void => {
    const live_tmux_session: string = createLiveSessionFixture();
    const payload: string = `submit-${process.pid}-vis`;
    expect(tmux_lib.tmux_sendAndSubmit(live_tmux_session, `echo ${payload}`)).toBe(0);
    tmux_lib.sleep(0.3);
    const captured: string = tmux_lib.tmux_capturePane(live_tmux_session);
    expect(captured).toContain(payload);
  }, LIVE_TIMEOUT_MS);
});

test("test_sendKeys_returnsNonzero_onNonexistentTarget", (): void => {
  const bogus: string = `nonexistent-${generateUniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_sendKeys(bogus, "text");
  expect(rc).not.toBe(0);
});

test("test_sendEnter_returnsNonzero_onNonexistentTarget", (): void => {
  const bogus: string = `nonexistent-${generateUniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_sendEnter(bogus);
  expect(rc).not.toBe(0);
});

test("test_tmux_setOption_invokes_tmux_set_option_with_passed_args_and_returns_zero_on_success", (): void => {
  const captured: { cmd: string[] | undefined; options: object | undefined } = { cmd: undefined, options: undefined };
  spyOn(tmux_lib, "run").mockImplementation(wrapFakeRun((cmd: string[], options: object): RunResult => {
    captured.cmd = cmd;
    captured.options = options;
    return { returncode: 0, stdout: "ok-out\n", stderr: "" };
  }));
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  const rc: number = tmux_lib.tmux_setOption("-g", "status", "on");
  expect(rc).toBe(0);
  expect(captured.cmd).toEqual(["tmux", "set-option", "-g", "status", "on"]);
  expect((captured.options as { capture_output?: boolean }).capture_output).toBe(true);
  expect((captured.options as { text?: boolean }).text).toBe(true);
  expect(streams.out()).toContain("ok-out");
  expect(streams.err()).toBe("");
});

test("test_tmux_setOption_emits_no_output_when_tmux_succeeds_with_empty_stdout", (): void => {
  setStubRun(0, "", "");
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  const rc: number = tmux_lib.tmux_setOption("-g", "status", "on");
  expect(rc).toBe(0);
  expect(streams.out()).toBe("");
  expect(streams.err()).toBe("");
});

test("test_tmux_setOption_logs_caller_name_and_combined_output_to_stderr_when_tmux_fails", (): void => {
  setStubRun(1, "", "unknown option\n");
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  let rc: number | undefined;
  function caller_frame(): void {
    rc = tmux_lib.tmux_setOption("-g", "bogus", "value");
  }
  caller_frame();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err.startsWith("[caller_frame]")).toBe(true);
  expect(err).toContain("tmux set-option -g bogus value");
  expect(err).toContain("unknown option");
});

test("test_tmux_setOption_passes_variadic_args_through_to_tmux_in_order", (): void => {
  const seen: { cmd: string[] | undefined } = { cmd: undefined };
  spyOn(tmux_lib, "run").mockImplementation(wrapFakeRun((cmd: string[]): RunResult => {
    seen.cmd = cmd;
    return { returncode: 0, stdout: "", stderr: "" };
  }));
  tmux_lib.tmux_setOption("-gqu", "-t", "session:0", "mouse", "off");
  expect(seen.cmd).toEqual(["tmux", "set-option", "-gqu", "-t", "session:0", "mouse", "off"]);
});
