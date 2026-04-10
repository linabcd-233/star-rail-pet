import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Physics,
  Skeleton,
  SkeletonJson,
} from "@esotericsoftware/spine-core";
import { ResizeMode, SpineCanvas } from "@esotericsoftware/spine-webgl";
import type { AppDomRefs } from "../app/refs";
import * as assets from "./assets";
import { fitCamera, setSkeletonPoseAndCamera } from "./camera";
import {
  beginSpeech,
  isSpeechLocked,
  parseMmSsToMs,
  pickLine,
  pomo,
  resetSpeechAndBubble,
  syncIdlePomoFromInput,
  updatePomoTimeDisplay,
} from "../pomodoro/runtime";
import { hideSpeechBubble, layoutSpeechBubble } from "../ui/speechBubble";
import { syncPomoPanelWidthFromButtons } from "../pomodoro/panel";
import { applyGazeToSkeleton, type GazeState } from "../ui/gaze";
import { enableBackgroundClickThrough } from "../tauri/pointerPassthrough";

const EMOJIS = ["emoji_0", "emoji_1", "emoji_2", "emoji_5"] as const;
type EmojiName = (typeof EMOJIS)[number];

export type SpineState = {
  skeleton: Skeleton | null;
  animState: AnimationState | null;
};

export type SpineCanvasAppConfig = {
  refs: AppDomRefs;
  spineState: SpineState;
  isTauri: boolean;
  cycleMode: boolean;
  animName: string;
  gaze: GazeState;
  ensureTauriPointerLoop: () => void;
};

