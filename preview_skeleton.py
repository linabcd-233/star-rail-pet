"""
加载 DragonBones ske.json，控制台打印摘要，并用 Pygame 绘制骨骼层级（休息姿态近似）。
完整角色贴图需同目录的纹理图集（*_tex.json / *.png）与皮肤数据，此处先验证骨架可读。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

# 默认使用你转换后的文件路径（可通过命令行覆盖）
_REPO = Path(__file__).resolve().parent
DEFAULT_SKE = _REPO / "assets" / "argenti" / "1302.1a88ff13_ske.json"


def load_skeleton(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def summarize(data: dict) -> None:
    print("name:", data.get("name"))
    print("version:", data.get("version"), "frameRate:", data.get("frameRate"))
    for arm in data.get("armature", []):
        print("  armature:", arm.get("name"))
        print("    bones:", len(arm.get("bone", [])))
        print("    slots:", len(arm.get("slot", [])))
        anims = arm.get("animation", [])
        print("    animations:", [a.get("name") for a in anims])
        for a in anims:
            dur = a.get("duration")
            if dur is not None:
                print(f"      - {a.get('name')}: duration={dur} frames")


def world_transforms(bones: list[dict]) -> dict[str, tuple[float, float, float]]:
    """返回每个骨骼的世界 (x, y, 累积旋转弧度)。简化：skX/skY 相等时视为旋转。"""
    by_name = {b["name"]: b for b in bones}

    memo: dict[str, tuple[float, float, float]] = {}

    def rot_from_t(t: dict) -> float:
        skx = t.get("skX", 0.0)
        sky = t.get("skY", 0.0)
        if abs(skx - sky) < 1e-3:
            return math.radians(skx)
        return math.radians(skx)

    def walk(name: str) -> tuple[float, float, float]:
        if name in memo:
            return memo[name]
        b = by_name[name]
        t = b.get("transform") or {}
        lx, ly = float(t.get("x", 0)), float(t.get("y", 0))
        lr = rot_from_t(t)
        parent = b.get("parent")
        if not parent:
            wx, wy, wr = lx, ly, lr
        else:
            px, py, pr = walk(parent)
            c, s = math.cos(pr), math.sin(pr)
            wx = px + lx * c - ly * s
            wy = py + lx * s + ly * c
            wr = pr + lr
        memo[name] = (wx, wy, wr)
        return memo[name]

    for b in bones:
        walk(b["name"])
    return memo


def run_pygame(ske_path: Path) -> None:
    import pygame

    data = load_skeleton(ske_path)
    arm = data["armature"][0]
    bones = arm["bone"]
    world = world_transforms(bones)
    by_name = {b["name"]: b for b in bones}

    pygame.init()
    w, h = 900, 700
    screen = pygame.display.set_mode((w, h))
    pygame.display.set_caption(f"DragonBones 骨骼预览 — {ske_path.name}")
    font = pygame.font.SysFont("microsoftyahei,simsun,arial", 16)
    clock = pygame.time.Clock()

    # 将角色移到视窗中心并缩放（原始坐标约千级）
    xs = [world[n][0] for n in world]
    ys = [world[n][1] for n in world]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
    scale = min(w, h) * 0.4 / span

    def to_screen(x: float, y: float) -> tuple[int, int]:
        sx = w / 2 + (x - cx) * scale
        sy = h / 2 - (y - cy) * scale
        return int(sx), int(sy)

    frame = 0
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False

        screen.fill((24, 26, 32))
        # 骨骼连线
        for b in bones:
            parent = b.get("parent")
            if not parent:
                continue
            p0 = to_screen(*world[parent][:2])
            p1 = to_screen(*world[b["name"]][:2])
            pygame.draw.line(screen, (120, 200, 255), p0, p1, 2)
        # 关节点
        for name, (wx, wy, _) in world.items():
            pygame.draw.circle(screen, (255, 200, 120), to_screen(wx, wy), 3)

        info = [
            f"文件: {ske_path.name}",
            f"骨骼数: {len(bones)} | 帧: {frame} | FPS: {int(clock.get_fps())}",
            "ESC 退出",
        ]
        y0 = 8
        for line in info:
            screen.blit(font.render(line, True, (220, 220, 230)), (8, y0))
            y0 += 22

        pygame.display.flip()
        clock.tick(60)
        frame += 1

    pygame.quit()


def main() -> None:
    parser = argparse.ArgumentParser(description="DragonBones ske.json 骨骼线框预览")
    parser.add_argument(
        "ske",
        nargs="?",
        type=Path,
        default=DEFAULT_SKE,
        help="ske.json 路径",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="仅打印摘要，不打开窗口（适合无图形环境）",
    )
    args = parser.parse_args()
    ske = args.ske
    if not ske.is_file():
        print(f"找不到文件: {ske}")
        print("用法: python preview_skeleton.py [ske.json] [--summary-only]")
        sys.exit(1)
    data = load_skeleton(ske)
    summarize(data)
    if args.summary_only:
        return
    print("\n启动 Pygame 窗口…")
    run_pygame(ske)


if __name__ == "__main__":
    main()
