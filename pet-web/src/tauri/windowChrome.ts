import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { cameraState } from "../spine/camera";
import { clamp } from "../utils/math";
import { isTauri } from "./env";

export const WIN_BASE_W = 360;
export const WIN_BASE_H = 300;
export const WIN_MAX_W = 960;
export const WIN_MAX_H = 800;
export const SCALE_MAX = Math.min(WIN_MAX_W / WIN_BASE_W, WIN_MAX_H / WIN_BASE_H);

let resizePending: number | null = null;

export function scheduleWindowResizeToScale() {
  if (!isTauri) return;
  if (resizePending != null) window.clearTimeout(resizePending);
  resizePending = window.setTimeout(() => {
    resizePending = null;
    void applyWindowResizeToScale();
  }, 40);
}

export async function applyWindowResizeToScale() {
  const win = getCurrentWindow();
  await win.setMinSize(new LogicalSize(WIN_BASE_W, WIN_BASE_H));
  await win.setMaxSize(new LogicalSize(WIN_MAX_W, WIN_MAX_H));

  const winScale = clamp(cameraState.userScale, 1, SCALE_MAX);
  const w = Math.round(clamp(WIN_BASE_W * winScale, WIN_BASE_W, WIN_MAX_W));
  const h = Math.round(clamp(WIN_BASE_H * winScale, WIN_BASE_H, WIN_MAX_H));
  await win.setSize(new LogicalSize(w, h));
}
