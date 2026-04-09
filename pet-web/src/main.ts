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
import { ResizeMode, SpineCanvas, Vector3 } from "@esotericsoftware/spine-webgl";

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

// ---- 鼠标“目光跟随”（程序驱动，不依赖素材里有专门动画）----
type GazeState = {
  enabled: boolean;
  // 鼠标是否在 canvas 内
  active: boolean;
  // 鼠标在 canvas 的像素坐标（与 canvas.width/height 同尺度）
  mx: number;
  my: number;
  // 平滑后的偏移（度）
  yawDeg: number;
  pitchDeg: number;
  // 上一帧已经应用到骨骼上的偏移（用于“抵消累计”）
  appliedYawDeg: number;
  appliedYOffset: number;
  // 目标骨骼（找不到就禁用）
  boneName: string;
  maxYawDeg: number;
  maxPitchDeg: number;
  followK: number; // 越大越“跟手”
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
  // 先用非常小的幅度，避免“扭头过猛”
  maxYawDeg: 5,
  maxPitchDeg: 2,
  followK: 10,
};

function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}

function lerpExp(current: number, target: number, k: number, dt: number) {
  // 指数平滑：dt 越大越快靠近 target
  const t = 1 - Math.exp(-k * dt);
  return current + (target - current) * t;
}

function canvasPointToPixels(e: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  // canvas.width/height 本身就是像素（我们设置为 innerWidth/innerHeight）
  const x = ((e.clientX - r.left) / r.width) * canvas.width;
  const y = ((e.clientY - r.top) / r.height) * canvas.height;
  return { x, y };
}

canvas.addEventListener("mousemove", (e) => {
  if (!gaze.enabled) return;
  const p = canvasPointToPixels(e);
  gaze.mx = p.x;
  gaze.my = p.y;
  gaze.active = true;
});
canvas.addEventListener("mouseleave", () => {
  gaze.active = false;
});

// 左键按下：如果点在角色范围内，则拖动窗口（桌宠常用交互）
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  // 没有 SpineCanvas 实例时无法做 worldToScreen 命中，这里用最小可用策略：
  // 若还未初始化 skeleton，则不处理；初始化后会在首次 render 后用 sp 挂载到 window
  const w = window as any;
  const sp = w.__spineCanvas as SpineCanvas | undefined;
  if (!sp) return;
  const p = canvasPointToPixels(e);
  if (isPointerOnSkeleton(sp, p.x, p.y)) void tryStartWindowDrag();
});

// ---- 桌宠拖拽：只有点到“角色本体范围”才允许拖动窗口 ----
// 通过 skeleton.getBoundsRect() -> camera.worldToScreen() 做一个近似命中测试。
async function tryStartWindowDrag() {
  // 仅在 Tauri 环境可用；浏览器里直接跳过
  const w = window as any;
  const win = w.__TAURI__?.window?.getCurrentWindow?.();
  if (!win?.startDragging) return;
  try {
    await win.startDragging();
  } catch {
    // ignore: 某些平台/窗口状态下可能不允许拖拽
  }
}

function isPointerOnSkeleton(sp: SpineCanvas, px: number, pyFromTop: number): boolean {
  if (!skeleton) return false;
  const b = skeleton.getBoundsRect();
  // 世界 AABB 四角 -> 屏幕（注意：camera.worldToScreen 的 y 原点在底部）
  const cam = sp.renderer.camera;
  const p1 = cam.worldToScreen(new Vector3(b.x, b.y, 0), canvas.width, canvas.height);
  const p2 = cam.worldToScreen(new Vector3(b.x + b.width, b.y + b.height, 0), canvas.width, canvas.height);
  const left = Math.min(p1.x, p2.x);
  const right = Math.max(p1.x, p2.x);
  const bottom = Math.min(p1.y, p2.y);
  const top = Math.max(p1.y, p2.y);
  const pyFromBottom = canvas.height - pyFromTop;
  const pad = 8; // 给一点容错边
  return px >= left - pad && px <= right + pad && pyFromBottom >= bottom - pad && pyFromBottom <= top + pad;
}

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
      // 方便拖拽命中测试：让外层事件拿到 SpineCanvas 实例
      (window as any).__spineCanvas = sp;

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
        // 为了观察效果先缩短间隔，稳定后再调回更自然的长间隔
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

      // 目光跟随：在动画应用后，叠加一个很小的“看向鼠标”偏移，再更新世界矩阵。
      if (gaze.enabled) {
        const b = skeleton.findBone(gaze.boneName);
        if (b) {
          // 每帧先撤销上一帧已叠加的偏移，避免在“动画切换/骨骼基准变化”时产生残留叠加。
          b.rotation -= gaze.appliedYawDeg;
          b.y -= gaze.appliedYOffset;

          // 屏幕 -> 世界坐标：用相机把鼠标像素坐标反投影到世界
          const cam = sp.renderer.camera;
          const mouseWorld = cam.screenToWorld(new Vector3(gaze.mx, gaze.my, 0), canvas.width, canvas.height);

          // 以该骨骼的当前世界位置为参考，算一个目标方向（只取很小角度）
          const dx = mouseWorld.x - b.worldX;
          const dy = mouseWorld.y - b.worldY;

          // “最容易做”的版本：把方向映射为 yaw/pitch 偏移角（度），再平滑。
          // 这里的系数会受角色坐标系影响，需要你肉眼调一下 maxYaw/maxPitch。
          // 方向约定：鼠标在哪边，就往哪边“看”（跟随而不是疏离）。
          // 由于骨骼初始朝向/父子链旋转可能让屏幕观感与数学正方向相反，这里先统一翻转。
          const targetYaw = clamp((-dx / 260) * gaze.maxYawDeg, -gaze.maxYawDeg, gaze.maxYawDeg);
          const targetPitch = clamp((-dy / 420) * gaze.maxPitchDeg, -gaze.maxPitchDeg, gaze.maxPitchDeg);

          const wantYaw = gaze.active ? targetYaw : 0;
          const wantPitch = gaze.active ? targetPitch : 0;
          gaze.yawDeg = lerpExp(gaze.yawDeg, wantYaw, gaze.followK, delta);
          gaze.pitchDeg = lerpExp(gaze.pitchDeg, wantPitch, gaze.followK, delta);

          // 关键修正：不能每帧 += 累加。这里用“本帧目标偏移 - 上帧已应用偏移”的增量方式叠加。
          // 注意：Spine 2D rotation 是绕 Z 轴（屏幕内旋转）。我们只加很小的偏移。
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
      // 桌宠透明背景：clear alpha=0
      sp.clear(0, 0, 0, 0);
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
