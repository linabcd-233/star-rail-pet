# star-rail-pet

银枝桌宠实验项目：使用自研精简 Spine 4.2 网格管线做 Python 预览，后续可接程序化交互。

## 环境

```bash
pip install -r requirements.txt
# 或
pip install -e .
```

## 运行预览

```bash
python tools/preview_spine_character.py --anim idel
# 或（根目录兼容入口）
python preview_spine_character.py --anim idel
```

默认资源目录为仓库内 `assets/argenti/`（需含 `1302.1a88ff13.json`、`1302.atlas`、`1302.png`）。

## Tauri + 官方 Spine WebGL（并行）

目录 **`pet-web/`**：与 `assets/argenti` 共用资源，使用 **Spine 4.2 官方 JS 运行时** 播放（更接近编辑器效果）。需安装 **Node + Rust**：

```bash
cd pet-web
npm install
npm run tauri:dev
```

详见 [`pet-web/README.md`](pet-web/README.md)。

## 文档

- **新手如何从 0 理解代码与执行流程**：[`docs/新手导读.md`](docs/新手导读.md)
- **目录与模块拆分**：[`docs/架构规划.md`](docs/架构规划.md)
