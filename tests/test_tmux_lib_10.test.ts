import { expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { READY_GLYPH, fakeRun, makeIter, stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, pyLambda, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_waitForClaudeReadiness_returns_zero_when_glyph_present_immediately", (): void => {
  const sleep_calls: number[] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(
    pyLambda(1, 2, (_pid: string, _lines?: number): string => `banner\n${READY_GLYPH} ready\n`),
  );
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (s: number): void => {
    sleep_calls.push(s);
  }));
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%42", 1);
  expect(rc).toBe(0);
  expect(sleep_calls).toEqual([]);
});

test("test_tmux_waitForClaudeReadiness_returns_one_on_timeout_and_logs_stderr", (): void => {
  const sleep_calls: number[] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_pid: string, _lines?: number): string => "still loading"));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (s: number): void => {
    sleep_calls.push(s);
  }));
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%7", 2);
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(sleep_calls).toEqual([1, 1]);
  expect(err).toContain("tmux_waitForClaudeReadiness");
  expect(err).toContain("timed out");
  expect(err).toContain("%7");
});

test("test_tmux_waitForClaudeReadiness_polls_until_ready", (): void => {
  const seq: () => string = makeIter(["boot", "starting", `${READY_GLYPH}`]);
  const sleep_count: { n: number } = { n: 0 };
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_pid: string, _lines?: number): string => seq()));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {
    sleep_count.n += 1;
  }));
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%1", 5);
  expect(rc).toBe(0);
  expect(sleep_count.n).toBe(2);
});

test("test_tmux_waitForClaudeReadiness_lets_capture_errors_throw", (): void => {
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_pid: string, _lines?: number): string => {
    throw new Error("transient");
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  expect((): number => tmux_lib.tmux_waitForClaudeReadiness("%9", 2)).toThrow("transient");
});

test("test_tmux_waitForClaudeReadiness_default_poll_count_is_120", (): void => {
  const attempts: { n: number } = { n: 0 };
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_pid: string, _lines?: number): string => {
    attempts.n += 1;
    return "";
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%2");
  expect(rc).toBe(1);
  expect(attempts.n).toBe(120);
  streams.err();
});

test("test_tmux_waitForClaudeReadiness_captures_the_visible_screen_of_the_pane", (): void => {
  const seen: [string, number | undefined][] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (pid: string, lines: number | undefined = undefined): string => {
    seen.push([pid, lines]);
    return READY_GLYPH;
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  tmux_lib.tmux_waitForClaudeReadiness("%55", 1);
  expect(seen).toEqual([["%55", undefined]]);
});

test("test_tmux_requireVersion_returns_1_and_logs_when_tmux_binary_is_missing", (): void => {
  spyOn(tmux_lib, "run").mockImplementation(fakeRun((): RunResult => {
    throw new tmux_lib_internal.FileNotFoundError("tmux");
  }));
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_requireVersion("3.0");
  expect(rc).toBe(1);
  expect(streams.err()).toContain("not installed");
});

test("test_tmux_requireVersion_returns_0_when_installed_version_exactly_matches_required", (): void => {
  stubRun(0, "tmux 3.2\n");
  expect(tmux_lib.tmux_requireVersion("3.2")).toBe(0);
});

test("test_tmux_requireVersion_returns_0_when_installed_version_exceeds_required", (): void => {
  stubRun(0, "tmux 3.4a\n");
  expect(tmux_lib.tmux_requireVersion("3.2")).toBe(0);
});

test("test_tmux_requireVersion_returns_1_and_logs_when_installed_version_is_below_required", (): void => {
  stubRun(0, "tmux 2.9\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_requireVersion("3.2");
  expect(rc).toBe(1);
  expect(streams.err()).toContain("required");
});

test("test_tmux_requireVersion_returns_1_when_tmux_version_output_is_unparseable", (): void => {
  stubRun(0, "garbage\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_requireVersion("3.0");
  expect(rc).toBe(1);
  expect(streams.err()).toContain("not installed");
});
