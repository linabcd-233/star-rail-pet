import type { Skeleton } from "@esotericsoftware/spine-core";
import type { SpineCanvas } from "@esotericsoftware/spine-webgl";
import type { AppDomRefs } from "../app/refs";
import { hitTestAtClientPoint } from "../spine/hitTest";
import { clamp } from "../utils/math";
import { isTauri } from "../tauri/env";
import { disableBackgroundClickThrough } from "../tauri/pointerPassthrough";
import { syncPomoPanelWidthFromButtons } from "../pomodoro/panel";

export function isClientPointOverCharacterContextMenu(refs: AppDomRefs, clientX: number, clientY: number) {
  const { characterContextMenuEl } = refs;
  if (characterContextMenuEl.hidden) return false;
  const r = characterContextMenuEl.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

export function setupCharacterContextMenu(
  refs: AppDomRefs,
  ctx: {
    getSpineCanvas: () => SpineCanvas | undefined;
    getSkeleton: () => Skeleton | null;
    onMenuHidden?: () => void;
  }
) {
  const { canvas, characterContextMenuEl, pomoPanel, root } = refs;

  function hideCharacterContextMenu() {
    characterContextMenuEl.hidden = true;
    ctx.onMenuHidden?.();
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

  canvas.addEventListener("contextmenu", (e) => {
    const sp = ctx.getSpineCanvas();
    const skeleton = ctx.getSkeleton();
    if (!sp || !skeleton) return;
    e.preventDefault();
    if (!hitTestAtClientPoint(sp, canvas, skeleton, e.clientX, e.clientY)) return;
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
      requestAnimationFrame(() => syncPomoPanelWidthFromButtons(refs));
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
