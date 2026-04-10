export const isTauri =
  !!(window as any).__TAURI_INTERNALS__ ||
  !!(window as any).__TAURI__;
