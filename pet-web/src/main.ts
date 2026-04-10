import "./style.css";
import type { AnimationState, Skeleton } from "@esotericsoftware/spine-core";
import type { SpineCanvas } from "@esotericsoftware/spine-webgl";
import { SpineCanvas as SpineCanvasCtor } from "@esotericsoftware/spine-webgl";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { mountAppShell } from "./app/refs";
import { bindPomodoro } from "./pomodoro/runtime";
import {
  clampPomoPanelPosition,
  isClientPointOverPomoPanel,
  setupPomoPanelDrag,
  syncPomoPanelWidthFromButtons,
} from "./pomodoro/panel";
import { cameraState } from "./spine/camera";
import { hitTestAtClientPoint } from "./spine/hitTest";
import { createSpineCanvasApp } from "./spine/canvasApp";
import * as assets from "./spine/assets";
import { createGazeState, syncGazeFromClient } from "./ui/gaze";
import { layoutSpeechBubble } from "./ui/speechBubble";
import { isClientPointOverCharacterContextMenu, setupCharacterContextMenu } from "./ui/contextMenu";
import { isTauri } from "./tauri/env";
import { disableBackgroundClickThrough } from "./tauri/pointerPassthrough";
import { createTauriPointerLoop } from "./tauri/pointerLoop";
import { SCALE_MAX, scheduleWindowResizeToScale } from "./tauri/windowChrome";
import { clamp } from "./utils/math";

const refs = mountAppShell();
const { canvas } = refs;

const gaze = createGazeState();

const spineState: { skeleton: Skeleton | null; animState: AnimationState | null } = {
  skeleton: null,
  animState: null,
};

bindPomodoro(refs, () => spineState.skeleton, () => spineState.animState);

function getSpineCanvas(): SpineCanvas | undefined {
  return (window as unknown as { __spineCanvas?: SpineCanvas }).__spineCanvas;
}

const pointerLoop = createTauriPointerLoop({
  canvas: refs.canvas,
  getSpineCanvas,
  getSkeleton: () => spineState.skeleton,
  gaze,
  isClientPointOverPomoPanel: (x, y) => isClientPointOverPomoPanel(refs, x, y),
  isClientPointOverCharacterContextMenu: (x, y) => isClientPointOverCharacterContextMenu(refs, x, y),
});

setupCharacterContextMenu(refs, {
  getSpineCanvas,
  getSkeleton: () => spineState.skeleton,
  onMenuHidden: isTauri ? () => void pointerLoop.tauriPointerTick() : undefined,
});

if (!isTauri) {
  window.addEventListener("mousemove", (e) => {
    syncGazeFromClient(gaze, canvas, e.clientX, e.clientY);
  });
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const cycleParam = new URLSearchParams(window.location.search).get("cycle");
const cycleMode = isTauri ? cycleParam !== "0" : cycleParam === "1";
const animName = assets.animFromQuery(assets.IDLE_ANIM);

new SpineCanvasCtor(canvas, {
  pathPrefix: "/argenti/",
  webglConfig: {
    preserveDrawingBuffer: true,
  },
  app: createSpineCanvasApp({
    refs,
    spineState,
    isTauri,
    cycleMode,
    animName,
    gaze,
    ensureTauriPointerLoop: pointerLoop.ensureTauriPointerLoop,
  }),
});

setupPomoPanelDrag(refs);

window.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (isClientPointOverPomoPanel(refs, e.clientX, e.clientY)) return;
  if (isClientPointOverCharacterContextMenu(refs, e.clientX, e.clientY)) return;
  const sp = getSpineCanvas();
  if (!sp || !spineState.skeleton) return;
  if (hitTestAtClientPoint(sp, canvas, spineState.skeleton, e.clientX, e.clientY)) {
    e.preventDefault();
    if (!isTauri) return;
    disableBackgroundClickThrough();
    void getCurrentWindow().startDragging();
  }
});

if (!isTauri) {
  window.addEventListener("pointermove", (e) => {
    const sp = getSpineCanvas();
    if (!sp || !spineState.skeleton) return;
    if (isClientPointOverPomoPanel(refs, e.clientX, e.clientY)) {
      canvas.style.cursor = "default";
      return;
    }
    const inside = hitTestAtClientPoint(sp, canvas, spineState.skeleton, e.clientX, e.clientY);
    canvas.style.cursor = inside ? "grab" : "default";
  });
}

window.addEventListener(
  "wheel",
  (e) => {
    const sp = getSpineCanvas();
    if (!sp || !spineState.skeleton) return;
    if (!e.ctrlKey) return;
    if (!hitTestAtClientPoint(sp, canvas, spineState.skeleton, e.clientX, e.clientY)) return;
    e.preventDefault();
    const step = Math.exp((-e.deltaY / 300) * 0.25);
    cameraState.userScale = clamp(cameraState.userScale * step, 0.35, SCALE_MAX);
    if (isTauri) scheduleWindowResizeToScale();
  },
  { passive: false }
);

requestAnimationFrame(() => {
  syncPomoPanelWidthFromButtons(refs);
  requestAnimationFrame(() => syncPomoPanelWidthFromButtons(refs));
});

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  clampPomoPanelPosition(refs);
  syncPomoPanelWidthFromButtons(refs);
  const sp = getSpineCanvas();
  if (sp) layoutSpeechBubble(sp, spineState.skeleton, refs);
});
