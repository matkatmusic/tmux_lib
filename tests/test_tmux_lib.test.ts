import { afterEach, expect, mock, spyOn, test as bunTest } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";

const tmuxInstalled: boolean = Bun.which("tmux") !== null;
const test: typeof bunTest = (tmuxInstalled ? bunTest : bunTest.skip) as typeof bunTest;

const LIVE_TIMEOUT_MS: number = 60000;
const READY_GLYPH: string = "❯";

// Fakes the tmux_lib.run seam: records each argv in `calls` and returns the canned result.
function makeFakeRun(
  rc: number,
  stdout: string = "",
  stderr: string = "",
  calls: string[][] | undefined = undefined,
): (argv: string[]) => RunResult {
  return (argv: string[]): RunResult => {
    if (calls !== undefined) {
      calls.push(argv);
    }
    return { returncode: rc, stdout: stdout, stderr: stderr };
  };
}

function stubRun(rc: number, stdout: string = "", stderr: string = "", calls: string[][] | undefined = undefined): void {
  spyOn(tmux_lib, "run").mockImplementation(makeFakeRun(rc, stdout, stderr, calls));
}

// Stands in for pytest capsys/capfd: collects everything written through the stdout/stderr seams.
function captureStreams(): { out: () => string; err: () => string } {
  let out: string = "";
  let err: string = "";
  spyOn(tmux_lib, "stdoutWrite").mockImplementation((text: string): void => {
    out += text;
  });
  spyOn(tmux_lib, "stderrWrite").mockImplementation((text: string): void => {
    err += text;
  });
  return { out: (): string => out, err: (): string => err };
}

// Stands in for Python iter()/next(): throws when exhausted (StopIteration).
function makeIter<T>(items: T[]): () => T {
  let index: number = 0;
  return (): T => {
    if (index >= items.length) {
      throw new Error("StopIteration");
    }
    const item: T = items[index]!;
    index += 1;
    return item;
  };
}

