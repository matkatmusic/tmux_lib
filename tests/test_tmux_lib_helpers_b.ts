import { expect, test as bunTest } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { executeRealTmux, generateUniqueSuffix, tmuxInstalled } from "./test_tmux_lib_helpers_a.ts";
import { addTeardown, stopRealSession, stopSessionQuietly } from "./test_tmux_lib_helpers_c.ts";

// Bun 1.4.3 cannot skip from inside a running test, so the live_tmux_session skip is decided once at load.
const probeSession: string = `tmux-sh-send-probe-${generateUniqueSuffix()}`;
const canCreateLiveSession: boolean = tmuxInstalled && executeRealTmux("new-session", "-d", "-s", probeSession).returncode === 0;
if (canCreateLiveSession) {
  executeRealTmux("kill-session", "-t", probeSession);
}
export const liveSessionTest: typeof bunTest = bunTest.skipIf(!canCreateLiveSession) as typeof bunTest;

// Fixture session_name: unique name, stale session cleared, killed again at teardown.
export function createSessionNameFixture(): string {
  const name: string = `tmux-py-session-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

// Fixture tmux_session_panes: a real detached session.
export function createSessionPanesFixture(): string {
  const name: string = `tmux-py-pane-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  expect(rc, "fixture precondition: new session must succeed").toBe(0);
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

export function getFirstPaneId(session: string): string {
  const rows: string[] = tmux_lib.tmux_listPanes(session, "-F", "#{pane_id}");
  return rows.length > 0 ? rows[0]! : "";
}

// Fixture tmux_session_opts: a real detached session for option tests (raw kill-session, as in Python).
export function createSessionOptsFixture(): string {
  const name: string = `tmux-py-opt-test-${process.pid}`;
  stopRealSession(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  expect(rc, "fixture failed to create tmux session").toBe(0);
  addTeardown((): void => {
    stopRealSession(name);
  });
  return name;
}

// Fixture layout_session: a real detached session with 3 panes.
export function createLayoutSessionFixture(): string {
  const name: string = `tmux-py-lay-test-${process.pid}`;
  tmux_lib.tmux_newSession(name);
  tmux_lib.tmux_newPane(name);
  tmux_lib.tmux_newPane(name);
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

export function isTmuxSessionPresent(name: string): boolean {
  return executeRealTmux("has-session", "-t", name).returncode === 0;
}

export function isTmuxWindowPresent(session: string, window: string): boolean {
  const r: RunResult = executeRealTmux("list-windows", "-t", session, "-F", "#{window_name}");
  if (r.returncode !== 0) {
    return false;
  }
  return tmux_lib_internal.splitlines(r.stdout).includes(window);
}

export function isTmuxPaneTitled(target: string, title: string): boolean {
  const r: RunResult = executeRealTmux("display-message", "-p", "-t", target, "#{pane_title}");
  return r.returncode === 0 && tmux_lib_internal.strip(r.stdout) === title;
}

export function getTmuxOption(target: string, opt: string): string {
  const r: RunResult = executeRealTmux("show-options", "-t", target, "-v", opt);
  return r.returncode === 0 ? tmux_lib_internal.strip(r.stdout) : "";
}

// Fixture tmux_session_clean: unique session name, cleaned (DEVNULL kill-session) before and after.
export function createSessionCleanFixture(): string {
  const name: string = `tmux-sh-launcher-test-${process.pid}`;
  stopSessionQuietly(name);
  addTeardown((): void => {
    stopSessionQuietly(name);
  });
  return name;
}

// Fixture live_tmux_session: unique detached session, killed with tmux_killSession at teardown.
export function createLiveSessionFixture(): string {
  const session: string = `tmux-sh-send-test-${generateUniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_newSession(session);
  if (rc !== 0) {
    throw new Error("tmux_newSession failed; tmux likely unavailable");
  }
  addTeardown((): void => {
    tmux_lib.tmux_killSession(session);
  });
  return session;
}
