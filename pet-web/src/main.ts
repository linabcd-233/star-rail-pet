import "./style.css";
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Physics,
  Skeleton,
  SkeletonJson,
} from "@esotericsoftware/spine-core";
import { ResizeMode, SpineCanvas, Vector3 } from "@esotericsoftware/spine-webgl";
import { getCurrentWindow } from "@tauri-apps/api/window";

const SKEL = "1302.1a88ff13.json";
const ATLAS = "1302.atlas";
const IDLE_ANIM = "idel";

function animFromQuery(): string {
  const q = new URLSearchParams(window.location.search).get("anim");
  return q && q.length > 0 ? q : IDLE_ANIM;
}

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <canvas id="skeleton" tabindex="-1"></canvas>
  <div id="drag-region" aria-hidden="true"></div>
  <p id="status">加载中…</p>
`;
const canvas = document.querySelector<HTMLCanvasElement>("#skeleton")!;
const dragRegion = document.querySelector<HTMLDivElement>("#drag-region")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const isTauri =
  !!(window as any).__TAURI_INTERNALS__ ||
  !!(window as any).__TAURI__;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let skeleton: Skeleton | null = null;
let animState: AnimationState | null = null;
const animName = animFromQuery();
const cycleMode = new URLSearchParams(window.location.search).get("cycle") === "1";

type GazeState = {
  enabled: boolean;
  active: boolean;
  mx: number;
  my: number;
  yawDeg: number;
  pitchDeg: number;
  appliedYawDeg: number;
  appliedYOffset: number;
  boneName: string;
  maxYawDeg: number;
  maxPitchDeg: number;
  followK: number;
};

const gaze: GazeState = {
  enabled: new URLSearchParams(window.location.search).get("gaze") !== "0",
  active: false,
  mx: 0,
  my: 0,
  yawDeg: 0,
  pitchDeg: 0,
  appliedYawDeg: 0,
  appliedYOffset: 0,
  boneName: "左看右看",
  maxYawDeg: 5,
  maxPitchDeg: 2,
  followK: 10,
};

function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}

function lerpExp(current: number, target: number, k: number, dt: number) {
  const t = 1 - Math.exp(-k * dt);
  return current + (target - current) * t;
}

function canvasPointToPixels(e: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * canvas.width;
  const y = ((e.clientY - r.top) / r.height) * canvas.height;
  return { x, y };
}

window.addEventListener("mousemove", (e) => {
  if (!gaze.enabled) return;
  const p = canvasPointToPixels(e);
  gaze.mx = p.x;
  gaze.my = p.y;

  const r = canvas.getBoundingClientRect();
  gaze.active =
    e.clientX >= r.left &&
    e.clientX <= r.right &&
    e.clientY >= r.top &&
    e.clientY <= r.bottom;
});

window.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const sp = (window as any).__spineCanvas as SpineCanvas | undefined;
  if (!sp || !skeleton) return;
  const dr = dragRegion.getBoundingClientRect();
  if (e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom) {
    e.preventDefault();
    if (!isTauri) return;
    void getCurrentWindow().startDragging();
  }
});

function updateDragRegionToSkeletonBounds(sp: SpineCanvas) {
  if (!skeleton) {
    dragRegion.style.width = "0px";
    dragRegion.style.height = "0px";
    return;
  }
  const b = skeleton.getBoundsRect();
  const cam = sp.renderer.camera;
  const p1 = cam.worldToScreen(new Vector3(b.x, b.y, 0), canvas.width, canvas.height);
  const p2 = cam.worldToScreen(new Vector3(b.x + b.width, b.y + b.height, 0), canvas.width, canvas.height);
  const left = Math.min(p1.x, p2.x);
  const right = Math.max(p1.x, p2.x);
  const bottom = Math.min(p1.y, p2.y);
  const top = Math.max(p1.y, p2.y);
  const pad = 8;

  const appRect = root.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const scaleX = canvasRect.width / canvas.width;
  const scaleY = canvasRect.height / canvas.height;
  const canvasOffsetX = canvasRect.left - appRect.left;
  const canvasOffsetY = canvasRect.top - appRect.top;

  const width = (Math.max(0, right - left) + pad * 2) * scaleX;
  const height = (Math.max(0, top - bottom) + pad * 2) * scaleY;
  const cssLeft = (left - pad) * scaleX + canvasOffsetX;
  const cssTop = (canvas.height - top - pad) * scaleY + canvasOffsetY;

  dragRegion.style.left = `${cssLeft}px`;
  dragRegion.style.top = `${cssTop}px`;
  dragRegion.style.width = `${width}px`;
  dragRegion.style.height = `${height}px`;
}

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
      (window as any).__spineCanvas = sp;

      const atlas = sp.assetManager.require(ATLAS);
      const jsonRaw = sp.assetManager.require(SKEL);
      const skelJson = new SkeletonJson(new AtlasAttachmentLoader(atlas));
      const skelData = skelJson.readSkeletonData(jsonRaw);
      skeleton = new Skeleton(skelData);
      const asData = new AnimationStateData(skelData);
      animState = new AnimationState(asData);

      const MIX = 0.16;
      const EMOJIS = ["emoji_0", "emoji_1", "emoji_2", "emoji_5"] as const;
      for (const e of EMOJIS) {
        asData.setMix(IDLE_ANIM, e, MIX);
        asData.setMix(e, IDLE_ANIM, MIX);
      }

      type EmojiName = (typeof EMOJIS)[number];
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

      (sp as any).__cycleTick = (delta: number) => {
        if (!cycleMode || !animState) return;

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
    update(sp, delta) {
      if (!skeleton || !animState) return;
      const tick = (sp as any).__cycleTick as undefined | ((d: number) => void);
      tick?.(delta);
      animState.update(delta);
      animState.apply(skeleton);

      if (gaze.enabled) {
        const b = skeleton.findBone(gaze.boneName);
        if (b) {
          b.rotation -= gaze.appliedYawDeg;
          b.y -= gaze.appliedYOffset;

          const cam = sp.renderer.camera;
          const mouseWorld = cam.screenToWorld(new Vector3(gaze.mx, gaze.my, 0), canvas.width, canvas.height);

          const dx = mouseWorld.x - b.worldX;
          const dy = mouseWorld.y - b.worldY;

          const targetYaw = clamp((-dx / 260) * gaze.maxYawDeg, -gaze.maxYawDeg, gaze.maxYawDeg);
          const targetPitch = clamp((-dy / 420) * gaze.maxPitchDeg, -gaze.maxPitchDeg, gaze.maxPitchDeg);

          const wantYaw = gaze.active ? targetYaw : 0;
          const wantPitch = gaze.active ? targetPitch : 0;
          gaze.yawDeg = lerpExp(gaze.yawDeg, wantYaw, gaze.followK, delta);
          gaze.pitchDeg = lerpExp(gaze.pitchDeg, wantPitch, gaze.followK, delta);

          const wantYOffset = gaze.pitchDeg * 0.6;
          b.rotation += gaze.yawDeg;
          b.y += wantYOffset;
          gaze.appliedYawDeg = gaze.yawDeg;
          gaze.appliedYOffset = wantYOffset;
        }
      }

      skeleton.updateWorldTransform(Physics.update);
    },
    render(sp) {
      sp.clear(0, 0, 0, 0);
      if (!skeleton) return;
      sp.renderer.resize(ResizeMode.Expand);
      fitCamera(sp);
      updateDragRegionToSkeletonBounds(sp);
      sp.renderer.begin();
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
