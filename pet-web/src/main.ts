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

function animFromQuery(): string {
  const q = new URLSearchParams(window.location.search).get("anim");
  return q && q.length > 0 ? q : "idel";
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
      if (!skelData.findAnimation(animName)) {
        const names = skelData.animations.map((a) => a.name).join(", ");
        statusEl.textContent = `未找到动画「${animName}」。可用: ${names}`;
        return;
      }
      animState.setAnimation(0, animName, true);
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform(Physics.update);
      captureStableCameraFromSkeleton();
      fitCamera(sp);
      statusEl.textContent = `Spine 官方运行时 | ${animName}（?anim= 切换）`;
    },
    update(_sp, delta) {
      if (!skeleton || !animState) return;
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
