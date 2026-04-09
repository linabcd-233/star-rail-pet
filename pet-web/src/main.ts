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
import { cursorPosition, getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

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
  <p id="status">加载中…</p>
`;
const canvas = document.querySelector<HTMLCanvasElement>("#skeleton")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const isTauri =
  !!(window as any).__TAURI_INTERNALS__ ||
  !!(window as any).__TAURI__;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let skeleton: Skeleton | null = null;
let animState: AnimationState | null = null;
const animName = animFromQuery();
const cycleParam = new URLSearchParams(window.location.search).get("cycle");
const cycleMode = isTauri ? cycleParam !== "0" : cycleParam === "1";

let ignoreCursorEnabled = false;
let ignoreCursorPending: Promise<void> | null = null;
let tauriPointerLoopTimer: number | null = null;

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

/** 目光：唯一写入 gaze.mx/my/active 的入口（Tauri：`tauriPointerTick`；浏览器：`mousemove`）。 */
function syncGazeFromClient(clientX: number, clientY: number) {
  if (!gaze.enabled) return;
  const r = canvas.getBoundingClientRect();
  gaze.active = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  if (!gaze.active) return;
  const x = ((clientX - r.left) / r.width) * canvas.width;
  const y = ((clientY - r.top) / r.height) * canvas.height;
  gaze.mx = x;
  gaze.my = y;
}

if (!isTauri) {
  window.addEventListener("mousemove", (e) => {
    syncGazeFromClient(e.clientX, e.clientY);
  });
}

function setIgnoreCursorEventsSafe(ignore: boolean) {
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

async function tauriPointerTick() {
  if (!isTauri) return;
  const sp = (window as any).__spineCanvas as SpineCanvas | undefined;
  if (!sp || !skeleton) return;

  const [cursor, innerPos, scale] = await Promise.all([
    cursorPosition(),
    getCurrentWindow().innerPosition(),
    getCurrentWindow().scaleFactor(),
  ]);

  const clientX = (cursor.x - innerPos.x) / scale;
  const clientY = (cursor.y - innerPos.y) / scale;

  syncGazeFromClient(clientX, clientY);

  const inside = hitTestAtClientPoint(sp, clientX, clientY);
  canvas.style.cursor = inside ? "grab" : "default";
  if (inside) setIgnoreCursorEventsSafe(false);
  else setIgnoreCursorEventsSafe(true);
}

function ensureTauriPointerLoop() {
  if (!isTauri || tauriPointerLoopTimer != null) return;
  tauriPointerLoopTimer = window.setInterval(() => {
    void tauriPointerTick();
  }, 33);
}

function enableBackgroundClickThrough() {
  setIgnoreCursorEventsSafe(true);
}

function disableBackgroundClickThrough() {
  setIgnoreCursorEventsSafe(false);
}

function clientPointToCanvasPixels(clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * canvas.width;
  const y = ((clientY - r.top) / r.height) * canvas.height;
  return { x, y };
}

function hitTestAtClientPoint(sp: SpineCanvas, clientX: number, clientY: number) {
  if (!skeleton) return false;
  const r = canvas.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;

  const p = clientPointToCanvasPixels(clientX, clientY);
  const ix = Math.max(0, Math.min(canvas.width - 1, (p.x | 0)));
  const iy = Math.max(0, Math.min(canvas.height - 1, (p.y | 0)));

  const gl = sp.gl;
  const px = new Uint8Array(4);
  gl.readPixels(ix, canvas.height - 1 - iy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px[3] > 8;
}

window.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const sp = (window as any).__spineCanvas as SpineCanvas | undefined;
  if (!sp || !skeleton) return;
  if (hitTestAtClientPoint(sp, e.clientX, e.clientY)) {
    e.preventDefault();
    if (!isTauri) return;
    disableBackgroundClickThrough();
    void getCurrentWindow().startDragging();
  }
});

if (!isTauri) {
  window.addEventListener("pointermove", (e) => {
    const sp = (window as any).__spineCanvas as SpineCanvas | undefined;
    if (!sp || !skeleton) return;
    const inside = hitTestAtClientPoint(sp, e.clientX, e.clientY);
    canvas.style.cursor = inside ? "grab" : "default";
  });
}

let stableMidX = 0;
let stableMidY = 0;
let stableBoundsW = 0;
let stableBoundsH = 0;
let userScale = 1;
const WIN_BASE_W = 360;
const WIN_BASE_H = 300;
const WIN_MAX_W = 960;
const WIN_MAX_H = 800;
const SCALE_MAX = Math.min(WIN_MAX_W / WIN_BASE_W, WIN_MAX_H / WIN_BASE_H);
let resizePending: number | null = null;

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
  const baseZoom = Math.max(zx, zy, 1e-6);
  const charScale = userScale <= 1 ? Math.max(1e-6, userScale) : 1;
  cam.zoom = baseZoom / charScale;
  cam.update();
}

window.addEventListener(
  "wheel",
  (e) => {
    const sp = (window as any).__spineCanvas as SpineCanvas | undefined;
    if (!sp || !skeleton) return;
    if (!e.ctrlKey) return;
    if (!hitTestAtClientPoint(sp, e.clientX, e.clientY)) return;
    e.preventDefault();
    const step = Math.exp((-e.deltaY / 300) * 0.25);
    userScale = clamp(userScale * step, 0.35, SCALE_MAX);
    if (isTauri) scheduleWindowResizeToScale();
  },
  { passive: false }
);

function scheduleWindowResizeToScale() {
  if (!isTauri) return;
  if (resizePending != null) window.clearTimeout(resizePending);
  resizePending = window.setTimeout(() => {
    resizePending = null;
    void applyWindowResizeToScale();
  }, 40);
}

async function applyWindowResizeToScale() {
  const win = getCurrentWindow();
  await win.setMinSize(new LogicalSize(WIN_BASE_W, WIN_BASE_H));
  await win.setMaxSize(new LogicalSize(WIN_MAX_W, WIN_MAX_H));

  const winScale = clamp(userScale, 1, SCALE_MAX);
  const w = Math.round(clamp(WIN_BASE_W * winScale, WIN_BASE_W, WIN_MAX_W));
  const h = Math.round(clamp(WIN_BASE_H * winScale, WIN_BASE_H, WIN_MAX_H));
  await win.setSize(new LogicalSize(w, h));
}

new SpineCanvas(canvas, {
  pathPrefix: "/argenti/",
  webglConfig: {
    preserveDrawingBuffer: true,
  },
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
        statusEl.textContent = isTauri
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
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform(Physics.update);
      captureStableCameraFromSkeleton();
      fitCamera(sp);
      if (isTauri) {
        enableBackgroundClickThrough();
        ensureTauriPointerLoop();
      }

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
