import type { Skeleton } from "@esotericsoftware/spine-core";
import { Physics } from "@esotericsoftware/spine-core";
import type { SpineCanvas } from "@esotericsoftware/spine-webgl";

export const cameraState = {
  stableMidX: 0,
  stableMidY: 0,
  stableBoundsW: 0,
  stableBoundsH: 0,
  userScale: 1,
};

export function captureStableCameraFromSkeleton(skeleton: Skeleton) {
  const b = skeleton.getBoundsRect();
  cameraState.stableMidX = b.x + b.width / 2;
  cameraState.stableMidY = b.y + b.height / 2;
  cameraState.stableBoundsW = b.width;
  cameraState.stableBoundsH = b.height;
}

export function fitCamera(sp: SpineCanvas, canvas: HTMLCanvasElement, skeleton: Skeleton | null) {
  if (!skeleton) return;
  const cam = sp.renderer.camera;
  cam.setViewport(canvas.width, canvas.height);
  const pad = 1.12;
  cam.position.x = cameraState.stableMidX;
  cam.position.y = cameraState.stableMidY;
  const zx = cameraState.stableBoundsW > 0 ? (cameraState.stableBoundsW * pad) / canvas.width : 1;
  const zy = cameraState.stableBoundsH > 0 ? (cameraState.stableBoundsH * pad) / canvas.height : 1;
  const baseZoom = Math.max(zx, zy, 1e-6);
  const charScale = cameraState.userScale <= 1 ? Math.max(1e-6, cameraState.userScale) : 1;
  cam.zoom = baseZoom / charScale;
  cam.update();
}

export function setSkeletonPoseAndCamera(sp: SpineCanvas, canvas: HTMLCanvasElement, skeleton: Skeleton) {
  skeleton.setToSetupPose();
  skeleton.updateWorldTransform(Physics.update);
  captureStableCameraFromSkeleton(skeleton);
  fitCamera(sp, canvas, skeleton);
}
