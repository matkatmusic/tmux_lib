import { tmux_lib } from "./tmux_lib.ts";

interface TurnState {
  has_grown: boolean;
  quiet_since: number | undefined;
  watch_match: string | undefined;
  screen: string;
}

function isTrustPromptScreen(screen: string): boolean {
  const lowered: string = screen.toLowerCase();
  return lowered.includes("trust this folder") || lowered.includes("trust the files");
}

function sendMultiSelectKeys(pane_target: string, screen: string): void {
  const has_checked_option: boolean = screen.includes("[✔] ");
  if (!has_checked_option) {
    tmux_lib.tmux_sendEnter(pane_target);
  }
  tmux_lib.tmux_sendKeys(pane_target, "Right");
}

function sendDialogKeys(pane_target: string, screen: string, is_trust_prompt: boolean, is_dialog: boolean): void {
  const shouldPressDown: boolean = is_trust_prompt && screen.includes("❯ No, exit");
  const is_multi_select: boolean = is_dialog && (screen.includes("[ ] ") || screen.includes("[✔] "));
  if (shouldPressDown) {
    tmux_lib.tmux_sendKeys(pane_target, "Down");
  }
  else if (is_multi_select) {
    sendMultiSelectKeys(pane_target, screen);
  }
  else if (is_dialog) {
    tmux_lib.tmux_sendEnter(pane_target);
  }
}

function validateSignedIn(pane_id: string, content: string): void {
  const lowered: string = content.toLowerCase();
  const hasLoginMethod: boolean = lowered.includes("login method");
  const hasLoginPath: boolean = lowered.includes("/login");
  const isSignedOut: boolean = hasLoginMethod || hasLoginPath;
  if (isSignedOut) {
    throw new Error(`Claude is signed out in pane ${pane_id}. Sign in once, then try again.`);
  }
}

function executeReadinessPoll(pane_id: string, content: string, poll_seconds: number, dialog_wait_seconds: number): boolean {
  validateSignedIn(pane_id, content);
  const answeredDialog: boolean = tmux_lib.tmux_answerDialog(pane_id, content);
  if (answeredDialog) {
    tmux_lib.sleep(dialog_wait_seconds);
    return false;
  }
  const isReady: boolean = content.includes("❯");
  if (!isReady) {
    tmux_lib.sleep(poll_seconds);
  }
  return isReady;
}

function findWatchMatch(screen: string, watch_regex: RegExp | undefined, watch_match: string | undefined): string | undefined {
  const hasWatchRegex: boolean = watch_regex !== undefined;
  const hasNoWatchMatch: boolean = watch_match === undefined;
  const shouldWatch: boolean = hasWatchRegex && hasNoWatchMatch;
  if (!shouldWatch) {
    return watch_match;
  }
  const found: RegExpMatchArray | null = screen.match(watch_regex!);
  return found ? found[0] : watch_match;
}

function applyActivity(state: TurnState, check_activity: () => boolean): void {
  const hasActivity: boolean = check_activity();
  if (hasActivity) {
    state.has_grown = true;
    state.quiet_since = undefined;
  }
}

function executeTurnDialog(pane_target: string, state: TurnState): boolean {
  const answeredDialog: boolean = tmux_lib.tmux_answerDialog(pane_target, state.screen);
  if (answeredDialog) {
    state.quiet_since = undefined;
    tmux_lib.sleep(1);
  }
  return answeredDialog;
}

function computeQuietSince(state: TurnState, busy_regex: RegExp): number | undefined {
  const busyIndex: number = state.screen.search(busy_regex);
  const isBusy: boolean = busyIndex !== -1;
  if (isBusy) {
    return undefined;
  }
  const isNotQuietYet: boolean = state.quiet_since === undefined;
  const startsQuiet: boolean = state.has_grown && isNotQuietYet;
  return startsQuiet ? Date.now() : state.quiet_since;
}

