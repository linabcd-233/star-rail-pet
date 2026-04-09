/**
 * Spine 4.2 官方 WebGL 运行时（与 Python 预览同一套 assets/argenti）。
 * 默认循环播放 idel；URL ?anim=emoji_2 可换动画名。
 */
import "./style.css";
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Physics,
  Skeleton,
  SkeletonJson,
} from "@esotericsoftware/spine-core";
import { ResizeMode, SpineCanvas } from "@esotericsoftware/spine-webgl";

const SKEL = "1302.1a88ff13.json";
const ATLAS = "1302.atlas";
const IDLE_ANIM = "idel";

function animFromQuery(): string {
  const q = new URLSearchParams(window.location.search).get("anim");
  return q && q.length > 0 ? q : IDLE_ANIM;
}

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `<canvas id="skeleton" tabindex="-1"></canvas><p id="status">加载中…</p>`;
const canvas = document.querySelector<HTMLCanvasElement>("#skeleton")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let skeleton: Skeleton | null = null;
let animState: AnimationState | null = null;
const animName = animFromQuery();
const cycleMode = new URLSearchParams(window.location.search).get("cycle") === "1";

/** 与 Python 版一致：用初始姿势的包围盒定机位，不在每帧跟 getBoundsRect() 漂移。 */
let stableMidX = 0;
let stableMidY = 0;
let stableBoundsW = 0;
let stableBoundsH = 0;

function captureStableCameraFromSkeleton() {
  if (!skeleton) return;
  const b = skeleton.getBoundsRect();
  stableMidX = b.x + b.width / 2;
  stableMidY = b.y + b.height / 2;
  stableBoundsW = b.width;
  stableBoundsH = b.height;
}

function fitCamera(sp: SpineCanvas) {
  if (!skeleton) return;
  const cam = sp.renderer.camera;
  cam.setViewport(canvas.width, canvas.height);
  const pad = 1.12;
  cam.position.x = stableMidX;
  cam.position.y = stableMidY;
  const zx = stableBoundsW > 0 ? (stableBoundsW * pad) / canvas.width : 1;
  const zy = stableBoundsH > 0 ? (stableBoundsH * pad) / canvas.height : 1;
  cam.zoom = Math.max(zx, zy, 1e-6);
  cam.update();
}

new SpineCanvas(canvas, {
  pathPrefix: "/argenti/",
  app: {
    loadAssets(sp) {
      sp.assetManager.loadTextureAtlas(ATLAS);
      sp.assetManager.loadJson(SKEL);
    },
    initialize(sp) {
      const atlas = sp.assetManager.require(ATLAS);
      const jsonRaw = sp.assetManager.require(SKEL);
      const skelJson = new SkeletonJson(new AtlasAttachmentLoader(atlas));
      const skelData = skelJson.readSkeletonData(jsonRaw);
      skeleton = new Skeleton(skelData);
      const asData = new AnimationStateData(skelData);
      animState = new AnimationState(asData);

      // 淡入淡出（跨动画混合时间）
      const MIX = 0.16;
      const EMOJIS = ["emoji_0", "emoji_1", "emoji_2", "emoji_5"] as const;
      for (const e of EMOJIS) {
        asData.setMix(IDLE_ANIM, e, MIX);
        asData.setMix(e, IDLE_ANIM, MIX);
      }

      // 单轨道轮播：idle（呼吸）为常驻，表情/动作短暂插入。
      type EmojiName = (typeof EMOJIS)[number];
      const emojiDur: Record<EmojiName, number> = {
        // 这些时长是“桌宠效果”的停留时长，不一定等于动画原始 duration
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
        if (!entry || entry.animation?.name !== IDLE_ANIM) return false;
        const dur = Math.max(1e-6, entry.animationEnd - entry.animationStart);
        const t = ((entry.trackTime % dur) + dur) % dur;
        return t <= windowSec || dur - t <= windowSec;
      }

      function startIdle() {
        if (!animState) return;
        animState.setAnimation(0, IDLE_ANIM, true);
        phase = "idle";
        pendingEmoji = null;
        idleHold = randRange(8, 14);
      }

      function startEmoji(e: EmojiName) {
        if (!animState) return;
        animState.setAnimation(0, e, true);
        phase = "emoji";
        emojiHold = emojiDur[e];
      }

      if (cycleMode) {
        startIdle();
        statusEl.textContent = "桌宠轮播（单轨道）：idel 呼吸 + 定时表情（?cycle=1）";
      } else {
        if (!skelData.findAnimation(animName)) {
          const names = skelData.animations.map((a) => a.name).join(", ");
          statusEl.textContent = `未找到动画「${animName}」。可用: ${names}`;
          return;
        }
        animState.setAnimation(0, animName, true);
        statusEl.textContent = `Spine 官方运行时 | ${animName}（?anim= 切换，?cycle=1 轮播）`;
      }
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform(Physics.update);
      captureStableCameraFromSkeleton();
      fitCamera(sp);

      // 轮播状态机：挂在 sp 上，供 update() 调用（避免全局变量爆炸）
      (sp as any).__cycleTick = (delta: number) => {
        if (!cycleMode || !animState) return;

        if (phase === "idle") {
          idleHold -= delta;
          if (idleHold <= 0 && !pendingEmoji) pendingEmoji = pickEmoji();

          // 只在 idel 回到循环起点附近时切表情，避免呼吸“半截”突然跳表情
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
    update(sp, delta) {
      if (!skeleton || !animState) return;
      const tick = (sp as any).__cycleTick as undefined | ((d: number) => void);
      tick?.(delta);
      animState.update(delta);
      animState.apply(skeleton);
      skeleton.updateWorldTransform(Physics.update);
    },
    render(sp) {
      sp.clear(0.09, 0.1, 0.12, 1);
      if (!skeleton) return;
      sp.renderer.resize(ResizeMode.Expand);
      fitCamera(sp);
      sp.renderer.begin();
      // 与 atlas 一致：未导出 pma 时用 straight alpha（Python 端 page_info.pma 为 false 时同理）
      sp.renderer.drawSkeleton(skeleton, false);
      sp.renderer.end();
    },
    error(_sp, errors) {
      statusEl.textContent = "资源加载失败: " + JSON.stringify(errors);
    },
  },
});

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
