import { expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_session } from "./tmux_lib_session.ts";
import { setStubRun } from "./tests/test_tmux_lib_helpers_a.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

installTestHooks();

test("tmux_killSession_runs_kill_session_for_the_named_session", (): void => {
  const calls: string[][] = [];
  setStubRun(0, "", "", calls);
  expect(tmux_lib_session.tmux_killSession("s")).toBe(0);
  expect(calls).toEqual([["tmux", "kill-session", "-t", "s"]]);
});

test("tmux_listClients_returns_non_empty_lines", (): void => {
  setStubRun(0, "c1\n\nc2\n");
  expect(tmux_lib.tmux_listClients("s")).toEqual(["c1", "c2"]);
});

test("tmux_hasSession_returns_the_exit_code_without_logging_for_one", (): void => {
  setStubRun(1);
  expect(tmux_lib.tmux_hasSession("s")).toBe(1);
});
