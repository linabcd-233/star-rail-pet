import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./env";

let ignoreCursorEnabled = false;
let ignoreCursorPending: Promise<void> | null = null;

export function setIgnoreCursorEventsSafe(ignore: boolean) {
  if (!isTauri) return;
  if (ignoreCursorEnabled === ignore) return;
  if (ignoreCursorPending) return;

  ignoreCursorEnabled = ignore;
  ignoreCursorPending = getCurrentWindow()
    .setIgnoreCursorEvents(ignore)
    .catch(() => {})
    .finally(() => {
      ignoreCursorPending = null;
    });
}

export function enableBackgroundClickThrough() {
  setIgnoreCursorEventsSafe(true);
}

export function disableBackgroundClickThrough() {
  setIgnoreCursorEventsSafe(false);
}
