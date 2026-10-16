import { expect, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tmux_lib } from "../tmux_lib.ts";
import type { RunResult } from "../tmux_lib_internal.ts";
import { wrapFakeRun, buildIter, setStubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { addTeardown, getCaptureStreams, buildPyLambda, installTestHooks } from "./test_tmux_lib_helpers_c.ts";

installTestHooks();

const TRUST_NO: string = "Do you trust the files in this folder?\n❯ No, exit\n  Yes\nEsc to cancel";
const TRUST_YES: string = "Do you trust the files in this folder?\n❯ 1. Yes\n  2. No, exit";

function spyKeys(): string[] {
  const keys: string[] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation(buildPyLambda(2, 2, (pane: string, text: string): number => {
    keys.push(`${pane}:${text}`);
    return 0;
  }));
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(buildPyLambda(1, 1, (pane: string): number => {
    keys.push(`${pane}:Enter`);
    return 0;
  }));
  return keys;
}

test("test_tmux_answerDialog_sends_Down_when_trust_prompt_has_No_selected", (): void => {
  const keys: string[] = spyKeys();
  expect(tmux_lib.tmux_answerDialog("%3", TRUST_NO)).toBe(true);
  expect(keys).toEqual(["%3:Down"]);
});

test("test_tmux_answerDialog_sends_Enter_for_trust_prompt_with_Yes_selected", (): void => {
  const keys: string[] = spyKeys();
  expect(tmux_lib.tmux_answerDialog("%3", TRUST_YES)).toBe(true);
  expect(keys).toEqual(["%3:Enter"]);
});

test("test_tmux_answerDialog_sends_Enter_for_any_Esc_to_cancel_dialog", (): void => {
  const keys: string[] = spyKeys();
  expect(tmux_lib.tmux_answerDialog("%4", "Choose a theme\nEsc to cancel")).toBe(true);
  expect(keys).toEqual(["%4:Enter"]);
});

test("test_tmux_answerDialog_sends_nothing_for_a_normal_screen", (): void => {
  const keys: string[] = spyKeys();
  expect(tmux_lib.tmux_answerDialog("%3", "❯ hello")).toBe(false);
  expect(keys).toEqual([]);
});

test("test_tmux_waitForClaudeReadiness_answers_dialog_instead_of_treating_glyph_as_ready", (): void => {
  const keys: string[] = spyKeys();
  const sleeps: number[] = [];
  const seq: () => string = buildIter([TRUST_YES, "❯ ready"]);
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(buildPyLambda(1, 2, (_p: string, _l?: number): string => seq()));
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (s: number): void => {
    sleeps.push(s);
  }));
  expect(tmux_lib.tmux_waitForClaudeReadiness("%3")).toBe(0);
  expect(keys).toEqual(["%3:Enter"]);
  expect(sleeps).toEqual([2]);
});

test("test_tmux_waitForClaudeReadiness_throws_on_login_screens", (): void => {
  spyKeys();
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (_s: number): void => {}));
  for (const screen of ["Please run /login", "Select login method:"]) {
    spyOn(tmux_lib, "tmux_capturePane").mockImplementation(buildPyLambda(1, 2, (_p: string, _l?: number): string => screen));
    expect((): number => tmux_lib.tmux_waitForClaudeReadiness("%3")).toThrow(/signed out.*%3/);
  }
});

test("test_tmux_waitForClaudeReadiness_uses_given_poll_count_interval_and_dialog_wait", (): void => {
  spyKeys();
  const sleeps: number[] = [];
  const seq: () => string = buildIter(["boot", "Esc to cancel", "boot"]);
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(buildPyLambda(1, 2, (_p: string, _l?: number): string => seq()));
  spyOn(tmux_lib, "sleep").mockImplementation(buildPyLambda(1, 1, (s: number): void => {
    sleeps.push(s);
  }));
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  expect(tmux_lib.tmux_waitForClaudeReadiness("%3", 3, 0.25, 7)).toBe(1);
  expect(sleeps).toEqual([0.25, 7, 0.25]);
  expect(streams.err()).toContain("timed out");
});

test("test_tmux_killOtherPanes_kills_every_pane_but_the_target", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib.tmux_killOtherPanes("%3")).toBe(0);
  expect(calls).toEqual([["tmux", "kill-pane", "-a", "-t", "%3"]]);
});

test("test_tmux_killOtherPanes_logs_failure_with_caller_name", (): void => {
  setStubRun(1, "", "no pane");
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  function named_cleanup_caller(): number {
    const rc: number = tmux_lib.tmux_killOtherPanes("%3");
    return rc;
  }
  expect(named_cleanup_caller()).toBe(1);
  expect(streams.err()).toStartWith("[named_cleanup_caller] command 'tmux kill-pane -a -t %3' failed: no pane");
});

test("test_tmux_paneExists_is_true_when_tmux_finds_the_pane", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib.tmux_paneExists("%3")).toBe(true);
  expect(calls).toEqual([["tmux", "has-session", "-t", "%3"]]);
});

test("test_tmux_paneExists_is_false_when_the_pane_is_gone", (): void => {
  setStubRun(1);
  expect(tmux_lib.tmux_paneExists("%3")).toBe(false);
});

test("test_tmux_newAttachedSession_runs_new_session_with_inherited_terminal", (): void => {
  const seen: Array<[string[], object]> = [];
  spyOn(tmux_lib, "run").mockImplementation(wrapFakeRun((argv: string[], options: object): RunResult => {
    seen.push([argv, options]);
    return { returncode: 0, stdout: "", stderr: "" };
  }));
  expect(tmux_lib.tmux_newAttachedSession("s1", "-x", "200", "-y", "60", "python3 t.py")).toBe(0);
  expect(seen).toEqual([[["tmux", "new-session", "-s", "s1", "-x", "200", "-y", "60", "python3 t.py"], { check: false }]]);
});

test("test_tmux_newAttachedSession_returns_failure_code_and_logs", (): void => {
  setStubRun(1);
  const streams: { out: () => string; err: () => string } = getCaptureStreams();
  expect(tmux_lib.tmux_newAttachedSession("s1")).toBe(1);
  expect(streams.err()).toContain("command 'tmux new-session -s s1' failed");
});

test("test_tmux_capturePaneToFile_writes_the_pane_text_to_the_path", (): void => {
  const dir: string = mkdtempSync(join(tmpdir(), "capture-"));
  addTeardown((): void => rmSync(dir, { recursive: true }));
  const panes: string[] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(buildPyLambda(1, 2, (pane: string, _l?: number): string => {
    panes.push(pane);
    return "line one\n❯ two\n";
  }));
  tmux_lib.tmux_capturePaneToFile("%3", join(dir, "pane-%3.txt"));
  expect(readFileSync(join(dir, "pane-%3.txt"), "utf8")).toBe("line one\n❯ two\n");
  expect(panes).toEqual(["%3"]);
});
