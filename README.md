# star-rail-pet

银枝桌宠实验项目：**桌宠产品**在 **`pet-web/`**（Tauri + WebView + Spine 官方 JS 运行时）——透明窗、穿透、像素命中、番茄钟、目光跟随等（详见 [`docs/Tauri端导读.md`](docs/Tauri端导读.md) 与 [`docs/agent协同开发对话纪要.md`](docs/agent协同开发对话纪要.md)）。

**开发重心**：**日常迭代与功能开发以 `pet-web` 为准**。**Python 线**（`src/star_rail_pet/`、`tools/preview_spine_character.py` 等）为自研精简 Spine 网格预览，**当前已搁置维护**（不接新需求；入口仍保留，便于资源/UV 对照与离线预览）。**只想跑桌宠** → 直接 **`cd pet-web` + `npm run tauri:dev`**，可跳过下文「环境 / 运行预览」中的 Python 部分。

## 环境（Python 预览线，可选）

若**不使用 Python 预览**，可跳过本节，只需 Node + Rust（见下节 Tauri）。

```bash
pip install -r requirements.txt
# 或
pip install -e .
```

## 运行预览（Python 线，可选）

```bash
python tools/preview_spine_character.py --anim idel
# 或（根目录兼容入口）
python preview_spine_character.py --anim idel
```

默认资源目录为仓库内 `assets/argenti/`（需含 `1302.1a88ff13.json`、`1302.atlas`、`1302.png`）。

## Tauri + 官方 Spine WebGL（主线路）

目录 **`pet-web/`**：与 `assets/argenti` 同源；开发/构建前由 **`npm run sync-assets`**（`pet-web/scripts/sync-assets.mjs`）同步到 **`public/argenti/`**。使用 **Spine 4.2 官方 JS 运行时**。需安装 **Node + Rust**：

```bash
cd pet-web
npm install
npm run tauri:dev
```

详见 [`pet-web/README.md`](pet-web/README.md)。

## 文档（总索引）

以下按用途分类；**以本 README 为文档总入口**，细则均在 [`docs/`](docs/) 下。桌宠前端脚本与命令另见 [`pet-web/README.md`](pet-web/README.md)。

### 入门导读

| 文档 | 说明 |
|------|------|
| [`docs/Python导读.md`](docs/Python导读.md) | **Python 线**（搁置中）：网格预览、`src/star_rail_pet` 入口与调用链；白话+AI跟读友好。 |
| [`docs/Tauri端导读.md`](docs/Tauri端导读.md) | 桌宠线：Tauri / WebView、`pet-web` 目录、`main.ts` 与 Spine 官方运行时生命周期；与 Python 线分界。 |

### 架构与工程

| 文档 | 说明 |
|------|------|
| [`docs/架构规划.md`](docs/架构规划.md) | Python 包 `src/star_rail_pet/`、`assets/argenti/`、模块映射与迁移思路。 |
| [`docs/前端模块拆分与交互落地规划.md`](docs/前端模块拆分与交互落地规划.md) | `pet-web` 阶段 A（纯拆分）/阶段 B（交互）与目标目录。 |
| [`docs/技术文档.md`](docs/技术文档.md) | 早期可行性、分层与选型背景（可与当前 Tauri 实现对照阅读）。 |

### 功能模块设计

| 文档 | 说明 |
|------|------|
| [`docs/交互与表情仲裁设计.md`](docs/交互与表情仲裁设计.md) | 单轨仲裁、优先级、信号分离、TTL/锁、番茄说话约定。 |
| [`docs/交互进阶规划摘要.md`](docs/交互进阶规划摘要.md) | 与上文配套的速览：合并顺序、实现顺序。 |

### 协作与过程记录

| 文档 | 说明 |
|------|------|
| [`docs/agent协同开发对话纪要.md`](docs/agent协同开发对话纪要.md) | 跨会话工程结论、踩坑与互见（Spine/穿透/番茄钟/拆分等）。 |
| [`docs/对话暂存.md`](docs/对话暂存.md) | 讨论过程暂存，便于个人回顾；**非对外规范**，以正式文档与纪要为准。 |
