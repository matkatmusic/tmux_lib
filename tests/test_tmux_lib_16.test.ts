import { afterEach, expect, setSystemTime, spyOn } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import { test } from "./test_tmux_lib_helpers_a.ts";
import { pyLambda, useTestHooks } from "./test_tmux_lib_helpers_c.ts";

useTestHooks();
afterEach((): void => {
  setSystemTime();
});

const BUSY: RegExp = /^\S \w+…|…\s*\(\d+[ms]|esc to interrupt/m;

// Fakes sleep so it moves the clock; returns the recorded sleep lengths.
function fakeClock(): number[] {
  const sleeps: number[] = [];
  setSystemTime(new Date(1_000_000));
  spyOn(tmux_lib, "sleep").mockImplementation(pyLambda(1, 1, (s: number): void => {
    sleeps.push(s);
    setSystemTime(new Date(Date.now() + s * 1000));
  }));
  return sleeps;
}

// Fakes capture: one screen per poll, the last one repeats. Records the pane asked for.
function fakeScreens(screens: string[]): string[] {
  const panes: string[] = [];
  spyOn(tmux_lib, "tmux_capturePane").mockImplementation(pyLambda(1, 2, (pane: string, _l?: number): string => {
    panes.push(pane);
    return screens[Math.min(panes.length - 1, screens.length - 1)]!;
  }));
  return panes;
}

function fakeKeys(): string[] {
  const keys: string[] = [];
  spyOn(tmux_lib, "tmux_sendEnter").mockImplementation(pyLambda(1, 1, (pane: string): number => {
    keys.push(`${pane}:Enter`);
    return 0;
  }));
  return keys;
}

function activityOnPolls(...polls: number[]): () => boolean {
  let count: number = 0;
  return (): boolean => {
    count += 1;
    return polls.includes(count);
  };
}

test("test_tmux_waitForTurnEnd_returns_after_quiet_for_the_settle_time", (): void => {
  const sleeps: number[] = fakeClock();
  const panes: string[] = fakeScreens(["✻ Thinking…", "✻ Thinking…", "idle"]);
  expect(tmux_lib.tmux_waitForTurnEnd("%3", BUSY, 2, 60, activityOnPolls(1))).toBeUndefined();
  expect(sleeps).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  expect(new Set(panes)).toEqual(new Set(["%3"]));
});

test("test_tmux_waitForTurnEnd_restarts_the_quiet_timer_on_new_activity", (): void => {
  const sleeps: number[] = fakeClock();
  fakeScreens(["idle"]);
  tmux_lib.tmux_waitForTurnEnd("%3", BUSY, 2, 60, activityOnPolls(1, 4));
  expect(sleeps).toHaveLength(7);
});

test("test_tmux_waitForTurnEnd_throws_with_pane_text_when_nothing_settles", (): void => {
  fakeClock();
  fakeScreens(["idle screen"]);
  const call = (): unknown => tmux_lib.tmux_waitForTurnEnd("%3", BUSY, 2, 5, activityOnPolls());
  expect(call).toThrow(/did not end in pane %3.*idle screen/s);
});

test("test_tmux_waitForTurnEnd_answers_a_dialog_and_waits_one_second", (): void => {
  const sleeps: number[] = fakeClock();
  const keys: string[] = fakeKeys();
  fakeScreens(["Pick one\nEsc to cancel", "idle"]);
  tmux_lib.tmux_waitForTurnEnd("%3", BUSY, 2, 60, activityOnPolls(1));
  expect(keys).toEqual(["%3:Enter"]);
  expect(sleeps).toEqual([1, 0.5, 0.5, 0.5, 0.5]);
});

test("test_tmux_waitForTurnEnd_returns_the_first_watch_regex_match", (): void => {
  fakeClock();
  fakeScreens(["working", "SUB-1 here", "SUB-2 there", "idle"]);
  const found: string | undefined = tmux_lib.tmux_waitForTurnEnd("%3", BUSY, 1, 60, activityOnPolls(1), /SUB-\d+/);
  expect(found).toBe("SUB-1");
});

test("test_tmux_waitForPaneClose_returns_true_once_the_pane_is_gone", (): void => {
  const sleeps: number[] = fakeClock();
  const keys: string[] = fakeKeys();
  const answers: boolean[] = [true, true, false];
  spyOn(tmux_lib, "tmux_paneExists").mockImplementation(pyLambda(1, 1, (_p: string): boolean => answers.shift()!));
  fakeScreens(["Esc to cancel"]);
  expect(tmux_lib.tmux_waitForPaneClose("%3", 60)).toBe(true);
  expect(sleeps).toEqual([1, 1]);
  expect(keys).toEqual(["%3:Enter", "%3:Enter"]);
});

test("test_tmux_waitForPaneClose_returns_false_on_timeout", (): void => {
  const sleeps: number[] = fakeClock();
  spyOn(tmux_lib, "tmux_paneExists").mockImplementation(pyLambda(1, 1, (_p: string): boolean => true));
  fakeScreens(["working"]);
  expect(tmux_lib.tmux_waitForPaneClose("%3", 3)).toBe(false);
  expect(sleeps).toEqual([1, 1, 1]);
});
