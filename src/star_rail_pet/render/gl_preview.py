"""Pygame + OpenGL 预览窗口。"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from star_rail_pet.anim.sample import animation_duration_seconds, apply_animation_to_bones
from star_rail_pet.spine.bones import ortho_size_match_viewport
from star_rail_pet.spine.draw import mesh_draws_for_bones
from star_rail_pet.spine.mesh_scene import load_spine_mesh_scene


def run_bitmap_preview(assets_dir: Path) -> None:
    """仅 pygame：缩放显示整张 1302.png（无 OpenGL、无骨骼）。"""
    import pygame

    png_path = next(
        (p for p in (assets_dir / "1302.png", assets_dir / "1302.PNG") if p.is_file()),
        None,
    )
    if png_path is None:
        print(f"未找到 1302.png：{assets_dir}")
        sys.exit(1)
    pygame.init()
    w, h = 900, 800
    screen = pygame.display.set_mode((w, h))
    pygame.display.set_caption(f"图集整图预览 — {png_path.name}")
    img = pygame.image.load(str(png_path)).convert_alpha()
    iw, ih = img.get_size()
    scale = min(w / iw, h / ih) * 0.95
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    scaled = pygame.transform.smoothscale(img, (nw, nh))
    font = pygame.font.SysFont("microsoftyahei,simsun,arial", 16)
    clock = pygame.time.Clock()
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT or (
                event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE
            ):
                running = False
        screen.fill((24, 26, 32))
        screen.blit(scaled, ((w - nw) // 2, (h - nh) // 2))
        screen.blit(
            font.render("ESC 退出 | 此为整张图集，非骨骼拼装", True, (230, 230, 240)),
            (8, 8),
        )
        pygame.display.flip()
        clock.tick(60)
    pygame.quit()


def run_gl_preview(
    assets_dir: Path,
    spine_glob: str = "*.json",
    *,
    nearest: bool = False,
    anim_name: str | None = None,
) -> None:
    try:
        from OpenGL.GL import (
            GL_BLEND,
            GL_COLOR_BUFFER_BIT,
            GL_DEPTH_TEST,
            GL_LINEAR,
            GL_MODELVIEW,
            GL_NEAREST,
            GL_ONE,
            GL_ONE_MINUS_SRC_ALPHA,
            GL_PROJECTION,
            GL_RGBA,
            GL_SRC_ALPHA,
            GL_TEXTURE_2D,
            GL_TEXTURE_MAG_FILTER,
            GL_TEXTURE_MIN_FILTER,
            GL_TRIANGLES,
            GL_UNPACK_ALIGNMENT,
            GL_UNSIGNED_BYTE,
            glBegin,
            glBindTexture,
            glBlendFunc,
            glClear,
            glClearColor,
            glDisable,
            glEnable,
            glEnd,
            glGenTextures,
            glLoadIdentity,
            glMatrixMode,
            glOrtho,
            glPixelStorei,
            glTexCoord2f,
            glTexImage2D,
            glTexParameteri,
            glVertex2f,
            glViewport,
        )
    except ImportError as e:
        print("缺少依赖，请执行: pip install PyOpenGL PyOpenGL_accelerate pygame")
        print(e)
        sys.exit(1)

    (
        spine_path,
        _atlas,
        png_path,
        page_info,
        page_w,
        page_h,
        _regions,
        sk,
        bones_template,
        mesh_slots,
        anims,
        transform_defs,
    ) = load_spine_mesh_scene(assets_dir, spine_glob)

    if page_info.scale < 0.999:
        print(
            f"提示：atlas 中 scale={page_info.scale}，图集为低分辨率导出，放大后会偏糊；"
            "可在 Spine 导出更高倍率 PNG 改善。"
        )

    import pygame

    pygame.init()

    anim: dict[str, Any] | None = None
    anim_dur = 0.0
    if anim_name:
        if anim_name not in anims:
            print(f"未找到动画「{anim_name}」。可用: {', '.join(sorted(anims.keys()))}")
            sys.exit(1)
        anim = anims[anim_name]
        anim_dur = animation_duration_seconds(anim)
        print(
            f"播放动画: {anim_name}，时长约 {anim_dur:.3f}s，循环；"
            "未实现 slot/IK/变形/贝塞尔；已应用 JSON 中 transform 的 mixX/mixY 世界平移"
        )

    def pose_draws() -> tuple[
        list[tuple[str, str, list[tuple[float, float, float, float]]]],
        list[float],
        list[float],
    ]:
        if anim is None:
            b = bones_template
        else:
            t = (pygame.time.get_ticks() / 1000.0) % anim_dur
            b = apply_animation_to_bones(bones_template, anim, t)
        return mesh_draws_for_bones(
            mesh_slots, b, sk, page_w, page_h, transform_defs
        )

    draws, all_x, all_y = pose_draws()
    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    win_w, win_h = 960, 800
    pygame.display.set_mode((win_w, win_h), pygame.DOUBLEBUF | pygame.OPENGL)
    cap = f"Spine 贴图预览 — {spine_path.name}"
    if anim_name:
        cap += f" | {anim_name}"
    pygame.display.set_caption(cap)

    surf = pygame.image.load(str(png_path)).convert_alpha()
    tw, th = surf.get_size()
    try:
        raw = pygame.image.tobytes(surf, "RGBA", True)
    except TypeError:
        raw = pygame.image.tostring(surf, "RGBA", True)

    glPixelStorei(GL_UNPACK_ALIGNMENT, 1)

    tid = glGenTextures(1)
    tex_id = int(tid[0]) if hasattr(tid, "__len__") else int(tid)
    glBindTexture(GL_TEXTURE_2D, tex_id)
    filt = GL_NEAREST if nearest else (GL_LINEAR if page_info.filter_linear else GL_NEAREST)
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filt)
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filt)
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, tw, th, 0, GL_RGBA, GL_UNSIGNED_BYTE, raw)

    glEnable(GL_BLEND)
    if page_info.pma:
        glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA)
    else:
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)
    glDisable(GL_DEPTH_TEST)
    glClearColor(0.09, 0.1, 0.12, 1.0)

    def apply_ortho(ww: int, hh: int) -> None:
        glViewport(0, 0, ww, hh)
        glMatrixMode(GL_PROJECTION)
        glLoadIdentity()
        ocx, ocy, half_w, half_h = ortho_size_match_viewport(
            min_x, max_x, min_y, max_y, ww, hh, 0.12
        )
        glOrtho(ocx - half_w, ocx + half_w, ocy - half_h, ocy + half_h, -1, 1)
        glMatrixMode(GL_MODELVIEW)
        glLoadIdentity()

    apply_ortho(win_w, win_h)
    clock = pygame.time.Clock()
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False

        glClear(GL_COLOR_BUFFER_BIT)
        glEnable(GL_TEXTURE_2D)
        glBindTexture(GL_TEXTURE_2D, tex_id)

        if anim is not None:
            draws, _, _ = pose_draws()

        for _slot_name, _att_name, tri_verts in draws:
            glBegin(GL_TRIANGLES)
            for wx, wy, tu, tv in tri_verts:
                glTexCoord2f(tu, tv)
                glVertex2f(wx, wy)
            glEnd()

        glDisable(GL_TEXTURE_2D)
        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
