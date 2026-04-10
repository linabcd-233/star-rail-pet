import type { AnimationState, Skeleton } from "@esotericsoftware/spine-core";
import type { AppDomRefs } from "../app/refs";
import * as assets from "../spine/assets";
import { hideSpeechBubble, showSpeechBubble } from "../ui/speechBubble";
import { syncPomoPanelWidthFromButtons } from "./panel";

export type PomoPhase = "idle" | "running" | "paused";

let refs: AppDomRefs | null = null;
let getSkeleton: () => Skeleton | null = () => null;
let getAnimState: () => AnimationState | null = () => null;

/** 番茄钟与台词计时（跨模块可变状态，避免对 import 绑定赋值） */
export const pomo = {
  phase: "idle" as PomoPhase,
  remainingMs: 25 * 60 * 1000,
  defaultDurationMs: 25 * 60 * 1000,
  speechEndAt: 0,
  speechAfter: null as (() => void) | null,
  startIdleRef: null as (() => void) | null,
};

export function bindPomodoro(r: AppDomRefs, sk: () => Skeleton | null, as: () => AnimationState | null) {
  refs = r;
  getSkeleton = sk;
  getAnimState = as;
}

export function isSpeechLocked() {
  return Date.now() < pomo.speechEndAt;
}

export function pickLine(lines: string[]) {
  return lines[(Math.random() * lines.length) | 0];
}

export function formatMmSs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function parseMmSsToMs(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  const min = parseInt(m[1]!, 10);
  const sec = parseInt(m[2]!, 10);
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
  if (sec < 0 || sec > 59) return null;
  if (min < 1 || min > 180) return null;
  return (min * 60 + sec) * 1000;
}

export function syncIdlePomoFromInput() {
  if (!refs) return;
  if (pomo.phase !== "idle" || isSpeechLocked()) return;
  const ms = parseMmSsToMs(refs.pomoTimeEl.value);
  if (ms == null) {
    refs.pomoTimeEl.value = formatMmSs(pomo.remainingMs);
    return;
  }
  pomo.defaultDurationMs = ms;
  pomo.remainingMs = ms;
  refs.pomoTimeEl.value = formatMmSs(pomo.remainingMs);
}

export function updatePomoTimeDisplay() {
  if (!refs) return;
  const { pomoTimeEl, root } = refs;
  pomoTimeEl.value = formatMmSs(pomo.remainingMs);
  pomoTimeEl.readOnly = pomo.phase !== "idle" || isSpeechLocked();
  const startBtn = root.querySelector<HTMLButtonElement>("#pomo-start");
  const pauseBtn = root.querySelector<HTMLButtonElement>("#pomo-pause");
  if (startBtn && pauseBtn) {
    const locked = isSpeechLocked();
    startBtn.textContent = pomo.phase === "paused" ? "继续" : "开始";
    startBtn.disabled = pomo.phase === "running" || locked;
    pauseBtn.disabled = pomo.phase !== "running" || locked;
  }
  syncPomoPanelWidthFromButtons(refs);
}

export function beginSpeech(text: string, durationMs: number, after?: () => void) {
  if (!refs) return;
  pomo.speechEndAt = Date.now() + durationMs;
  pomo.speechAfter = after ?? null;
  showSpeechBubble(refs.speechBubbleEl, text);
  const animState = getAnimState();
  const skeleton = getSkeleton();
  if (animState && skeleton?.data.findAnimation(assets.TALK_ANIM)) {
    animState.setAnimation(0, assets.TALK_ANIM, true);
  }
}

export function resetSpeechAndBubble() {
  if (!refs) return;
  pomo.speechEndAt = 0;
  hideSpeechBubble(refs.speechBubbleEl);
  pomo.speechAfter = null;
}
