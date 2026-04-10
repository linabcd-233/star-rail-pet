/** #app 内壳 HTML，与样式、脚本中的 id 保持一致 */
export const APP_SHELL_HTML = `
  <canvas id="skeleton" tabindex="-1"></canvas>
  <div id="pomo-panel">
    <div class="pomo-drag-handle" title="拖动面板"></div>
    <div class="pomo-row pomo-main-row">
      <input type="text" id="pomo-time" class="pomo-time" value="25:00" spellcheck="false" autocomplete="off" aria-label="专注时长 分:秒" />
    </div>
    <div class="pomo-row pomo-btns">
      <button type="button" id="pomo-start">开始</button>
      <button type="button" id="pomo-pause">暂停</button>
      <button type="button" id="pomo-reset">重置</button>
    </div>
  </div>
  <div id="speech-bubble" aria-live="polite" hidden></div>
  <div id="character-context-menu" class="character-context-menu" hidden role="menu" aria-label="角色菜单">
    <button type="button" class="character-context-menu-item" role="menuitem" data-action="toggle-pomo">关闭计时器</button>
  </div>
  <p id="status">加载中…</p>
`;
