"""命令行入口：Spine 角色预览。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from star_rail_pet.render.gl_preview import run_bitmap_preview, run_gl_preview


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def main() -> None:
    default_dir = _repo_root() / "assets" / "argenti"
    parser = argparse.ArgumentParser(
        description="Spine 4.2 + 图集 角色贴图预览（需 *.json 非 _ske，及 1302.atlas + 1302.png）"
    )
    parser.add_argument(
        "--dir",
        type=Path,
        default=default_dir,
        help="含 Spine .json、1302.atlas、1302.png 的目录（默认：仓库 assets/argenti）",
    )
    parser.add_argument(
        "--mode",
        choices=("mesh", "bitmap"),
        default="mesh",
        help="mesh=OpenGL 骨骼贴图拼装；bitmap=仅 pygame 显示整张图集（无需 OpenGL）",
    )
    parser.add_argument(
        "--nearest",
        action="store_true",
        help="纹理用最近邻过滤（边缘更硬、像素感；默认与 atlas filter 一致，多为线性）",
    )
    parser.add_argument(
        "--anim",
        type=str,
        default=None,
        metavar="NAME",
        help="循环播放骨骼动画（如 idel、emoji_2）；线性插值，不含 slot/附件切换/IK/网格变形",
    )
    args = parser.parse_args()
    d = args.dir
    if not d.is_dir():
        print(f"目录不存在: {d}")
        sys.exit(1)
    print(f"资源目录: {d.resolve()}")
    if args.mode == "bitmap":
        run_bitmap_preview(d)
    else:
        run_gl_preview(d, nearest=args.nearest, anim_name=args.anim)


if __name__ == "__main__":
    main()
