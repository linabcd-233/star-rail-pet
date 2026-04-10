import type { Skeleton } from "@esotericsoftware/spine-core";
import type { SpineCanvas } from "@esotericsoftware/spine-webgl";

export function clientPointToCanvasPixels(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * canvas.width;
  const y = ((clientY - r.top) / r.height) * canvas.height;
  return { x, y };
}

export function hitTestAtClientPoint(
  sp: SpineCanvas,
  canvas: HTMLCanvasElement,
  skeleton: Skeleton | null,
  clientX: number,
  clientY: number
) {
  if (!skeleton) return false;
  const r = canvas.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;

  const p = clientPointToCanvasPixels(canvas, clientX, clientY);
  const ix = Math.max(0, Math.min(canvas.width - 1, (p.x | 0)));
  const iy = Math.max(0, Math.min(canvas.height - 1, (p.y | 0)));

  const gl = sp.gl;
  const px = new Uint8Array(4);
  gl.readPixels(ix, canvas.height - 1 - iy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px[3] > 8;
}
