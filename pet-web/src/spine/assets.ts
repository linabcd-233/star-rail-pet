export const SKEL = "1302.1a88ff13.json";
export const ATLAS = "1302.atlas";
export const IDLE_ANIM = "idel";
export const TALK_ANIM = "emoji_5";

export const POMO_START_LINES = [
  "专注，亦是在践行纯美",
  "纯美骑士向你致意，勤奋的生灵",
  "试炼开始，愿伊德莉拉庇佑你",
];
export const POMO_END_LINES = [
  "多么纯美的壮举！",
  "休息片刻吧，我的挚友",
  "信念，无可摧毁！你做到了",
];
export const POMO_PAUSE_LINE = "修行之路上也需要调整";
export const POMO_RESUME_LINE = "继续前行，纯美永不缺席";

export function animFromQuery(idleAnim: string): string {
  const q = new URLSearchParams(window.location.search).get("anim");
  return q && q.length > 0 ? q : idleAnim;
}
