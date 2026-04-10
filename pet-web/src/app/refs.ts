import { APP_SHELL_HTML } from "./domTemplate";

export type AppDomRefs = {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  statusEl: HTMLParagraphElement;
  pomoPanel: HTMLDivElement;
  pomoTimeEl: HTMLInputElement;
  speechBubbleEl: HTMLDivElement;
  characterContextMenuEl: HTMLDivElement;
};

export function mountAppShell(rootSelector = "#app"): AppDomRefs {
  const root = document.querySelector<HTMLDivElement>(rootSelector);
  if (!root) throw new Error(`Missing ${rootSelector}`);
  root.innerHTML = APP_SHELL_HTML;
  const canvas = root.querySelector<HTMLCanvasElement>("#skeleton")!;
  const statusEl = root.querySelector<HTMLParagraphElement>("#status")!;
  const pomoPanel = root.querySelector<HTMLDivElement>("#pomo-panel")!;
  const pomoTimeEl = root.querySelector<HTMLInputElement>("#pomo-time")!;
  const speechBubbleEl = root.querySelector<HTMLDivElement>("#speech-bubble")!;
  const characterContextMenuEl = root.querySelector<HTMLDivElement>("#character-context-menu")!;
  return { root, canvas, statusEl, pomoPanel, pomoTimeEl, speechBubbleEl, characterContextMenuEl };
}
