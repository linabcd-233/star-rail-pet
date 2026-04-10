import type { Skeleton } from "@esotericsoftware/spine-core";
import { Vector3 } from "@esotericsoftware/spine-webgl";
import type { SpineCanvas } from "@esotericsoftware/spine-webgl";
import { clamp } from "../utils/math";
import { fitCamera } from "../spine/camera";

export const SPEECH_ANCHOR_BONES = ["身体4", "左看右看"] as const;
export const SPEECH_FACE_OFFSET_X = 36;
export const SPEECH_FACE_OFFSET_Y = 40;
export const SPEECH_POMO_GAP = 8;

export function rectsOverlap2D(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay);
}

export function showSpeechBubble(el: HTMLElement, text: string) {
  el.textContent = text;
  el.hidden = false;
}

export function hideSpeechBubble(el: HTMLElement) {
  el.textContent = "";
  el.hidden = true;
}

type LayoutRefs = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  pomoPanel: HTMLElement;
  speechBubbleEl: HTMLElement;
};

/** 将气泡锚在头部骨骼右侧（屏幕坐标）；与番茄钟重叠时先右移，仍重叠则移到面板下缘以下。 */
export function layoutSpeechBubble(
  sp: SpineCanvas,
  skeleton: Skeleton | null,
  refs: LayoutRefs
) {
  const { root, canvas, pomoPanel, speechBubbleEl } = refs;
  if (!skeleton || speechBubbleEl.hidden) return;
  fitCamera(sp, canvas, skeleton);
  let bone = null as ReturnType<Skeleton["findBone"]>;
  for (const name of SPEECH_ANCHOR_BONES) {
    bone = skeleton.findBone(name);
    if (bone) break;
  }
  if (!bone) return;

  const cam = sp.renderer.camera;
  const v = new Vector3(bone.worldX, bone.worldY, 0);
  cam.worldToScreen(v, canvas.width, canvas.height);

  const cr = canvas.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  const pr = pomoPanel.getBoundingClientRect();

  const anchorX = cr.left + (v.x / canvas.width) * cr.width;
  const anchorY = cr.top + (v.y / canvas.height) * cr.height;

  const pomoLeft = pr.left - rr.left;
  const pomoTop = pr.top - rr.top;
  const pomoW = pr.width;
  const pomoH = pr.height;

  let left = anchorX - rr.left + SPEECH_FACE_OFFSET_X;
  let top = anchorY - rr.top + SPEECH_FACE_OFFSET_Y;

  speechBubbleEl.style.left = `${left}px`;
  speechBubbleEl.style.top = `${top}px`;
  speechBubbleEl.style.bottom = "auto";
  speechBubbleEl.style.right = "auto";
  speechBubbleEl.style.transform = "translateY(-50%)";

  let bw = speechBubbleEl.offsetWidth;
  let bh = speechBubbleEl.offsetHeight;
  if (bw < 1 || bh < 1) return;

  const bubbleTop = (tc: number) => tc - bh / 2;

  function overlapsPomo(l: number, tc: number) {
    return rectsOverlap2D(l, bubbleTop(tc), bw, bh, pomoLeft, pomoTop, pomoW, pomoH);
  }

  if (overlapsPomo(left, top)) {
    let tryLeft = left;
    for (let i = 0; i < 48 && overlapsPomo(tryLeft, top); i++) {
      tryLeft += 8;
    }
    if (!overlapsPomo(tryLeft, top)) {
      left = tryLeft;
    } else {
      left = pomoLeft + pomoW + SPEECH_POMO_GAP;
      if (overlapsPomo(left, top)) {
        top = pomoTop + pomoH + SPEECH_POMO_GAP + bh / 2 + SPEECH_FACE_OFFSET_Y;
        left = anchorX - rr.left + SPEECH_FACE_OFFSET_X;
        bw = speechBubbleEl.offsetWidth;
        bh = speechBubbleEl.offsetHeight;
      }
    }
  }

  left = clamp(left, 0, Math.max(0, rr.width - bw));
  const topCenter = clamp(top, bh / 2, Math.max(bh / 2, rr.height - bh / 2));
  speechBubbleEl.style.left = `${left}px`;
  speechBubbleEl.style.top = `${topCenter}px`;
}
