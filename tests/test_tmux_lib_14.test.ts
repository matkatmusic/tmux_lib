import { expect, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal } from "../tmux_lib_internal.ts";
import { makeFakeRun, stubRun, test } from "./test_tmux_lib_helpers_a.ts";
import { captureStreams, pyLambda, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();

test("parity_strip_uses_the_Python_isspace_set", (): void => {
  expect(tmux_lib_internal.strip("\x1c\x1d\x1e\x1f\x85\u{a0}\u{3000} x \t\n\r\v\f\u{2028}\u{2029}\u{202f}\u{205f}")).toBe("x");
  expect(tmux_lib_internal.strip("\u{feff}x\u{feff}")).toBe("\u{feff}x\u{feff}");
  expect(tmux_lib_internal.strip("\u{200b}x")).toBe("\u{200b}x");
  expect(tmux_lib_internal.strip(" \n ")).toBe("");
});

test("parity_inputBoxHoldsText_strips_with_the_Python_whitespace_set", (): void => {
  stubRun(0, "\x1f❯\x1f hello\n");
  expect(tmux_lib.tmux_inputBoxHoldsText("%1")).toBe(true);
  stubRun(0, "\u{276f}\x1f\u{a0}\n");
  expect(tmux_lib.tmux_inputBoxHoldsText("%1")).toBe(false);
});

test("parity_pyRepr_matches_Python_repr_for_strings", (): void => {
  expect(tmux_lib._pyRepr("abc")).toBe("'abc'");
  expect(tmux_lib._pyRepr("it's")).toBe('"it\'s"');
  expect(tmux_lib._pyRepr("it's \"q\"")).toBe("'it\\'s \"q\"'");
  expect(tmux_lib._pyRepr("a\\b\nc\rd\te")).toBe("'a\\\\b\\nc\\rd\\te'");
  expect(tmux_lib._pyRepr("\x00\x1b\x7f")).toBe("'\\x00\\x1b\\x7f'");
  expect(tmux_lib._pyRepr("\x85\u{a0}\u{200b}\u{2028}")).toBe("'\\x85\\xa0\\u200b\\u2028'");
  expect(tmux_lib._pyRepr("\u{e9}\u{4e2d}\u{1f600}")).toBe("'\u{e9}\u{4e2d}\u{1f600}'");
  expect(tmux_lib._pyRepr("\u{e0001}")).toBe("'\\U000e0001'");
});

test("parity_requireVersion_reads_non_ASCII_decimal_digits_like_Python_int", (): void => {
  stubRun(0, "tmux \u{663}.\u{661}\n");
  expect(tmux_lib.tmux_requireVersion("3.1")).toBe(0);
  expect(tmux_lib.tmux_requireVersion("3.2")).toBe(1);
  expect(tmux_lib._pyInt("\u{663}\u{661}")).toBe(31n);
});

test("parity_default_capture_collects_direct_writes_like_capsys", (): void => {
  const streams: { out: () => string; err: () => string } = captureStreams();
  process.stdout.write("w-out;");
  process.stderr.write("w-err;");
  console.log("c-out", 1);
  console.error("c-err", 2);
  tmux_lib.stdoutWrite("s-out;");
  tmux_lib.stderrWrite("s-err;");
  expect(streams.out()).toBe("w-out;c-out 1\ns-out;");
  expect(streams.err()).toBe("w-err;c-err 2\ns-err;");
});

test("parity_fixed_arity_fake_raises_TypeError_on_a_wrong_argument_count", (): void => {
  const lambda_p_t = pyLambda(2, 2, (p: string, t: string): string => p + t);
  expect(lambda_p_t("a", "b")).toBe("ab");
  expect((): string => (lambda_p_t as unknown as (p: string) => string)("a")).toThrow(TypeError);
  expect((): string => (lambda_p_t as unknown as (...a: string[]) => string)("a", "b", "c")).toThrow(TypeError);
});

function tmuxFailureLog(call: () => unknown): string {
  stubRun(1, "", "boom");
  const streams: { out: () => string; err: () => string } = captureStreams();
  const before: number = streams.err().length;
  call();
  return streams.err().slice(before);
}

test("parity_caller_name_is_the_named_outer_function", (): void => {
  function named_outer_function(): void {
    tmux_lib.tmux_sendKeys("x", "y");
  }
  expect(tmuxFailureLog(named_outer_function)).toStartWith("[named_outer_function] command ");
});

test("parity_caller_name_is_the_object_method_name", (): void => {
  const holder = {
    method_caller(): void {
      tmux_lib.tmux_killPane("x");
    },
  };
  expect(tmuxFailureLog((): void => holder.method_caller())).toStartWith("[method_caller] command ");
});

test("parity_caller_name_for_nested_library_calls_is_the_calling_library_function", (): void => {
  const nested: Array<[string, () => unknown]> = [
    ["tmux_windowExists", (): unknown => tmux_lib.tmux_windowExists("s", "w")],
    ["tmux_paneHasTitle", (): unknown => tmux_lib.tmux_paneHasTitle("t", "title")],
    ["tmux_setOptionForTarget", (): unknown => tmux_lib.tmux_setOptionForTarget("t", "n", "v")],
    ["tmux_setOptionGlobally", (): unknown => tmux_lib.tmux_setOptionGlobally("n", "v")],
    ["tmux_setOptionForWindow", (): unknown => tmux_lib.tmux_setOptionForWindow("w", "n", "v")],
    ["tmux_retile", (): unknown => tmux_lib.tmux_retile("t")],
    ["tmux_inputBoxHoldsText", (): unknown => tmux_lib.tmux_inputBoxHoldsText("%1")],
    ["tmux_sendAndSubmit", (): unknown => tmux_lib.tmux_sendAndSubmit("%1", "text")],
    ["tmux_cancelAndSend", (): unknown => tmux_lib.tmux_cancelAndSend("%1", "text")],
    ["tmux_ensureKeepalivePane", (): unknown => tmux_lib.tmux_ensureKeepalivePane("s:w", "/tmp", "cmd", "title")],
    ["tmux_ensureSession", (): unknown => tmux_lib.tmux_ensureSession("s", "w", "/tmp", "cmd", "title")],
    ["tmux_waitForClaudeReadiness", (): unknown => tmux_lib.tmux_waitForClaudeReadiness("%1", 1)],
    ["_tmux_backgroundKill", (): unknown => tmux_lib._tmux_backgroundKill("%1")],
  ];
  spyOn(tmux_lib, "sleep").mockImplementation((): void => {});
  for (const [expected, call] of nested) {
    const err: string = tmuxFailureLog(call);
    expect(err.startsWith(`[${expected}] command `) || err.includes(`\n[${expected}] command `), expected).toBe(true);
  }
});

test("parity_caller_name_is_module_for_top_level_code", (): void => {
  expect(moduleLevelFailureLog).toStartWith("[<module>] command ");
});

const moduleLevelRun: typeof tmux_lib.run = tmux_lib.run;
const moduleLevelStderrWrite: typeof tmux_lib.stderrWrite = tmux_lib.stderrWrite;
let moduleLevelFailureLog: string = "";
tmux_lib.run = makeFakeRun(1, "", "boom");
tmux_lib.stderrWrite = (text: string): void => {
  moduleLevelFailureLog += text;
};
tmux_lib.tmux_sendKeys("x", "y");
tmux_lib.run = moduleLevelRun;
tmux_lib.stderrWrite = moduleLevelStderrWrite;
