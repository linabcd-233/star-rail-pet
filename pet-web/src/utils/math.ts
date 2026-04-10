export function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}

export function lerpExp(current: number, target: number, k: number, dt: number) {
  const t = 1 - Math.exp(-k * dt);
  return current + (target - current) * t;
}
