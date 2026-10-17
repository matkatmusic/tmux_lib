import { describe, expect } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { LIVE_TIMEOUT_MS, test } from "./test_tmux_lib_helpers_a.ts";
import { getFirstPaneId, createSessionNameFixture, createSessionPanesFixture } from "./test_tmux_lib_helpers_b.ts";
import { installTestHooks } from "./test_tmux_lib_helpers_c.ts";

installTestHooks();

describe("live", (): void => {
  test("test_hasSession_returnsFalse_afterKill", (): void => {
    const session_name: string = createSessionNameFixture();
    expect(tmux_lib.tmux_newSession(session_name)).toBe(0);
    expect(tmux_lib.tmux_killSession(session_name)).toBe(0);
    const rc: number = tmux_lib.tmux_hasSession(session_name);
    expect(rc).not.toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_hasSession_returnsFalse_forNonexistentSession", (): void => {
    const session_name: string = createSessionNameFixture();
    const rc: number = tmux_lib.tmux_hasSession(session_name);
    expect(rc).not.toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_hasSession_returnsTrue_forExistingSession", (): void => {
    const session_name: string = createSessionNameFixture();
    expect(tmux_lib.tmux_newSession(session_name)).toBe(0);
    const rc: number = tmux_lib.tmux_hasSession(session_name);
    expect(rc).toBe(0);
  }, LIVE_TIMEOUT_MS);

  test("test_listPanes_newSession_hasOnePane", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    const panes: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
    expect(panes.length).toBe(1);
  }, LIVE_TIMEOUT_MS);

  test("test_listPanes_afterNewPane_hasTwoPanes", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    expect(tmux_lib.tmux_newPane(tmux_session_panes)).toBe(0);
    const panes: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
    expect(panes.length).toBe(2);
  }, LIVE_TIMEOUT_MS);

  test("test_capturePane_returnsContent", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    const pid: string = getFirstPaneId(tmux_session_panes);
    const captured: string = tmux_lib.tmux_capturePane(pid);
    expect(typeof captured).toBe("string");
  }, LIVE_TIMEOUT_MS);

  test("test_listPanes_afterKillPane_hasOnePane", (): void => {
    const tmux_session_panes: string = createSessionPanesFixture();
    expect(tmux_lib.tmux_newPane(tmux_session_panes)).toBe(0);
    const ids: string[] = tmux_lib.tmux_listPanes(tmux_session_panes, "-F", "#{pane_id}");
    expect(tmux_lib.tmux_killPane(ids[1]!)).toBe(0);
    const rows: string[] = tmux_lib.tmux_listPanes(tmux_session_panes);
    expect(rows.length).toBe(1);
  }, LIVE_TIMEOUT_MS);
});

// === Added for Python parity: no Python twin ===

const TEXT_RUN: { capture_output: true; text: true; check: false } = { capture_output: true, text: true, check: false };

test("parity_run_passes_runtime_process_env_changes_to_the_child", (): void => {
  process.env.TMUX_LIB_TS_PARITY_VAR = "from-runtime";
  const result: RunResult = tmux_lib.run(["sh", "-c", "printf %s \"$TMUX_LIB_TS_PARITY_VAR\""], TEXT_RUN);
  delete process.env.TMUX_LIB_TS_PARITY_VAR;
  expect(result.stdout).toBe("from-runtime");
});

test("parity_run_text_mode_turns_crlf_and_lone_cr_into_lf", (): void => {
  const result: RunResult = tmux_lib.run(["printf", "a\\r\\nb\\rc\\n"], TEXT_RUN);
  expect(result.stdout).toBe("a\nb\nc\n");
});

test("parity_run_text_mode_throws_UnicodeDecodeError_on_invalid_utf8", (): void => {
  const run_invalid = (): RunResult => tmux_lib.run(["printf", "\\377"], TEXT_RUN);
  expect(run_invalid).toThrow(tmux_lib_internal.UnicodeDecodeError);
  expect(run_invalid).toThrow(tmux_lib_internal.ValueError);
});

test("parity_run_text_mode_keeps_a_leading_BOM", (): void => {
  const result: RunResult = tmux_lib.run(["printf", "\\357\\273\\277x"], TEXT_RUN);
  expect(result.stdout).toBe("\u{feff}x");
});

test("parity_run_binary_mode_returns_bytes_and_devnull_returns_null", (): void => {
  const captured = tmux_lib.run(["printf", "a\\r\\n"], { capture_output: true });
  expect(Array.from(captured.stdout!)).toEqual([97, 13, 10]);
  const discarded = tmux_lib.run(["printf", "a"], { stdout: "DEVNULL", stderr: "DEVNULL", check: false });
  expect(discarded.stdout).toBeNull();
  expect(discarded.stderr).toBeNull();
});

test("parity_run_throws_ValueError_embedded_null_byte_when_argv_has_a_NUL", (): void => {
  const run_nul = (): RunResult => tmux_lib.run(["tmux", "has-session", "-t", "a\0b"], TEXT_RUN);
  expect(run_nul).toThrow(tmux_lib_internal.ValueError);
  expect(run_nul).toThrow("embedded null byte");
});

test("parity_ValueError_from_a_NUL_in_argv_propagates_through_the_OSError_only_catches", (): void => {
  expect((): string => tmux_lib._tmux_paneCurrentCommand("%1\0")).toThrow(tmux_lib_internal.ValueError);
  expect((): Set<string> => tmux_lib._tmux_listLivePaneIds("s\0")).toThrow(tmux_lib_internal.ValueError);
});

test("parity_missing_binary_is_FileNotFoundError", (): void => {
  expect((): RunResult => tmux_lib.run(["/nonexistent/tmux-binary"], TEXT_RUN)).toThrow(tmux_lib_internal.FileNotFoundError);
});
