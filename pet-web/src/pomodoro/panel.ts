import type { AppDomRefs } from "../app/refs";
import { clamp } from "../utils/math";

export const POMO_PANEL_MARGIN = 0;

let pomoPanelDrag:
  | null
  | {
      pointerId: number;
      offsetX: number;
      offsetY: number;
    } = null;

export function clampPomoPanelPosition(refs: AppDomRefs) {
  const { root, pomoPanel } = refs;
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

export function isClientPointOverPomoPanel(refs: AppDomRefs, clientX: number, clientY: number) {
  const pr = refs.pomoPanel.getBoundingClientRect();
  return clientX >= pr.left && clientX <= pr.right && clientY >= pr.top && clientY <= pr.bottom;
}

export function syncPomoPanelWidthFromButtons(refs: AppDomRefs) {
  const row = refs.pomoPanel.querySelector<HTMLDivElement>(".pomo-btns");
  if (!row) return;
  const w = row.offsetWidth;
  if (w < 1) return;
  refs.pomoPanel.style.setProperty("--pomo-btn-row-px", `${w}px`);
}

export function setupPomoPanelDrag(refs: AppDomRefs) {
  const { root, pomoPanel } = refs;
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