export function createSpineCanvasApp(cfg: SpineCanvasAppConfig) {
  const { refs, spineState, isTauri: tauri, cycleMode, animName, gaze, ensureTauriPointerLoop } = cfg;
  const { canvas, statusEl, pomoTimeEl } = refs;

  return {
    loadAssets(sp: SpineCanvas) {
      sp.assetManager.loadTextureAtlas(assets.ATLAS);
      sp.assetManager.loadJson(assets.SKEL);
    },
    initialize(sp: SpineCanvas) {
      (window as any).__spineCanvas = sp;

      const atlas = sp.assetManager.require(assets.ATLAS);
      const jsonRaw = sp.assetManager.require(assets.SKEL);
      const skelJson = new SkeletonJson(new AtlasAttachmentLoader(atlas));
      const skelData = skelJson.readSkeletonData(jsonRaw);
      spineState.skeleton = new Skeleton(skelData);
      const asData = new AnimationStateData(skelData);
      spineState.animState = new AnimationState(asData);

      const skeleton = spineState.skeleton;
      const animState = spineState.animState;

      const MIX = 0.16;
      for (const e of EMOJIS) {
        asData.setMix(assets.IDLE_ANIM, e, MIX);
        asData.setMix(e, assets.IDLE_ANIM, MIX);
      }

      const emojiDur: Record<EmojiName, number> = {
        emoji_0: 1.1,
        emoji_1: 1.6,
        emoji_2: 3.2,
        emoji_5: 2.6,
      };

      let phase: "idle" | "emoji" = "idle";
      let idleHold = 0;
      let emojiHold = 0;
      let pendingEmoji: EmojiName | null = null;

      function randRange(a: number, b: number) {
        return a + (b - a) * Math.random();
      }
      function pickEmoji(): EmojiName {
        return EMOJIS[(Math.random() * EMOJIS.length) | 0];
      }
      function idleEntryPhaseNearStart(windowSec: number): boolean {
        if (!animState) return false;
        const entry = animState.getCurrent(0);
        if (!entry || entry.animation?.name !== assets.IDLE_ANIM) return false;
        const dur = Math.max(1e-6, entry.animationEnd - entry.animationStart);
        const t = ((entry.trackTime % dur) + dur) % dur;
        return t <= windowSec || dur - t <= windowSec;
      }

      function startIdle() {
        if (!animState) return;
        animState.setAnimation(0, assets.IDLE_ANIM, true);
        phase = "idle";
        pendingEmoji = null;
        idleHold = randRange(3, 5);
      }

      function startEmoji(e: EmojiName) {
        if (!animState) return;
        animState.setAnimation(0, e, true);
        phase = "emoji";
        emojiHold = emojiDur[e];
      }

      if (cycleMode) {
        startIdle();
        statusEl.textContent = tauri
          ? "桌宠轮播：idel + 表情（Tauri 默认开启，?cycle=0 关闭）"
          : "桌宠轮播：idel + 表情（?cycle=1 开启）";
      } else {
        if (!skelData.findAnimation(animName)) {
          const names = skelData.animations.map((a) => a.name).join(", ");
          statusEl.textContent = `未找到动画「${animName}」。可用: ${names}`;
          return;
        }
        animState.setAnimation(0, animName, true);
        statusEl.textContent = `Spine 官方运行时 | ${animName}（?anim= 切换，?cycle=1 轮播）`;
      }

      setSkeletonPoseAndCamera(sp, canvas, skeleton);
      if (tauri) {
        enableBackgroundClickThrough();
        ensureTauriPointerLoop();
      }

      pomo.startIdleRef = startIdle;
      updatePomoTimeDisplay();
      pomoTimeEl.addEventListener("change", () => syncIdlePomoFromInput());
      pomoTimeEl.addEventListener("blur", () => syncIdlePomoFromInput());
      refs.root.querySelector("#pomo-start")!.addEventListener("click", () => {
        if (isSpeechLocked()) return;
        if (pomo.phase === "idle") {
          const ms = parseMmSsToMs(pomoTimeEl.value) ?? pomo.defaultDurationMs;
          pomo.defaultDurationMs = ms;
          pomo.remainingMs = ms;
          pomo.phase = "running";
          updatePomoTimeDisplay();
          beginSpeech(pickLine(assets.POMO_START_LINES), 2800);
        } else if (pomo.phase === "paused") {
          pomo.phase = "running";
          updatePomoTimeDisplay();
          beginSpeech(assets.POMO_RESUME_LINE, 2200);
        }
      });
      refs.root.querySelector("#pomo-pause")!.addEventListener("click", () => {
        if (pomo.phase !== "running" || isSpeechLocked()) return;
        pomo.phase = "paused";
        updatePomoTimeDisplay();
        beginSpeech(assets.POMO_PAUSE_LINE, 2200);
      });
      refs.root.querySelector("#pomo-reset")!.addEventListener("click", () => {
        pomo.phase = "idle";
        resetSpeechAndBubble();
        pomo.remainingMs = pomo.defaultDurationMs;
        updatePomoTimeDisplay();
        if (cycleMode) startIdle();
        else animState.setAnimation(0, animName, true);
      });

      (sp as any).__cycleTick = (delta: number) => {
        if (!cycleMode || !animState) return;
        if (isSpeechLocked()) return;

        if (phase === "idle") {
          idleHold -= delta;
          if (idleHold <= 0 && !pendingEmoji) pendingEmoji = pickEmoji();

          if (pendingEmoji && idleEntryPhaseNearStart(0.08)) {
            const e = pendingEmoji;
            pendingEmoji = null;
            startEmoji(e);
          }
        } else {
          emojiHold -= delta;
          if (emojiHold <= 0) startIdle();
        }
      };
    },
    update(sp: SpineCanvas, delta: number) {
      const skeleton = spineState.skeleton;
      const animState = spineState.animState;
      if (!skeleton || !animState) return;

      if (pomo.speechEndAt > 0 && Date.now() >= pomo.speechEndAt) {
        pomo.speechEndAt = 0;
        hideSpeechBubble(refs.speechBubbleEl);
        const fn = pomo.speechAfter;
        pomo.speechAfter = null;
        fn?.();
        if (cycleMode && pomo.startIdleRef) pomo.startIdleRef();
        else animState.setAnimation(0, animName, true);
        updatePomoTimeDisplay();
      }

      const tick = (sp as any).__cycleTick as undefined | ((d: number) => void);
      tick?.(delta);

      if (pomo.phase === "running" && !isSpeechLocked()) {
        pomo.remainingMs -= delta * 1000;
        updatePomoTimeDisplay();
        if (pomo.remainingMs <= 0) {
          pomo.remainingMs = 0;
          pomo.phase = "idle";
          if (refs.pomoPanel.hidden) {
            refs.pomoPanel.hidden = false;
            requestAnimationFrame(() => syncPomoPanelWidthFromButtons(refs));
          }
          updatePomoTimeDisplay();
          const dur = 3000 + Math.random() * 3000;
          beginSpeech(pickLine(assets.POMO_END_LINES), dur, () => {
            pomo.remainingMs = pomo.defaultDurationMs;
            updatePomoTimeDisplay();
          });
        }
      }

      animState.update(delta);
      animState.apply(skeleton);

      if (gaze.enabled) {
        applyGazeToSkeleton(gaze, sp, skeleton, canvas, delta);
      }

      skeleton.updateWorldTransform(Physics.update);

      layoutSpeechBubble(sp, skeleton, refs);
    },
    render(sp: SpineCanvas) {
      sp.clear(0, 0, 0, 0);
      const skeleton = spineState.skeleton;
      if (!skeleton) return;
      sp.renderer.resize(ResizeMode.Expand);
      fitCamera(sp, canvas, skeleton);
      sp.renderer.begin();
      sp.renderer.drawSkeleton(skeleton, false);
      sp.renderer.end();
    },
    error(_sp: SpineCanvas, errors: unknown) {
      statusEl.textContent = "资源加载失败: " + JSON.stringify(errors);
    },
  };
}
