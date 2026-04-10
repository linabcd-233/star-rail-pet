import type { Skeleton } from "@esotericsoftware/spine-core";
import { Vector3 } from "@esotericsoftware/spine-webgl";
import type { SpineCanvas } from "@esotericsoftware/spine-webgl";
import { clamp, lerpExp } from "../utils/math";

export type GazeState = {
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

export function createGazeState(): GazeState {
  return {
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
}

/** 目光：唯一写入 gaze.mx/my/active 的入口（Tauri：pointerLoop；浏览器：mousemove）。 */
export function syncGazeFromClient(gaze: GazeState, canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  if (!gaze.enabled) return;
  const r = canvas.getBoundingClientRect();
  gaze.active = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  if (!gaze.active) return;
  const x = ((clientX - r.left) / r.width) * canvas.width;
  const y = ((clientY - r.top) / r.height) * canvas.height;
  gaze.mx = x;
  gaze.my = y;
}

export function applyGazeToSkeleton(
  gaze: GazeState,
  sp: SpineCanvas,
  skeleton: Skeleton,
  canvas: HTMLCanvasElement,
  delta: number
) {
  if (!gaze.enabled) return;
  const b = skeleton.findBone(gaze.boneName);
  if (!b) return;
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
