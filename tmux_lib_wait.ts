import { tmux_lib } from "./tmux_lib.ts";

export const tmux_lib_wait = {
  // Answers a dialog in `screen`: Down if No is selected, else Enter. True if one was shown.
  tmux_answerDialog(pane_target: string, screen: string): boolean {
    const lowered: string = screen.toLowerCase();
    const is_trust_prompt: boolean = lowered.includes("trust this folder") || lowered.includes("trust the files");
    const is_dialog: boolean = screen.includes("Esc to cancel") || is_trust_prompt;
    const is_no_selected: boolean = screen.includes("❯ No, exit");
    const shouldPressDown: boolean = is_trust_prompt && is_no_selected;
    if (shouldPressDown) {
      tmux_lib.tmux_sendKeys(pane_target, "Down");
    }
    else if (is_dialog) {
      tmux_lib.tmux_sendEnter(pane_target);
    }
    return is_dialog;
  },

  // Polls for the ready glyph, answering dialogs; throws if signed out. Returns 0 when ready, 1 on timeout.
  tmux_waitForClaudeReadiness(
    pane_id: string,
    polls: number = 120,
    poll_seconds: number = 1,
    dialog_wait_seconds: number = 2,
  ): number {
    for (let i: number = 0; i < polls; i++) {
      const content: string = tmux_lib.tmux_capturePane(pane_id);
      const lowered: string = content.toLowerCase();
      const hasLoginMethod: boolean = lowered.includes("login method");
      const hasLoginPath: boolean = lowered.includes("/login");
      const isSignedOut: boolean = hasLoginMethod || hasLoginPath;
      if (isSignedOut) {
        throw new Error(`Claude is signed out in pane ${pane_id}. Sign in once, then try again.`);
      }
      const answeredDialog: boolean = tmux_lib.tmux_answerDialog(pane_id, content);
      if (answeredDialog) {
        tmux_lib.sleep(dialog_wait_seconds);
        continue;
      }
      const isReady: boolean = content.includes("❯");
      if (isReady) {
        return 0;
      }
      tmux_lib.sleep(poll_seconds);
    }
    tmux_lib.stderrWrite(
      `[tmux-launcher] tmux_waitForClaudeReadiness: timed out after ${polls} polls waiting for pane '${pane_id}'\n`,
    );
    return 1;
  },

  // Waits for the pane to settle after activity. Returns the first watch_regex match.
  tmux_waitForTurnEnd(
    pane_target: string,
    busy_regex: RegExp,
    settle_seconds: number,
    timeout_seconds: number,
    check_activity: () => boolean,
    watch_regex: RegExp | undefined = undefined,
  ): string | undefined {
    let has_grown: boolean = false;
    let quiet_since: number | undefined = undefined;
    let watch_match: string | undefined = undefined;
    let screen: string = "";
    const deadline: number = Date.now() + timeout_seconds * 1000;
    while (Date.now() < deadline) {
      screen = tmux_lib.tmux_capturePane(pane_target);
      const hasWatchRegex: boolean = watch_regex !== undefined;
      const hasNoWatchMatch: boolean = watch_match === undefined;
      const shouldWatch: boolean = hasWatchRegex && hasNoWatchMatch;
      if (shouldWatch) {
        const found: RegExpMatchArray | null = screen.match(watch_regex!);
        if (found) {
          watch_match = found[0];
        }
      }
      const hasActivity: boolean = check_activity();
      if (hasActivity) {
        has_grown = true;
        quiet_since = undefined;
      }
      const answeredDialog: boolean = tmux_lib.tmux_answerDialog(pane_target, screen);
      if (answeredDialog) {
        quiet_since = undefined;
        tmux_lib.sleep(1);
        continue;
      }
      const busyIndex: number = screen.search(busy_regex);
      const isBusy: boolean = busyIndex !== -1;
      if (isBusy) {
        quiet_since = undefined;
      }
      else {
        const isNotQuietYet: boolean = quiet_since === undefined;
        const startsQuiet: boolean = has_grown && isNotQuietYet;
        if (startsQuiet) {
          quiet_since = Date.now();
        }
      }
      const hasQuietStart: boolean = quiet_since !== undefined;
      if (hasQuietStart) {
        const quietMs: number = Date.now() - quiet_since!;
        const hasSettled: boolean = quietMs >= settle_seconds * 1000;
        if (hasSettled) {
          return watch_match;
        }
      }
      tmux_lib.sleep(0.5);
    }
    throw new Error(`turn did not end in pane ${pane_target}. Pane:\n${screen}`);
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
