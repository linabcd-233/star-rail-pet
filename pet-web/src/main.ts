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
const TALK_ANIM = "emoji_5";

const POMO_START_LINES = [
  "专注，亦是在践行纯美",
  "纯美骑士向你致意，勤奋的生灵",
  "试炼开始，愿伊德莉拉庇佑你",
];
const POMO_END_LINES = [
  "多么纯美的壮举！",
  "休息片刻吧，我的挚友",
  "信念，无可摧毁！你做到了",
];
const POMO_PAUSE_LINE = "修行之路上也需要调整";
const POMO_RESUME_LINE = "继续前行，纯美永不缺席";

function animFromQuery(): string {
  const q = new URLSearchParams(window.location.search).get("anim");
  return q && q.length > 0 ? q : IDLE_ANIM;
}

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <canvas id="skeleton" tabindex="-1"></canvas>
  <div id="pomo-panel">
    <div class="pomo-drag-handle" title="拖动面板"></div>
    <div class="pomo-row pomo-main-row">
      <input type="text" id="pomo-time" class="pomo-time" value="25:00" spellcheck="false" autocomplete="off" aria-label="专注时长 分:秒" />
    </div>
    <div class="pomo-row pomo-btns">
      <button type="button" id="pomo-start">开始</button>
      <button type="button" id="pomo-pause">暂停</button>
      <button type="button" id="pomo-reset">重置</button>
    </div>
  </div>
  <div id="speech-bubble" aria-live="polite" hidden></div>
  <div id="character-context-menu" class="character-context-menu" hidden role="menu" aria-label="角色菜单">
    <button type="button" class="character-context-menu-item" role="menuitem" data-action="toggle-pomo">关闭计时器</button>
  </div>
  <p id="status">加载中…</p>
