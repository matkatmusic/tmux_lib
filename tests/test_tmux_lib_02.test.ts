import { expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { makeIter, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, pyLambda, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("test_tmux_sendAndSubmit_sleeps_between_sendKeys_and_sendEnter", (): void => {
  const events: (string | [string, number])[] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation(pyLambda(2, 2, (_p: string, _t: string): number => {
    events.push("sendKeys");
    return 0;
  }));
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(pyLambda(1, 1, (_p: string): number => {
    events.push("sendEnter");
    return 0;
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (s: number): void => {
    events.push(["sleep", s]);
  }));
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation(pyLambda(1, 1, (_p: string): boolean => false));
  tmux_lib.tmux_sendAndSubmit("p", "x");
  expect(events).toEqual(["sendKeys", ["sleep", 0.5], "sendEnter", ["sleep", 1.0]]);
});

test("test_tmux_inputBoxHoldsText_true_when_prompt_line_has_content", (): void => {
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(
    pyLambda(1, 2, (_p: string, _s?: number): string => "some output\n❯ Write a file called parser.py\n───\n"),
  );
  expect(tmux_lib.tmux_inputBoxHoldsText("p")).toBe(true);
});

test("test_tmux_inputBoxHoldsText_false_when_prompt_line_empty", (): void => {
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(
    pyLambda(1, 2, (_p: string, _s?: number): string => "✳ Percolating…\n❯ \n───\n"),
  );
  expect(tmux_lib.tmux_inputBoxHoldsText("p")).toBe(false);
});

test("test_tmux_sendAndSubmit_resends_enter_while_input_box_holds_text", (): void => {
  const enter_calls: string[] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation(pyLambda(2, 2, (_p: string, _t: string): number => 0));
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(pyLambda(1, 1, (p: string): number => {
    enter_calls.push(p);
    return 0;
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  const holds: () => boolean = makeIter([true, true, false]);
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation(pyLambda(1, 1, (_p: string): boolean => holds()));
  const rc: number = tmux_lib.tmux_sendAndSubmit("p", "x");
  expect(rc).toBe(0);
  expect(enter_calls).toEqual(["p", "p", "p"]);
});

test("test_tmux_cancelAndSend_stops_retrying_once_marker_seen", (): void => {
  const cap_iter: () => string = makeIter(["nothing yet", "interrupted by Ctrl-C now"]);
  const ctrlc_calls: string[] = [];
  const submit_calls: string[][] = [];
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation(pyLambda(1, 1, (p: string): number => {
    ctrlc_calls.push(p);
    return 0;
  }));
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_p: string, _s?: number): string => cap_iter()));
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation(pyLambda(2, 2, (p: string, t: string): number => {
    submit_calls.push([p, t]);
    return 0;
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  const rc: number = tmux_lib.tmux_cancelAndSend("pane0", "echo replaced", "work-1");
  expect(rc).toBe(0);
  expect(ctrlc_calls).toEqual(["pane0", "pane0"]);
  expect(submit_calls).toEqual([["pane0", "echo replaced"]]);
});

test("test_tmux_cancelAndSend_caps_at_five_attempts_and_still_submits", (): void => {
  const ctrlc_calls: string[] = [];
  const submit_calls: string[][] = [];
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation(pyLambda(1, 1, (p: string): number => {
    ctrlc_calls.push(p);
    return 0;
  }));
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_p: string, _s?: number): string => "busy"));
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation(pyLambda(2, 2, (p: string, t: string): number => {
    submit_calls.push([p, t]);
    return 0;
  }));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  const rc: number = tmux_lib.tmux_cancelAndSend("p", "cmd");
  expect(rc).toBe(0);
  expect(ctrlc_calls.length).toBe(5);
  expect(submit_calls).toEqual([["p", "cmd"]]);
});

test("test_tmux_cancelAndSend_returns_rc_from_final_send", (): void => {
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation(pyLambda(1, 1, (_p: string): number => 0));
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_p: string, _s?: number): string => "Ctrl-C"));
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation(pyLambda(2, 2, (_p: string, _t: string): number => 2));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  expect(tmux_lib.tmux_cancelAndSend("p", "x")).toBe(2);
});

test("test_tmux_cancelAndSend_logs_label_when_retry_needed", (): void => {
  const cap_iter: () => string = makeIter(["", "Ctrl-C"]);
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation(pyLambda(1, 1, (_p: string): number => 0));
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_p: string, _s?: number): string => cap_iter()));
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation(pyLambda(2, 2, (_p: string, _t: string): number => 0));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.tmux_cancelAndSend("p", "x", "work-99");
  const out: string = streams.out();
  expect(out).toContain("work-99");
  expect(out).toContain("Ctrl-C");
});

test("test_tmux_cancelAndSend_omits_log_when_first_attempt_succeeds", (): void => {
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation(pyLambda(1, 1, (_p: string): number => 0));
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (_p: string, _s?: number): string => "Ctrl-C done"));
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation(pyLambda(2, 2, (_p: string, _t: string): number => 0));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (_s: number): void => {}));
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.tmux_cancelAndSend("p", "x", "work-42");
  const out: string = streams.out();
  expect(out).not.toContain("work-42");
});
