import { expect, test as bunTest } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { realTmux, tmuxInstalled, uniqueSuffix } from "./test_tmux_lib_helpers_a.ts";
import { addTeardown, killRealSession, killSessionQuietly } from "./test_tmux_lib_helpers_c.ts";

// Bun 1.4.3 cannot skip from inside a running test, so the live_tmux_session skip is decided once at load.
const probeSession: string = `tmux-sh-send-probe-${uniqueSuffix()}`;
const canCreateLiveSession: boolean = tmuxInstalled && realTmux("new-session", "-d", "-s", probeSession).returncode === 0;
if (canCreateLiveSession) {
  realTmux("kill-session", "-t", probeSession);
}
export const liveSessionTest: typeof bunTest = bunTest.skipIf(!canCreateLiveSession) as typeof bunTest;

// Fixture session_name: unique name, stale session cleared, killed again at teardown.
export function sessionNameFixture(): string {
  const name: string = `tmux-py-session-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

// Fixture tmux_session_panes: a real detached session.
export function tmuxSessionPanesFixture(): string {
  const name: string = `tmux-py-pane-test-${process.pid}`;
  tmux_lib.tmux_killSession(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  expect(rc, "fixture precondition: new session must succeed").toBe(0);
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

export function firstPaneId(session: string): string {
  const rows: string[] = tmux_lib.tmux_listPanes(session, "-F", "#{pane_id}");
  return rows.length > 0 ? rows[0]! : "";
}

// Fixture tmux_session_opts: a real detached session for option tests (raw kill-session, as in Python).
export function tmuxSessionOptsFixture(): string {
  const name: string = `tmux-py-opt-test-${process.pid}`;
  killRealSession(name);
  const rc: number = tmux_lib.tmux_newSession(name);
  expect(rc, "fixture failed to create tmux session").toBe(0);
  addTeardown((): void => {
    killRealSession(name);
  });
  return name;
}

// Fixture layout_session: a real detached session with 3 panes.
export function layoutSessionFixture(): string {
  const name: string = `tmux-py-lay-test-${process.pid}`;
  tmux_lib.tmux_newSession(name);
  tmux_lib.tmux_newPane(name);
  tmux_lib.tmux_newPane(name);
  addTeardown((): void => {
    tmux_lib.tmux_killSession(name);
  });
  return name;
}

export function tmuxHasSession(name: string): boolean {
  return realTmux("has-session", "-t", name).returncode === 0;
}

export function tmuxWindowExists(session: string, window: string): boolean {
  const r: RunResult = realTmux("list-windows", "-t", session, "-F", "#{window_name}");
  if (r.returncode !== 0) {
    return false;
  }
  return tmux_lib_internal.splitlines(r.stdout).includes(window);
}

export function tmuxPaneHasTitle(target: string, title: string): boolean {
  const r: RunResult = realTmux("display-message", "-p", "-t", target, "#{pane_title}");
  return r.returncode === 0 && tmux_lib_internal.strip(r.stdout) === title;
}

export function tmuxShowOption(target: string, opt: string): string {
  const r: RunResult = realTmux("show-options", "-t", target, "-v", opt);
  return r.returncode === 0 ? tmux_lib_internal.strip(r.stdout) : "";
}

// Fixture tmux_session_clean: unique session name, cleaned (DEVNULL kill-session) before and after.
export function tmuxSessionCleanFixture(): string {
  const name: string = `tmux-sh-launcher-test-${process.pid}`;
  killSessionQuietly(name);
  addTeardown((): void => {
    killSessionQuietly(name);
  });
  return name;
}

// Fixture live_tmux_session: unique detached session, killed with tmux_killSession at teardown.
export function liveTmuxSessionFixture(): string {
  const session: string = `tmux-sh-send-test-${uniqueSuffix()}`;
  const rc: number = tmux_lib.tmux_newSession(session);
  if (rc !== 0) {
    throw new Error("tmux_newSession failed; tmux likely unavailable");
  }
  addTeardown((): void => {
    tmux_lib.tmux_killSession(session);
  });
  return session;
}