// Runs the real tmux binary directly, bypassing every tmux_lib seam.
function realTmux(...args: string[]): RunResult {
  const proc: Bun.SyncSubprocess<"pipe", "pipe"> = Bun.spawnSync(["tmux", ...args], { stdout: "pipe", stderr: "pipe" });
  return { returncode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function killRealSession(name: string): void {
  realTmux("kill-session", "-t", name);
}

const sessionsToKill: string[] = [];

afterEach((): void => {
  mock.restore();
  tmux_lib.externalCaller = "<unknown>";
  for (const name of sessionsToKill) {
    killRealSession(name);
  }
  sessionsToKill.length = 0;
});

function uniqueSuffix(): string {
  return `${process.pid}-${process.hrtime.bigint()}`;
}

// Fixture session_name: unique name, stale session cleared, killed again in afterEach.
function sessionNameFixture(): string {
  const name: string = `tmux-py-session-test-${process.pid}`;
  killRealSession(name);
  sessionsToKill.push(name);
  return name;
}

// Fixture tmux_session_panes: a real detached session.
function tmuxSessionPanesFixture(): string {
  const name: string = `tmux-py-pane-test-${process.pid}`;
  killRealSession(name);
  sessionsToKill.push(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  expect(rc, "fixture precondition: new session must succeed").toBe(0);
  return name;
}

function firstPaneId(session: string): string {
  const rows: string[] = tmux_lib.tmux_listPanes(session, "-F", "#{pane_id}");
  return rows.length > 0 ? rows[0]! : "";
}

// Fixture tmux_session_opts: a real detached session for option tests.
function tmuxSessionOptsFixture(): string {
  const name: string = `tmux-py-opt-test-${process.pid}`;
  killRealSession(name);
  sessionsToKill.push(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  expect(rc, "fixture failed to create tmux session").toBe(0);
  return name;
}

// Fixture layout_session: a real detached session with 3 panes.
function layoutSessionFixture(): string {
  const name: string = `tmux-py-lay-test-${process.pid}`;
  sessionsToKill.push(name);
  tmux_lib.tmux_newSession(name);
  tmux_lib.tmux_newPane(name);
  tmux_lib.tmux_newPane(name);
  return name;
}

function tmuxHasSession(name: string): boolean {
  return realTmux("has-session", "-t", name).returncode === 0;
}

function tmuxWindowExists(session: string, window: string): boolean {
  const r: RunResult = realTmux("list-windows", "-t", session, "-F", "#{window_name}");
  if (r.returncode !== 0) {
    return false;
  }
  return tmux_lib_internal.splitlines(r.stdout).includes(window);
}

function tmuxPaneHasTitle(target: string, title: string): boolean {
  const r: RunResult = realTmux("display-message", "-p", "-t", target, "#{pane_title}");
  return r.returncode === 0 && r.stdout.trim() === title;
}

function tmuxShowOption(target: string, opt: string): string {
  const r: RunResult = realTmux("show-options", "-t", target, "-v", opt);
  return r.returncode === 0 ? r.stdout.trim() : "";
}

// Fixture tmux_session_clean: unique session name, cleaned before and after.
function tmuxSessionCleanFixture(): string {
  const name: string = `tmux-sh-launcher-test-${process.pid}`;
  killRealSession(name);
  sessionsToKill.push(name);
  return name;
}

// Fixture live_tmux_session: unique detached session, killed in afterEach.
function liveTmuxSessionFixture(): string {
  const session: string = `tmux-sh-send-test-${uniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_newSession(session);
  if (rc !== 0) {
    throw new Error("tmux_newSession failed; tmux likely unavailable");
  }
  sessionsToKill.push(session);
  return session;
}

test("test_tmux_sendKeys_invokes_tmux_send_keys_with_dash_t_target_then_text", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_sendKeys("session:0.1", "ls");
  expect(calls).toEqual([["tmux", "send-keys", "-t", "session:0.1", "ls"]]);
});

test("test_tmux_sendKeys_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_sendKeys("sess:0", "echo hi")).toBe(0);
});

test("test_tmux_sendKeys_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  stubRun(1, "", "can't find pane: nope");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "test_tmux_sendKeys_returns_nonzero_and_logs_caller_when_target_missing";
  const rc: number = tmux_lib.tmux_sendKeys("nope", "ls");
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_sendKeys_returns_nonzero_and_logs_caller_when_target_missing");
  expect(err).toContain("can't find pane: nope");
});

test("test_tmux_sendKeys_passes_text_with_special_chars_unchanged", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  const payload: string = "hello world; echo 'hi'";
  tmux_lib.tmux_sendKeys("s:0.0", payload);
  expect(calls[0]![4]).toBe(payload);
  expect(calls).toEqual([["tmux", "send-keys", "-t", "s:0.0", payload]]);
});

test("test_tmux_sendEnter_invokes_tmux_send_keys_with_dash_t_target_and_literal_Enter_token", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_sendEnter("session:0.1");
  expect(calls).toEqual([["tmux", "send-keys", "-t", "session:0.1", "Enter"]]);
});

test("test_tmux_sendEnter_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_sendEnter("session:0.0")).toBe(0);
});

test("test_tmux_sendEnter_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "outer_caller";
  const outer_caller = (): number => tmux_lib.tmux_sendEnter("nope:9.9");
  const rc: number = outer_caller();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("[outer_caller]");
  expect(err).toContain("tmux send-keys -t nope:9.9 Enter");
  expect(err).toContain("can't find pane");
});

test("test_tmux_sendCtrlC_invokes_tmux_send_keys_with_dash_t_target_and_literal_C_dash_c_token", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_sendCtrlC("mySession:0.1");
  expect(calls).toEqual([["tmux", "send-keys", "-t", "mySession:0.1", "C-c"]]);
});

test("test_tmux_sendCtrlC_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_sendCtrlC("any:0")).toBe(0);
});

test("test_tmux_sendCtrlC_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  stubRun(1, "", "can't find pane: ghost");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "caller_frame_under_test";
  const caller_frame_under_test = (): number => tmux_lib.tmux_sendCtrlC("ghost:0");
  const rc: number = caller_frame_under_test();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("caller_frame_under_test");
  expect(err).toContain("tmux send-keys -t ghost:0 C-c");
  expect(err).toContain("can't find pane: ghost");
});

test("test_tmux_sendAndSubmit_calls_sendKeys_then_sendEnter_with_same_target", (): void => {
  const calls: string[][] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation((p: string, t: string): number => {
    calls.push(["sendKeys", p, t]);
    return 0;
  });
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation((p: string): number => {
    calls.push(["sendEnter", p]);
    return 0;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation((): boolean => false);
  tmux_lib.tmux_sendAndSubmit("sess:0.1", "hello");
  expect(calls).toEqual([["sendKeys", "sess:0.1", "hello"], ["sendEnter", "sess:0.1"]]);
});

test("test_tmux_sendAndSubmit_returns_zero_when_both_sends_succeed", (): void => {
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation((): number => 0);
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation((): boolean => false);
  expect(tmux_lib.tmux_sendAndSubmit("p", "x")).toBe(0);
});

test("test_tmux_sendAndSubmit_short_circuits_when_sendKeys_fails", (): void => {
  const enter_calls: string[] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation((): number => 7);
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation((p: string): number => {
    enter_calls.push(p);
    return 0;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  const rc: number = tmux_lib.tmux_sendAndSubmit("p", "x");
  expect(rc).toBe(7);
  expect(enter_calls).toEqual([]);
});

test("test_tmux_sendAndSubmit_returns_sendEnter_rc_when_only_sendEnter_fails", (): void => {
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation((): number => 3);
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation((): boolean => false);
  expect(tmux_lib.tmux_sendAndSubmit("p", "x")).toBe(3);
});

test("test_tmux_sendAndSubmit_sleeps_between_sendKeys_and_sendEnter", (): void => {
  const events: (string | [string, number])[] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation((): number => {
    events.push("sendKeys");
    return 0;
  });
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation((): number => {
    events.push("sendEnter");
    return 0;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((s: number): void => {
    events.push(["sleep", s]);
  });
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation((): boolean => false);
  tmux_lib.tmux_sendAndSubmit("p", "x");
  expect(events).toEqual(["sendKeys", ["sleep", 0.5], "sendEnter", ["sleep", 1.0]]);
});

test("test_tmux_inputBoxHoldsText_true_when_prompt_line_has_content", (): void => {
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(
    (): string => "some output\n❯ Write a file called parser.py\n───\n",
  );
  expect(tmux_lib.tmux_inputBoxHoldsText("p")).toBe(true);
});

test("test_tmux_inputBoxHoldsText_false_when_prompt_line_empty", (): void => {
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => "✳ Percolating…\n❯ \n───\n");
  expect(tmux_lib.tmux_inputBoxHoldsText("p")).toBe(false);
});

test("test_tmux_sendAndSubmit_resends_enter_while_input_box_holds_text", (): void => {
  const enter_calls: string[] = [];
  spyOn(tmux_lib, "tmux_sendKeys").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation((p: string): number => {
    enter_calls.push(p);
    return 0;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  const holds: () => boolean = makeIter([true, true, false]);
  spyOn(tmux_lib, "tmux_inputBoxHoldsText").mockImplementation((): boolean => holds());
  const rc: number = tmux_lib.tmux_sendAndSubmit("p", "x");
  expect(rc).toBe(0);
  expect(enter_calls).toEqual(["p", "p", "p"]);
});

test("test_tmux_cancelAndSend_stops_retrying_once_marker_seen", (): void => {
  const cap_iter: () => string = makeIter(["nothing yet", "interrupted by Ctrl-C now"]);
  const ctrlc_calls: string[] = [];
  const submit_calls: string[][] = [];
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation((p: string): number => {
    ctrlc_calls.push(p);
    return 0;
  });
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => cap_iter());
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation((p: string, t: string): number => {
    submit_calls.push([p, t]);
    return 0;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  const rc: number = tmux_lib.tmux_cancelAndSend("pane0", "echo replaced", "work-1");
  expect(rc).toBe(0);
  expect(ctrlc_calls).toEqual(["pane0", "pane0"]);
  expect(submit_calls).toEqual([["pane0", "echo replaced"]]);
});

test("test_tmux_cancelAndSend_caps_at_five_attempts_and_still_submits", (): void => {
  const ctrlc_calls: string[] = [];
  const submit_calls: string[][] = [];
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation((p: string): number => {
    ctrlc_calls.push(p);
    return 0;
  });
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => "busy");
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation((p: string, t: string): number => {
    submit_calls.push([p, t]);
    return 0;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  const rc: number = tmux_lib.tmux_cancelAndSend("p", "cmd");
  expect(rc).toBe(0);
  expect(ctrlc_calls.length).toBe(5);
  expect(submit_calls).toEqual([["p", "cmd"]]);
});

test("test_tmux_cancelAndSend_returns_rc_from_final_send", (): void => {
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => "Ctrl-C");
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation((): number => 2);
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  expect(tmux_lib.tmux_cancelAndSend("p", "x")).toBe(2);
});

test("test_tmux_cancelAndSend_logs_label_when_retry_needed", (): void => {
  const cap_iter: () => string = makeIter(["", "Ctrl-C"]);
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => cap_iter());
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation((): number => 0);
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.tmux_cancelAndSend("p", "x", "work-99");
  const out: string = streams.out();
  expect(out).toContain("work-99");
  expect(out).toContain("Ctrl-C");
});

test("test_tmux_cancelAndSend_omits_log_when_first_attempt_succeeds", (): void => {
  spyOn(tmux_lib, "tmux_sendCtrlC").mockImplementation((): number => 0);
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => "Ctrl-C done");
  spyOn(tmux_lib, "tmux_sendAndSubmit").mockImplementation((): number => 0);
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.tmux_cancelAndSend("p", "x", "work-42");
  const out: string = streams.out();
  expect(out).not.toContain("work-42");
});

test("test_sendKeys_returnsZero_onLiveSession", (): void => {
  const live_tmux_session: string = liveTmuxSessionFixture();
  const marker: string = `marker-${process.pid}`;
  const rc: number = tmux_lib.tmux_sendKeys(live_tmux_session, marker);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_sendKeys_textVisible_inPaneCapture", (): void => {
  const live_tmux_session: string = liveTmuxSessionFixture();
  const marker: string = `marker-${process.pid}-visible`;
  expect(tmux_lib.tmux_sendKeys(live_tmux_session, marker)).toBe(0);
  tmux_lib.sleep(0.1);
  const captured: string = tmux_lib.tmux_capturePane(live_tmux_session);
  expect(captured).toContain(marker);
}, LIVE_TIMEOUT_MS);

test("test_sendCtrlC_returnsZero_onLiveSession", (): void => {
  const live_tmux_session: string = liveTmuxSessionFixture();
  tmux_lib.tmux_sendKeys(live_tmux_session, "junk-text");
  const rc: number = tmux_lib.tmux_sendCtrlC(live_tmux_session);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_sendEnter_returnsZero_onLiveSession", (): void => {
  const live_tmux_session: string = liveTmuxSessionFixture();
  const rc: number = tmux_lib.tmux_sendEnter(live_tmux_session);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_sendAndSubmit_returnsZero_onLiveSession", (): void => {
  const live_tmux_session: string = liveTmuxSessionFixture();
  const payload: string = `submit-${process.pid}`;
  const rc: number = tmux_lib.tmux_sendAndSubmit(live_tmux_session, `echo ${payload}`);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_sendAndSubmit_outputVisible_inPaneCapture", (): void => {
  const live_tmux_session: string = liveTmuxSessionFixture();
  const payload: string = `submit-${process.pid}-vis`;
  expect(tmux_lib.tmux_sendAndSubmit(live_tmux_session, `echo ${payload}`)).toBe(0);
  tmux_lib.sleep(0.3);
  const captured: string = tmux_lib.tmux_capturePane(live_tmux_session);
  expect(captured).toContain(payload);
}, LIVE_TIMEOUT_MS);

test("test_sendKeys_returnsNonzero_onNonexistentTarget", (): void => {
  const bogus: string = `nonexistent-${uniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_sendKeys(bogus, "text");
  expect(rc).not.toBe(0);
});

test("test_sendEnter_returnsNonzero_onNonexistentTarget", (): void => {
  const bogus: string = `nonexistent-${uniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_sendEnter(bogus);
  expect(rc).not.toBe(0);
});

test("test_tmux_setOption_invokes_tmux_set_option_with_passed_args_and_returns_zero_on_success", (): void => {
  const captured: { cmd: string[] | undefined } = { cmd: undefined };
  spyOn(tmux_lib, "run").mockImplementation((cmd: string[]): RunResult => {
    captured.cmd = cmd;
    return { returncode: 0, stdout: "ok-out\n", stderr: "" };
  });
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_setOption("-g", "status", "on");
  expect(rc).toBe(0);
  expect(captured.cmd).toEqual(["tmux", "set-option", "-g", "status", "on"]);
  expect(streams.out()).toContain("ok-out");
  expect(streams.err()).toBe("");
});

test("test_tmux_setOption_emits_no_output_when_tmux_succeeds_with_empty_stdout", (): void => {
  stubRun(0, "", "");
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_setOption("-g", "status", "on");
  expect(rc).toBe(0);
  expect(streams.out()).toBe("");
  expect(streams.err()).toBe("");
});

test("test_tmux_setOption_logs_caller_name_and_combined_output_to_stderr_when_tmux_fails", (): void => {
  stubRun(1, "", "unknown option\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "caller_frame";
  const caller_frame = (): number => tmux_lib.tmux_setOption("-g", "bogus", "value");
  const rc: number = caller_frame();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err.startsWith("[caller_frame]")).toBe(true);
  expect(err).toContain("tmux set-option -g bogus value");
  expect(err).toContain("unknown option");
});

test("test_tmux_setOption_passes_variadic_args_through_to_tmux_in_order", (): void => {
  const seen: { cmd: string[] | undefined } = { cmd: undefined };
  spyOn(tmux_lib, "run").mockImplementation((cmd: string[]): RunResult => {
    seen.cmd = cmd;
    return { returncode: 0, stdout: "", stderr: "" };
  });
  tmux_lib.tmux_setOption("-gqu", "-t", "session:0", "mouse", "off");
  expect(seen.cmd).toEqual(["tmux", "set-option", "-gqu", "-t", "session:0", "mouse", "off"]);
});

test("test_tmux_setOptionForTarget_passes_target_flag_then_target_then_name_then_value_to_tmux_setOption", (): void => {
  const captured_args: { args: string[] | undefined } = { args: undefined };
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((...args: string[]): number => {
    captured_args.args = args;
    return 0;
  });
  tmux_lib.tmux_setOptionForTarget("mysession", "status", "on");
  expect(captured_args.args).toEqual(["-t", "mysession", "status", "on"]);
});

test("test_tmux_setOptionForTarget_returns_the_exit_code_from_tmux_setOption", (): void => {
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((): number => 42);
  const result: number = tmux_lib.tmux_setOptionForTarget("win0", "remain-on-exit", "off");
  expect(result).toBe(42);
});

test("test_tmux_setOptionGlobally_passes_dash_g_flag_then_name_then_value_to_tmux_setOption", (): void => {
  const captured_args: { args: string[] | undefined } = { args: undefined };
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((...args: string[]): number => {
    captured_args.args = args;
    return 0;
  });
  tmux_lib.tmux_setOptionGlobally("status-interval", "5");
  expect(captured_args.args).toEqual(["-g", "status-interval", "5"]);
});

test("test_tmux_setOptionGlobally_returns_the_exit_code_from_tmux_setOption", (): void => {
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((): number => 42);
  const result: number = tmux_lib.tmux_setOptionGlobally("foo", "bar");
  expect(result).toBe(42);
});

test("test_tmux_setOptionForWindow_passes_dash_w_then_dash_t_then_target_then_name_then_value_to_tmux_setOption", (): void => {
  const captured: { args: string[] | undefined } = { args: undefined };
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((...args: string[]): number => {
    captured.args = args;
    return 0;
  });
  tmux_lib.tmux_setOptionForWindow("mywin", "remain-on-exit", "on");
  expect(captured.args).toEqual(["-w", "-t", "mywin", "remain-on-exit", "on"]);
});

test("test_tmux_setOptionForWindow_returns_the_exit_code_from_tmux_setOption", (): void => {
  spyOn(tmux_lib, "tmux_setOption").mockImplementation((): number => 42);
  const result: number = tmux_lib.tmux_setOptionForWindow("win", "opt", "val");
  expect(result).toBe(42);
});

test("test_tmux_selectPane_invokes_tmux_select_pane_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_selectPane("sess:0.1");
  expect(calls).toEqual([["tmux", "select-pane", "-t", "sess:0.1"]]);
});

test("test_tmux_selectPane_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_selectPane("good-target")).toBe(0);
});

test("test_tmux_selectPane_returns_nonzero_and_logs_caller_when_select_fails", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "caller_frame";
  const caller_frame = (): number => tmux_lib.tmux_selectPane("missing");
  const rc: number = caller_frame();
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("caller_frame");
  expect(err).toContain("can't find pane");
});

test("test_tmux_setPaneTitle_invokes_tmux_select_pane_with_dash_t_target_and_dash_T_title", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_setPaneTitle("%42", "my-title");
  expect(calls).toEqual([["tmux", "select-pane", "-t", "%42", "-T", "my-title"]]);
});

test("test_tmux_setPaneTitle_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_setPaneTitle("%0", "title")).toBe(0);
});

test("test_tmux_setPaneTitle_returns_nonzero_and_logs_caller_when_target_missing", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "test_tmux_setPaneTitle_returns_nonzero_and_logs_caller_when_target_missing";
  const rc: number = tmux_lib.tmux_setPaneTitle("%999", "x");
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("[test_tmux_setPaneTitle_returns_nonzero_and_logs_caller_when_target_missing]");
  expect(err).toContain("can't find pane");
});

test("test_tmux_selectLayout_invokes_tmux_select_layout_with_dash_t_target_then_layout_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_selectLayout("session:0.0", "tiled");
  expect(calls).toEqual([["tmux", "select-layout", "-t", "session:0.0", "tiled"]]);
});

test("test_tmux_selectLayout_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_selectLayout("sess:0", "even-horizontal")).toBe(0);
});

test("test_tmux_selectLayout_returns_nonzero_and_logs_caller_when_layout_invalid", (): void => {
  stubRun(1, "", "invalid layout: bogus");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "test_tmux_selectLayout_returns_nonzero_and_logs_caller_when_layout_invalid";
  const rc: number = tmux_lib.tmux_selectLayout("sess:0", "bogus");
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_selectLayout_returns_nonzero_and_logs_caller_when_layout_invalid");
  expect(err).toContain("tmux select-layout -t sess:0 bogus");
  expect(err).toContain("invalid layout: bogus");
});

test("test_tmux_retile_invokes_tmux_selectLayout_with_tiled_for_the_given_target", (): void => {
  const calls: string[][] = [];
  spyOn(tmux_lib, "tmux_selectLayout").mockImplementation((target: string, layout: string): number => {
    calls.push([target, layout]);
    return 0;
  });
  tmux_lib.tmux_retile("session:1");
  expect(calls).toEqual([["session:1", "tiled"]]);
});

test("test_tmux_retile_returns_the_exit_code_from_tmux_selectLayout", (): void => {
  spyOn(tmux_lib, "tmux_selectLayout").mockImplementation((): number => 42);
  expect(tmux_lib.tmux_retile("any-target")).toBe(42);
});

test("test_setOptionForWindow_rejects_nonexistent_window", (): void => {
  const session: string = tmuxSessionOptsFixture();
  const streams: { out: () => string; err: () => string } = captureStreams();
  const bogus_win: string = `nosuch-${process.pid}`;
  const rc: number = tmux_lib.tmux_setOptionForWindow(`${session}:${bogus_win}`, "aggressive-resize", "on");
  expect(rc).not.toBe(0);
  streams.out();
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_setOptionForWindow_accepts_valid_window_option", (): void => {
  const session: string = tmuxSessionOptsFixture();
  const win: string = `optwin-${process.pid}`;
  const rc_new: number = tmux_lib.tmux_newWindow(session, win);
  expect(rc_new, "precondition: tmux_newWindow should succeed").toBe(0);
  const rc: number = tmux_lib.tmux_setOptionForWindow(`${session}:${win}`, "aggressive-resize", "on");
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_setOptionGlobally_rejects_invalid_option", (): void => {
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_setOptionGlobally("not-a-real-option", "foo");
  expect(rc).not.toBe(0);
  streams.out();
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_setOptionGlobally_accepts_valid_global_option", (): void => {
  const proc: RunResult = realTmux("show-options", "-gv", "mouse");
  const current: string = (proc.stdout || "").trim() || "off";
  const rc: number = tmux_lib.tmux_setOptionGlobally("mouse", current);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_setOptionForTarget_rejects_nonexistent_target", (): void => {
  const streams: { out: () => string; err: () => string } = captureStreams();
  const bogus: string = `nonexistent-${process.pid}`;
  killRealSession(bogus);
  const rc: number = tmux_lib.tmux_setOptionForTarget(bogus, "mouse", "on");
  expect(rc).not.toBe(0);
  streams.out();
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_setOptionForTarget_rejects_invalid_option", (): void => {
  const session: string = tmuxSessionOptsFixture();
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_setOptionForTarget(session, "not-a-real-option", "foo");
  expect(rc).not.toBe(0);
  streams.out();
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_setOptionForTarget_accepts_valid_session_option", (): void => {
  const session: string = tmuxSessionOptsFixture();
  const rc: number = tmux_lib.tmux_setOptionForTarget(session, "remain-on-exit", "off");
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_selectPane_byKnownPaneId_succeeds", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  const pid: string = firstPaneId(tmux_session_panes);
  expect(pid, "precondition: a pane id must exist").toBeTruthy();
  const rc: number = tmux_lib.tmux_selectPane(pid);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_setPaneTitle_succeeds", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  const pid: string = firstPaneId(tmux_session_panes);
  const rc: number = tmux_lib.tmux_setPaneTitle(pid, `titletest-${process.pid}`);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_setPaneTitle_roundTripsThroughListPanes", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  const pid: string = firstPaneId(tmux_session_panes);
  const title: string = `titletest-${process.pid}`;
  expect(tmux_lib.tmux_setPaneTitle(pid, title)).toBe(0);
  const rows: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
  expect(rows.some((row: string): boolean => row.includes(title))).toBe(true);
}, LIVE_TIMEOUT_MS);

test("test_selectPane_failsOnNonexistentTarget", (): void => {
  const streams: { out: () => string; err: () => string } = captureStreams();
  const bogus: string = `nonexistent-${process.pid}`;
  const rc: number = tmux_lib.tmux_selectPane(bogus);
  expect(rc).not.toBe(0);
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_selectLayout_tiled_succeeds", (): void => {
  const layout_session: string = layoutSessionFixture();
  const rc: number = tmux_lib.tmux_selectLayout(layout_session, "tiled");
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_selectLayout_evenHorizontal_succeeds", (): void => {
  const layout_session: string = layoutSessionFixture();
  const rc: number = tmux_lib.tmux_selectLayout(layout_session, "even-horizontal");
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_selectLayout_invalidName_fails", (): void => {
  const layout_session: string = layoutSessionFixture();
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_selectLayout(layout_session, "not-a-layout");
  expect(rc).not.toBe(0);
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_retile_succeeds", (): void => {
  const layout_session: string = layoutSessionFixture();
  const rc: number = tmux_lib.tmux_retile(layout_session);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_retile_nonexistentTarget_fails", (): void => {
  const streams: { out: () => string; err: () => string } = captureStreams();
  const bogus: string = `nonexistent-${process.pid}-xyz`;
  const rc: number = tmux_lib.tmux_retile(bogus);
  expect(rc).not.toBe(0);
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_tmux_newSession_invokes_tmux_new_session_with_dash_d_dash_s_and_session_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newSession("mysess");
  expect(calls).toEqual([["tmux", "new-session", "-d", "-s", "mysess"]]);
});

test("test_tmux_newSession_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_newSession("ok")).toBe(0);
});

test("test_tmux_newSession_returns_nonzero_and_logs_caller_when_creation_fails", (): void => {
  stubRun(1, "", "duplicate session: dup");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "test_tmux_newSession_returns_nonzero_and_logs_caller_when_creation_fails";
  const rc: number = tmux_lib.tmux_newSession("dup");
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_newSession_returns_nonzero_and_logs_caller_when_creation_fails");
  expect(err).toContain("tmux new-session -d -s dup");
  expect(err).toContain("duplicate session: dup");
});

test("test_tmux_newSession_passes_extra_args_through_to_tmux_after_session_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newSession("s1", "-n", "win", "-c", "/tmp", "bash");
  expect(calls).toEqual([["tmux", "new-session", "-d", "-s", "s1", "-n", "win", "-c", "/tmp", "bash"]]);
});

test("test_tmux_newPane_invokes_tmux_split_window_with_dash_t_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newPane("sess:0.0");
  expect(calls).toEqual([["tmux", "split-window", "-t", "sess:0.0"]]);
});

test("test_tmux_newPane_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_newPane("sess:0.0")).toBe(0);
});

test("test_tmux_newPane_returns_nonzero_and_logs_caller_when_split_fails", (): void => {
  stubRun(1, "", "can't find pane");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "test_tmux_newPane_returns_nonzero_and_logs_caller_when_split_fails";
  const rc: number = tmux_lib.tmux_newPane("nope:0.0");
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_newPane_returns_nonzero_and_logs_caller_when_split_fails");
  expect(err).toContain("can't find pane");
});

test("test_tmux_newPane_passes_extra_args_through_after_target", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newPane("sess:0.0", "-c", "/tmp", "-P", "-F", "#{pane_id}", "bash");
  expect(calls).toEqual([["tmux", "split-window", "-t", "sess:0.0", "-c", "/tmp", "-P", "-F", "#{pane_id}", "bash"]]);
});

test("test_tmux_newPane_prints_stdout_to_caller_on_success", (): void => {
  stubRun(0, "%42\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_newPane("sess:0.0", "-P", "-F", "#{pane_id}");
  const out: string = streams.out();
  expect(rc).toBe(0);
  expect(out).toBe("%42\n");
});

test("test_tmux_newWindow_invokes_tmux_new_window_with_dash_t_session_and_dash_n_window", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newWindow("mysess", "mywin");
  expect(calls).toEqual([["tmux", "new-window", "-t", "mysess", "-n", "mywin"]]);
});

test("test_tmux_newWindow_returns_zero_on_success", (): void => {
  stubRun(0);
  expect(tmux_lib.tmux_newWindow("s", "w")).toBe(0);
});

test("test_tmux_newWindow_returns_nonzero_and_logs_caller_when_creation_fails", (): void => {
  stubRun(2, "", "duplicate window");
  const streams: { out: () => string; err: () => string } = captureStreams();
  tmux_lib.externalCaller = "caller_fn";
  const caller_fn = (): number => tmux_lib.tmux_newWindow("s", "w");
  const rc: number = caller_fn();
  const err: string = streams.err();
  expect(rc).toBe(2);
  expect(err).toContain("[caller_fn]");
  expect(err).toContain("duplicate window");
});

test("test_tmux_newWindow_passes_extra_args_through_after_window_name", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  tmux_lib.tmux_newWindow("s", "w", "-c", "/tmp", "echo hi");
  expect(calls).toEqual([["tmux", "new-window", "-t", "s", "-n", "w", "-c", "/tmp", "echo hi"]]);
});

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
  tmux_lib.externalCaller = "test_tmux_splitWindow_returns_nonzero_and_logs_caller_when_split_fails";
  const rc: number = tmux_lib.tmux_splitWindow("missing", "h");
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("tmux split-window -h -t missing");
  expect(err).toContain("test_tmux_splitWindow_returns_nonzero_and_logs_caller_when_split_fails");
});

test("test_tmux_splitWindow_raises_ValueError_for_invalid_direction", (): void => {
  const calls: string[][] = [];
  stubRun(0, "", "", calls);
  expect((): number => tmux_lib.tmux_splitWindow("s1", "x")).toThrow("direction must be 'h' or 'v'");
  expect(calls).toEqual([]);
});

test("test_tmux_splitWorkerPane_returns_pane_id_on_success", (): void => {
  const captured: { cmd: string[] } = { cmd: [] };
  spyOn(tmux_lib, "run").mockImplementation((cmd: string[]): RunResult => {
    captured.cmd = [...cmd];
    return { returncode: 0, stdout: "%42\n", stderr: "" };
  });
  const result: string | undefined = tmux_lib.tmux_splitWorkerPane("sess:win", "/tmp/work", "sleep 1");
  expect(result).toBe("%42");
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
  tmux_lib.externalCaller = "caller_frame_under_test";
  const caller_frame_under_test = (): string | undefined => tmux_lib.tmux_splitWorkerPane("s:w", "/tmp", "cmd");
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

test("test_newSession_createsSession", (): void => {
  const session_name: string = sessionNameFixture();
  const rc: number = tmux_lib.tmux_newSession(session_name);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_newSession_rejectsDuplicate", (): void => {
  const session_name: string = sessionNameFixture();
  expect(tmux_lib.tmux_newSession(session_name)).toBe(0);
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_newSession(session_name);
  expect(rc).not.toBe(0);
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_newPane_addsPaneToSession", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  const rc: number = tmux_lib.tmux_newPane(tmux_session_panes);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_newPane_failsOnNonexistentSession", (): void => {
  const streams: { out: () => string; err: () => string } = captureStreams();
  const bogus: string = `nonexistent-${process.pid}`;
  const rc: number = tmux_lib.tmux_newPane(bogus);
  expect(rc).not.toBe(0);
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_ensure_session_creates_new_session", (): void => {
  const tmux_session_clean: string = tmuxSessionCleanFixture();
  tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
  expect(tmuxHasSession(tmux_session_clean)).toBe(true);
}, LIVE_TIMEOUT_MS);

test("test_ensure_session_sets_keepalive_pane_title", (): void => {
  const tmux_session_clean: string = tmuxSessionCleanFixture();
  tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
  expect(tmuxPaneHasTitle(`${tmux_session_clean}:main`, "keepalive")).toBe(true);
}, LIVE_TIMEOUT_MS);

test("test_ensure_session_applies_pane_border_status_top", (): void => {
  const tmux_session_clean: string = tmuxSessionCleanFixture();
  tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
  const border: string = tmuxShowOption(tmux_session_clean, "pane-border-status");
  expect(border).toBe("top");
}, LIVE_TIMEOUT_MS);

test("test_split_worker_pane_returns_pane_id", (): void => {
  const tmux_session_clean: string = tmuxSessionCleanFixture();
  tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
  const worker: string | undefined = tmux_lib.tmux_splitWorkerPane(`${tmux_session_clean}:main`, "/tmp", "sleep 30");
  expect(worker).toBeTruthy();
  expect(String(worker).startsWith("%")).toBe(true);
}, LIVE_TIMEOUT_MS);

test("test_ensure_session_idempotent_on_existing_session", (): void => {
  const tmux_session_clean: string = tmuxSessionCleanFixture();
  tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
  tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
  expect(tmuxHasSession(tmux_session_clean)).toBe(true);
}, LIVE_TIMEOUT_MS);

test("test_ensure_session_adds_new_window_to_existing_session", (): void => {
  const tmux_session_clean: string = tmuxSessionCleanFixture();
  tmux_lib.tmux_ensureSession(tmux_session_clean, "main", "/tmp", "sleep 30", "keepalive");
  const second: string = `secondwin-${process.pid}`;
  tmux_lib.tmux_ensureSession(tmux_session_clean, second, "/tmp", "sleep 30", "keepalive-2");
  expect(tmuxWindowExists(tmux_session_clean, second)).toBe(true);
}, LIVE_TIMEOUT_MS);

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
  tmux_lib.externalCaller = "caller_frame";
  const caller_frame = (): number => tmux_lib.tmux_killSession("ghost");
  const rc: number = caller_frame();
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
  tmux_lib.externalCaller = "caller_frame_marker";
  const caller_frame_marker = (): number => tmux_lib.tmux_killPane("missing:9.9");
  const rc: number = caller_frame_marker();
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
  tmux_lib.externalCaller = "test_tmux_killWindow_returns_nonzero_and_logs_caller_when_window_missing";
  const rc: number = tmux_lib.tmux_killWindow("ghost");
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(err).toContain("test_tmux_killWindow_returns_nonzero_and_logs_caller_when_window_missing");
  expect(err).toContain("tmux kill-window -t ghost");
  expect(err).toContain("can't find window: ghost");
});

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

test("test_tmux_waitForClaudeReadiness_returns_zero_when_glyph_present_immediately", (): void => {
  const sleep_calls: number[] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => `banner\n${READY_GLYPH} ready\n`);
  spyOn(tmux_lib, "sleep").mockImplementation((s: number): void => {
    sleep_calls.push(s);
  });
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%42", 1);
  expect(rc).toBe(0);
  expect(sleep_calls).toEqual([]);
});

test("test_tmux_waitForClaudeReadiness_returns_one_on_timeout_and_logs_stderr", (): void => {
  const sleep_calls: number[] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => "still loading");
  spyOn(tmux_lib, "sleep").mockImplementation((s: number): void => {
    sleep_calls.push(s);
  });
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%7", 2);
  const err: string = streams.err();
  expect(rc).toBe(1);
  expect(sleep_calls).toEqual([0.5, 0.5, 0.5, 0.5]);
  expect(err).toContain("tmux_waitForClaudeReadiness");
  expect(err).toContain("timed out");
  expect(err).toContain("%7");
});

test("test_tmux_waitForClaudeReadiness_polls_until_ready", (): void => {
  const seq: () => string = makeIter(["boot", "starting", `${READY_GLYPH}`]);
  const sleep_count: { n: number } = { n: 0 };
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => seq());
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {
    sleep_count.n += 1;
  });
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%1", 5);
  expect(rc).toBe(0);
  expect(sleep_count.n).toBe(2);
});

test("test_tmux_waitForClaudeReadiness_swallows_capture_errors", (): void => {
  const calls: { n: number } = { n: 0 };
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => {
    calls.n += 1;
    if (calls.n === 1) {
      throw new Error("transient");
    }
    return READY_GLYPH;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  expect(tmux_lib.tmux_waitForClaudeReadiness("%9", 2)).toBe(0);
  expect(calls.n).toBe(2);
});

test("test_tmux_waitForClaudeReadiness_default_timeout_is_ten_seconds", (): void => {
  const attempts: { n: number } = { n: 0 };
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((): string => {
    attempts.n += 1;
    return "";
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_waitForClaudeReadiness("%2");
  expect(rc).toBe(1);
  expect(attempts.n).toBe(20);
  streams.err();
});

test("test_tmux_waitForClaudeReadiness_passes_pane_id_and_five_line_window", (): void => {
  const seen: [string, number | undefined][] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation((pid: string, lines: number | undefined = undefined): string => {
    seen.push([pid, lines]);
    return READY_GLYPH;
  });
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  tmux_lib.tmux_waitForClaudeReadiness("%55", 1);
  expect(seen).toEqual([["%55", 5]]);
});

test("test_tmux_requireVersion_returns_1_and_logs_when_tmux_binary_is_missing", (): void => {
  spyOn(tmux_lib, "run").mockImplementation((): RunResult => {
    throw new tmux_lib_internal.FileNotFoundError("tmux");
  });
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
  tmux_lib.externalCaller = "test_tmux_hasSession_logs_caller_name_to_stderr_on_unexpected_nonzero_rc";
  const rc: number = tmux_lib.tmux_hasSession("weird");
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
  tmux_lib.externalCaller = "caller_frame";
  const caller_frame = (): string[] => tmux_lib.tmux_listClients("ghost");
  const result: string[] = caller_frame();
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
  tmux_lib.externalCaller = "test_tmux_listPanes_returns_empty_list_and_logs_caller_when_target_missing";
  const panes: string[] = tmux_lib.tmux_listPanes("nope");
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
  tmux_lib.externalCaller = "test_tmux_listWindows_returns_empty_list_and_logs_caller_when_session_missing";
  const result: string[] = tmux_lib.tmux_listWindows("ghost");
  const err: string = streams.err();
  expect(result).toEqual([]);
  expect(err).toContain("test_tmux_listWindows_returns_empty_list_and_logs_caller_when_session_missing");
  expect(err).toContain("ghost");
});

test("test_tmux_windowExists_returns_zero_when_window_name_appears_in_listed_windows", (): void => {
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation((): string[] => ["main", "logs", "editor"]);
  expect(tmux_lib.tmux_windowExists("sess", "logs")).toBe(0);
});

test("test_tmux_windowExists_returns_one_when_window_name_not_in_listed_windows", (): void => {
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation((): string[] => ["main", "editor"]);
  expect(tmux_lib.tmux_windowExists("sess", "logs")).toBe(1);
});

test("test_tmux_windowExists_uses_exact_match_not_substring", (): void => {
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation((): string[] => ["logs"]);
  expect(tmux_lib.tmux_windowExists("sess", "log")).toBe(1);
});

test("test_tmux_windowExists_invokes_tmux_listWindows_with_F_window_name_format", (): void => {
  const captured: { session: string | undefined; args: string[] | undefined } = { session: undefined, args: undefined };
  spyOn(tmux_lib, "tmux_listWindows").mockImplementation((session: string, ...args: string[]): string[] => {
    captured.session = session;
    captured.args = args;
    return [];
  });
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
  spyOn(tmux_lib, "tmux_listPanes").mockImplementation((...args: string[]): string[] => {
    captured.args = args;
    return [];
  });
  tmux_lib.tmux_paneHasTitle("my-target", "anything");
  expect(captured.args).toEqual(["my-target", "-F", "#{pane_title}"]);
});

test("test_hasSession_returnsFalse_afterKill", (): void => {
  const session_name: string = sessionNameFixture();
  expect(tmux_lib.tmux_newSession(session_name)).toBe(0);
  expect(tmux_lib.tmux_killSession(session_name)).toBe(0);
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_hasSession(session_name);
  expect(rc).not.toBe(0);
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_hasSession_returnsFalse_forNonexistentSession", (): void => {
  const session_name: string = sessionNameFixture();
  const streams: { out: () => string; err: () => string } = captureStreams();
  const rc: number = tmux_lib.tmux_hasSession(session_name);
  expect(rc).not.toBe(0);
  streams.err();
}, LIVE_TIMEOUT_MS);

test("test_hasSession_returnsTrue_forExistingSession", (): void => {
  const session_name: string = sessionNameFixture();
  expect(tmux_lib.tmux_newSession(session_name)).toBe(0);
  const rc: number = tmux_lib.tmux_hasSession(session_name);
  expect(rc).toBe(0);
}, LIVE_TIMEOUT_MS);

test("test_listPanes_newSession_hasOnePane", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  const panes: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
  expect(panes.length).toBe(1);
}, LIVE_TIMEOUT_MS);

test("test_listPanes_afterNewPane_hasTwoPanes", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  expect(tmux_lib.tmux_newPane(tmux_session_panes)).toBe(0);
  const panes: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
  expect(panes.length).toBe(2);
}, LIVE_TIMEOUT_MS);

test("test_capturePane_returnsContent", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  const pid: string = firstPaneId(tmux_session_panes);
  const captured: string = tmux_lib.tmux_capturePane(pid);
  expect(typeof captured).toBe("string");
}, LIVE_TIMEOUT_MS);

test("test_listPanes_afterKillPane_hasOnePane", (): void => {
  const tmux_session_panes: string = tmuxSessionPanesFixture();
  expect(tmux_lib.tmux_newPane(tmux_session_panes)).toBe(0);
  const ids: string[] = tmux_lib.tmux_listPanes(tmux_session_panes, "-F", "#{pane_id}");
  expect(tmux_lib.tmux_killPane(ids[1]!)).toBe(0);
  const rows: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
  expect(rows.length).toBe(1);
}, LIVE_TIMEOUT_MS);