`;
const canvas = document.querySelector<HTMLCanvasElement>("#skeleton")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const pomoPanel = document.querySelector<HTMLDivElement>("#pomo-panel")!;
const pomoTimeEl = document.querySelector<HTMLInputElement>("#pomo-time")!;
const speechBubbleEl = document.querySelector<HTMLDivElement>("#speech-bubble")!;
const characterContextMenuEl = document.querySelector<HTMLDivElement>("#character-context-menu")!;
const POMO_PANEL_MARGIN = 0;

/** 头部附近骨骼（优先更靠上的「身体4」），用于对话气泡锚在脸侧 */
const SPEECH_ANCHOR_BONES = ["身体4", "左看右看"] as const;
const SPEECH_FACE_OFFSET_X = 36;
/** 对话气泡竖直微调（相对头部锚点；正数偏下，负数偏上） */
const SPEECH_FACE_OFFSET_Y = 40;
const SPEECH_POMO_GAP = 8;

let pomoPanelDrag:
  | null
  | {
      pointerId: number;
      offsetX: number;
      offsetY: number;
    } = null;

function clampPomoPanelPosition() {
  const rr = root.getBoundingClientRect();
  const pr = pomoPanel.getBoundingClientRect();
  let left = pr.left - rr.left;
  let top = pr.top - rr.top;
  const w = pr.width;
  const h = pr.height;
  left = clamp(left, POMO_PANEL_MARGIN, Math.max(POMO_PANEL_MARGIN, rr.width - w - POMO_PANEL_MARGIN));
  top = clamp(top, POMO_PANEL_MARGIN, Math.max(POMO_PANEL_MARGIN, rr.height - h - POMO_PANEL_MARGIN));
  pomoPanel.style.left = `${left}px`;
  pomoPanel.style.top = `${top}px`;
  pomoPanel.style.bottom = "auto";
}

/** 番茄钟整块面板（含圆角矩形区域）在窗口坐标系下的命中，用于 Tauri 穿透与拖窗口区分。 */
function isClientPointOverPomoPanel(clientX: number, clientY: number) {
  const pr = pomoPanel.getBoundingClientRect();
  return clientX >= pr.left && clientX <= pr.right && clientY >= pr.top && clientY <= pr.bottom;
}

function isClientPointOverCharacterContextMenu(clientX: number, clientY: number) {
  if (characterContextMenuEl.hidden) return false;
  const r = characterContextMenuEl.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** 第一行时间与面板宽度按三按钮行总宽收缩（CSS 单独做不到「子项定父宽」）。 */
function syncPomoPanelWidthFromButtons() {
  const row = pomoPanel.querySelector<HTMLDivElement>(".pomo-btns");
  if (!row) return;
  const w = row.offsetWidth;
  if (w < 1) return;
  pomoPanel.style.setProperty("--pomo-btn-row-px", `${w}px`);
}

function setupPomoPanelDrag() {
  const handle = pomoPanel.querySelector<HTMLDivElement>(".pomo-drag-handle")!;
  const onMove = (e: PointerEvent) => {
    if (!pomoPanelDrag || e.pointerId !== pomoPanelDrag.pointerId) return;
    const rr = root.getBoundingClientRect();
    const pr = pomoPanel.getBoundingClientRect();
    let left = e.clientX - rr.left - pomoPanelDrag.offsetX;
    let top = e.clientY - rr.top - pomoPanelDrag.offsetY;
    const w = pr.width;
    const h = pr.height;
    left = clamp(left, POMO_PANEL_MARGIN, Math.max(POMO_PANEL_MARGIN, rr.width - w - POMO_PANEL_MARGIN));
    top = clamp(top, POMO_PANEL_MARGIN, Math.max(POMO_PANEL_MARGIN, rr.height - h - POMO_PANEL_MARGIN));
    pomoPanel.style.left = `${left}px`;
    pomoPanel.style.top = `${top}px`;
    pomoPanel.style.bottom = "auto";
  };
  const onUp = (e: PointerEvent) => {
    if (!pomoPanelDrag || e.pointerId !== pomoPanelDrag.pointerId) return;
    pomoPanelDrag = null;
    handle.releasePointerCapture(e.pointerId);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
  };
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pr = pomoPanel.getBoundingClientRect();
    pomoPanelDrag = {
      pointerId: e.pointerId,
      offsetX: e.clientX - pr.left,
      offsetY: e.clientY - pr.top,
    };
    if (pomoPanel.style.bottom && pomoPanel.style.bottom !== "auto") {
      const rr = root.getBoundingClientRect();
      pomoPanel.style.top = `${pr.top - rr.top}px`;
      pomoPanel.style.bottom = "auto";
    }
    if (!pomoPanel.style.left) {
      const rr = root.getBoundingClientRect();
      pomoPanel.style.left = `${pr.left - rr.left}px`;
    }
    handle.setPointerCapture(e.pointerId);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}
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

type PomoPhase = "idle" | "running" | "paused";
let pomoPhase: PomoPhase = "idle";
let pomoRemainingMs = 25 * 60 * 1000;
let pomoDefaultDurationMs = 25 * 60 * 1000;
let speechEndAt = 0;
let speechAfter: (() => void) | null = null;
let startIdleRef: (() => void) | null = null;

function isSpeechLocked() {
  return Date.now() < speechEndAt;
}

function pickLine(lines: string[]) {
  return lines[(Math.random() * lines.length) | 0];
}

function formatMmSs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function parseMmSsToMs(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  const min = parseInt(m[1]!, 10);
  const sec = parseInt(m[2]!, 10);
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
  if (sec < 0 || sec > 59) return null;
  if (min < 1 || min > 180) return null;
  return (min * 60 + sec) * 1000;
}

function syncIdlePomoFromInput() {
  if (pomoPhase !== "idle" || isSpeechLocked()) return;
  const ms = parseMmSsToMs(pomoTimeEl.value);
  if (ms == null) {
    pomoTimeEl.value = formatMmSs(pomoRemainingMs);
    return;
  }
  pomoDefaultDurationMs = ms;
  pomoRemainingMs = ms;
  pomoTimeEl.value = formatMmSs(pomoRemainingMs);
}

function updatePomoTimeDisplay() {
  pomoTimeEl.value = formatMmSs(pomoRemainingMs);
  pomoTimeEl.readOnly = pomoPhase !== "idle" || isSpeechLocked();
  const startBtn = document.querySelector<HTMLButtonElement>("#pomo-start");
  const pauseBtn = document.querySelector<HTMLButtonElement>("#pomo-pause");
  if (startBtn && pauseBtn) {
    const locked = isSpeechLocked();
    startBtn.textContent = pomoPhase === "paused" ? "继续" : "开始";
    startBtn.disabled = pomoPhase === "running" || locked;
    pauseBtn.disabled = pomoPhase !== "running" || locked;
  }
  syncPomoPanelWidthFromButtons();
}

function showSpeechBubble(text: string) {
  speechBubbleEl.textContent = text;
  speechBubbleEl.hidden = false;
}

function hideSpeechBubble() {
  speechBubbleEl.textContent = "";
  speechBubbleEl.hidden = true;
}

function rectsOverlap2D(
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

/** 将气泡锚在头部骨骼右侧（屏幕坐标）；与番茄钟重叠时先右移，仍重叠则移到面板下缘以下。 */
function layoutSpeechBubble(sp: SpineCanvas) {
  if (!skeleton || speechBubbleEl.hidden) return;
  fitCamera(sp);
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

function beginSpeech(text: string, durationMs: number, after?: () => void) {
  speechEndAt = Date.now() + durationMs;
  speechAfter = after ?? null;
  showSpeechBubble(text);
  if (animState && skeleton?.data.findAnimation(TALK_ANIM)) {
    animState.setAnimation(0, TALK_ANIM, true);
  }
}

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

  const overPomo = isClientPointOverPomoPanel(clientX, clientY);
  const overCharMenu = isClientPointOverCharacterContextMenu(clientX, clientY);
  const inside = hitTestAtClientPoint(sp, clientX, clientY);
  if (overPomo || overCharMenu) {
    canvas.style.cursor = "default";
    setIgnoreCursorEventsSafe(false);
  } else {
    canvas.style.cursor = inside ? "grab" : "default";
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

function hideCharacterContextMenu() {
  characterContextMenuEl.hidden = true;
  if (isTauri) void tauriPointerTick();
}

function updateCharacterContextMenuLabel() {
  const btn = characterContextMenuEl.querySelector<HTMLButtonElement>("[data-action='toggle-pomo']");
  if (btn) btn.textContent = pomoPanel.hidden ? "打开计时器" : "关闭计时器";
}

function showCharacterContextMenu(clientX: number, clientY: number) {
  updateCharacterContextMenuLabel();
  characterContextMenuEl.hidden = false;
  const rr = root.getBoundingClientRect();
  let left = clientX - rr.left;
  let top = clientY - rr.top;
  characterContextMenuEl.style.left = `${left}px`;
  characterContextMenuEl.style.top = `${top}px`;
  const mw = characterContextMenuEl.offsetWidth;
  const mh = characterContextMenuEl.offsetHeight;
  left = clamp(left, 0, Math.max(0, rr.width - mw));
  top = clamp(top, 0, Math.max(0, rr.height - mh));
  characterContextMenuEl.style.left = `${left}px`;
  characterContextMenuEl.style.top = `${top}px`;
  if (isTauri) disableBackgroundClickThrough();
}

function setupCharacterContextMenu() {
  canvas.addEventListener("contextmenu", (e) => {
    const sp = (window as any).__spineCanvas as SpineCanvas | undefined;
    if (!sp || !skeleton) return;
    e.preventDefault();
    if (!hitTestAtClientPoint(sp, e.clientX, e.clientY)) return;
    showCharacterContextMenu(e.clientX, e.clientY);
  });

  characterContextMenuEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const t = (e.target as HTMLElement).closest("[data-action='toggle-pomo']");
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    pomoPanel.hidden = !pomoPanel.hidden;
    if (!pomoPanel.hidden) {
      requestAnimationFrame(() => syncPomoPanelWidthFromButtons());
    }
    hideCharacterContextMenu();
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (characterContextMenuEl.hidden) return;
      if (characterContextMenuEl.contains(e.target as Node)) return;
      hideCharacterContextMenu();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !characterContextMenuEl.hidden) {
      e.preventDefault();
      hideCharacterContextMenu();
    }
  });
}

window.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (isClientPointOverPomoPanel(e.clientX, e.clientY)) return;
  if (isClientPointOverCharacterContextMenu(e.clientX, e.clientY)) return;
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
    if (isClientPointOverPomoPanel(e.clientX, e.clientY)) {
      canvas.style.cursor = "default";
      return;
    }
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

      startIdleRef = startIdle;
      updatePomoTimeDisplay();
      pomoTimeEl.addEventListener("change", () => syncIdlePomoFromInput());
      pomoTimeEl.addEventListener("blur", () => syncIdlePomoFromInput());
      document.querySelector("#pomo-start")!.addEventListener("click", () => {
        if (isSpeechLocked()) return;
        if (pomoPhase === "idle") {
          const ms = parseMmSsToMs(pomoTimeEl.value) ?? pomoDefaultDurationMs;
          pomoDefaultDurationMs = ms;
          pomoRemainingMs = ms;
          pomoPhase = "running";
          updatePomoTimeDisplay();
          beginSpeech(pickLine(POMO_START_LINES), 2800);
        } else if (pomoPhase === "paused") {
          pomoPhase = "running";
          updatePomoTimeDisplay();
          beginSpeech(POMO_RESUME_LINE, 2200);
        }
      });
      document.querySelector("#pomo-pause")!.addEventListener("click", () => {
        if (pomoPhase !== "running" || isSpeechLocked()) return;
        pomoPhase = "paused";
        updatePomoTimeDisplay();
        beginSpeech(POMO_PAUSE_LINE, 2200);
      });
      document.querySelector("#pomo-reset")!.addEventListener("click", () => {
        pomoPhase = "idle";
        speechEndAt = 0;
        hideSpeechBubble();
        speechAfter = null;
        pomoRemainingMs = pomoDefaultDurationMs;
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
    update(sp, delta) {
      if (!skeleton || !animState) return;

      if (speechEndAt > 0 && Date.now() >= speechEndAt) {
        speechEndAt = 0;
        hideSpeechBubble();
        const fn = speechAfter;
        speechAfter = null;
        fn?.();
        if (cycleMode && startIdleRef) startIdleRef();
        else animState.setAnimation(0, animName, true);
        updatePomoTimeDisplay();
      }

      const tick = (sp as any).__cycleTick as undefined | ((d: number) => void);
      tick?.(delta);

      if (pomoPhase === "running" && !isSpeechLocked()) {
        pomoRemainingMs -= delta * 1000;
        updatePomoTimeDisplay();
        if (pomoRemainingMs <= 0) {
          pomoRemainingMs = 0;
          pomoPhase = "idle";
          if (pomoPanel.hidden) {
            pomoPanel.hidden = false;
            requestAnimationFrame(() => syncPomoPanelWidthFromButtons());
          }
          updatePomoTimeDisplay();
          const dur = 3000 + Math.random() * 3000;
          beginSpeech(pickLine(POMO_END_LINES), dur, () => {
            pomoRemainingMs = pomoDefaultDurationMs;
            updatePomoTimeDisplay();
          });
        }
      }

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

      layoutSpeechBubble(sp);
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

setupPomoPanelDrag();
setupCharacterContextMenu();
requestAnimationFrame(() => {
  syncPomoPanelWidthFromButtons();
  requestAnimationFrame(() => syncPomoPanelWidthFromButtons());
});

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  clampPomoPanelPosition();
  syncPomoPanelWidthFromButtons();
  const sp = (window as any).__spineCanvas as SpineCanvas | undefined;
  if (sp) layoutSpeechBubble(sp);
});
