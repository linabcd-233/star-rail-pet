import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import type { Skeleton } from "@esotericsoftware/spine-core";
import type { SpineCanvas } from "@esotericsoftware/spine-webgl";
import { hitTestAtClientPoint } from "../spine/hitTest";
import type { GazeState } from "../ui/gaze";
import { syncGazeFromClient } from "../ui/gaze";
import { isTauri } from "./env";
import { setIgnoreCursorEventsSafe } from "./pointerPassthrough";

export type PointerLoopDeps = {
  canvas: HTMLCanvasElement;
  getSpineCanvas: () => SpineCanvas | undefined;
  getSkeleton: () => Skeleton | null;
  gaze: GazeState;
  isClientPointOverPomoPanel: (clientX: number, clientY: number) => boolean;
  isClientPointOverCharacterContextMenu: (clientX: number, clientY: number) => boolean;
};

export function createTauriPointerLoop(deps: PointerLoopDeps) {
  let tauriPointerLoopTimer: number | null = null;

  async function tauriPointerTick() {
    if (!isTauri) return;
    const sp = deps.getSpineCanvas();
    const skeleton = deps.getSkeleton();
    if (!sp || !skeleton) return;

    const [cursor, innerPos, scale] = await Promise.all([
      cursorPosition(),
      getCurrentWindow().innerPosition(),
      getCurrentWindow().scaleFactor(),
    ]);

    const clientX = (cursor.x - innerPos.x) / scale;
    const clientY = (cursor.y - innerPos.y) / scale;

    syncGazeFromClient(deps.gaze, deps.canvas, clientX, clientY);

    const overPomo = deps.isClientPointOverPomoPanel(clientX, clientY);
    const overCharMenu = deps.isClientPointOverCharacterContextMenu(clientX, clientY);
    const inside = hitTestAtClientPoint(sp, deps.canvas, skeleton, clientX, clientY);
    if (overPomo || overCharMenu) {
      deps.canvas.style.cursor = "default";
      setIgnoreCursorEventsSafe(false);
    } else {
      deps.canvas.style.cursor = inside ? "grab" : "default";
      if (inside) setIgnoreCursorEventsSafe(false);
      else setIgnoreCursorEventsSafe(true);
    }
  }

  function ensureTauriPointerLoop() {
    if (!isTauri || tauriPointerLoopTimer != null) return;
    tauriPointerLoopTimer = window.setInterval(() => {
      void tauriPointerTick();
    }, 33);
  }

  return { tauriPointerTick, ensureTauriPointerLoop };
}