function isQuietSettled(quiet_since: number | undefined, settle_seconds: number): boolean {
  const hasQuietStart: boolean = quiet_since !== undefined;
  if (!hasQuietStart) {
    return false;
  }
  const quietMs: number = Date.now() - quiet_since!;
  return quietMs >= settle_seconds * 1000;
}

function executeTurnPoll(pane_target: string, state: TurnState, busy_regex: RegExp, settle_seconds: number, check_activity: () => boolean, watch_regex: RegExp | undefined): boolean {
  state.screen = tmux_lib.tmux_capturePane(pane_target);
  state.watch_match = findWatchMatch(state.screen, watch_regex, state.watch_match);
  applyActivity(state, check_activity);
  const answeredDialog: boolean = executeTurnDialog(pane_target, state);
  if (answeredDialog) {
    return false;
  }
  state.quiet_since = computeQuietSince(state, busy_regex);
  const hasSettled: boolean = isQuietSettled(state.quiet_since, settle_seconds);
  if (!hasSettled) {
    tmux_lib.sleep(0.5);
  }
  return hasSettled;
}

export const tmux_lib_wait = {
  // Answers a dialog in `screen` with Down, Enter or Right. True if a dialog was shown.
  tmux_answerDialog(pane_target: string, screen: string): boolean {
    const is_trust_prompt: boolean = isTrustPromptScreen(screen);
    const is_review_screen: boolean = screen.includes("Ready to submit your answers?");
    const is_dialog: boolean = screen.includes("Esc to cancel") || is_trust_prompt || is_review_screen;
    sendDialogKeys(pane_target, screen, is_trust_prompt, is_dialog);
    return is_dialog;
  },

  // Polls for the ready glyph, answering dialogs; throws if signed out. Returns 0 when ready, 1 after timeout_seconds.
  tmux_waitForClaudeReadiness(pane_id: string, timeout_seconds: number = 120, poll_seconds: number = 1, dialog_wait_seconds: number = 2): number {
    const polls: number = Math.ceil(timeout_seconds / poll_seconds);
    for (let i: number = 0; i < polls; i++) {
      const content: string = tmux_lib.tmux_capturePane(pane_id);
      const isReady: boolean = executeReadinessPoll(pane_id, content, poll_seconds, dialog_wait_seconds);
      if (isReady) {
        return 0;
      }
    }
    tmux_lib.stderrWrite(`[tmux-launcher] tmux_waitForClaudeReadiness: timed out after ${timeout_seconds}s waiting for pane '${pane_id}'\n`);
    return 1;
  },

  // Waits for the pane to settle after activity. Returns the first watch_regex match.
  tmux_waitForTurnEnd(pane_target: string, busy_regex: RegExp, settle_seconds: number, timeout_seconds: number, check_activity: () => boolean, watch_regex: RegExp | undefined = undefined): string | undefined {
    const state: TurnState = { has_grown: false, quiet_since: undefined, watch_match: undefined, screen: "" };
    const deadline: number = Date.now() + timeout_seconds * 1000;
    while (Date.now() < deadline) {
      const hasSettled: boolean = executeTurnPoll(pane_target, state, busy_regex, settle_seconds, check_activity, watch_regex);
      if (hasSettled) {
        return state.watch_match;
      }
    }
    throw new Error(`turn did not end in pane ${pane_target}. Pane:\n${state.screen}`);
  },

  // Polls once a second until the pane is gone, answering dialogs. Returns true if it closed, false on timeout.
  tmux_waitForPaneClose(pane_target: string, timeout_seconds: number): boolean {
    const deadline: number = Date.now() + timeout_seconds * 1000;
    while (Date.now() < deadline) {
      const paneExists: boolean = tmux_lib.tmux_paneExists(pane_target);
      if (!paneExists) {
        return true;
      }
      tmux_lib.tmux_answerDialog(pane_target, tmux_lib.tmux_capturePane(pane_target));
      tmux_lib.sleep(1);
    }
    return false;
  },
};
