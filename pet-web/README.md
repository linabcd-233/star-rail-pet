# star-rail-pet（Tauri + Spine 官方 WebGL）

与仓库根目录 **`assets/argenti`** 共用资源；开发前会执行 **`npm run sync-assets`** 复制到 `public/argenti/`。

## 环境

- **Node.js**（建议 LTS）
- **Rust** + **Cargo**：<https://rustup.rs/>（`tauri build` / `tauri dev` 需要）
- Windows：**WebView2**（Win10/11 通常已有）

## 命令

```bash
cd pet-web
npm install
npm run tauri:dev
```

浏览器仅测前端（无 Tauri API）：

```bash
npm run dev
# 打开 http://localhost:5173/?anim=idel
```

打包安装程序：

```bash
npm run tauri:build
```

## 与 Python 线的对应关系

| Python | 本目录 |
|--------|--------|
| `tools/preview_spine_character.py --anim idel` | 默认 `idel`，或 `?anim=idel` |
| `1302.1a88ff13.json` + `1302.atlas` + `1302.png` | 同源，经 `sync-assets` 复制 |
| 自研线性动画、部分 transform | **官方 4.2 运行时**（slot/曲线等更完整） |

## Spine 许可

使用 **@esotericsoftware/spine-*** 需遵守 [Spine Runtimes 许可](https://esotericsoftware.com/spine-editor-license)。

## 图标

首次已用占位 `app-icon.png` 生成 `src-tauri/icons/`；发布前可替换为方形主视觉再执行 `npx tauri icon <your-1024.png>`。
