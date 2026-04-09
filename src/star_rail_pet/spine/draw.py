"""根据骨骼姿态生成绘制列表。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from star_rail_pet.spine.bones import compute_bone_worlds
from star_rail_pet.spine.constraints import apply_transform_constraints_translate_world
from star_rail_pet.spine.atlas import region_uv_to_gl_texcoord
from star_rail_pet.spine.mesh_scene import MeshSlotStatic, load_spine_mesh_scene, mesh_world_vertices


def mesh_draws_for_bones(
    mesh_slots: list[MeshSlotStatic],
    bones_json: list[dict[str, Any]],
    sk: dict[str, Any],
    page_w: int,
    page_h: int,
    transform_constraints: list[dict[str, Any]] | None = None,
) -> tuple[list[tuple[str, str, list[tuple[float, float, float, float]]]], list[float], list[float]]:
    sx = float(sk.get("scaleX", 1) or 1)
    sy = float(sk.get("scaleY", 1) or 1)
    if sx == 0:
        sx = 1.0
    if sy == 0:
        sy = 1.0
    skx, sky = sx, sy
    skeleton_x = float(sk.get("x", 0) or 0)
    skeleton_y = float(sk.get("y", 0) or 0)
    bone_worlds = compute_bone_worlds(
        bones_json,
        skeleton_scale_x=skx,
        skeleton_scale_y=sky,
        skeleton_x=skeleton_x,
        skeleton_y=skeleton_y,
    )
    if transform_constraints:
        bone_worlds = apply_transform_constraints_translate_world(
            bone_worlds,
            bones_json,
            transform_constraints,
            skx,
            sky,
            skeleton_x,
            skeleton_y,
        )
    all_x: list[float] = []
    all_y: list[float] = []
    draws: list[tuple[str, str, list[tuple[float, float, float, float]]]] = []
    for m in mesh_slots:
        wv = mesh_world_vertices(m.vertices_flat, bone_worlds)
        for vx, vy in wv:
            all_x.append(vx)
            all_y.append(vy)
        tri_verts: list[tuple[float, float, float, float]] = []
        for ti in range(0, len(m.triangles), 3):
            for k in (0, 1, 2):
                vi = m.triangles[ti + k]
                u, v = m.uvs[vi * 2], m.uvs[vi * 2 + 1]
                wx, wy = wv[vi]
                tu, tv = region_uv_to_gl_texcoord(m.region, page_w, page_h, u, v)
                tri_verts.append((wx, wy, tu, tv))
        draws.append((m.slot_name, m.att_name, tri_verts))
    return draws, all_x, all_y


def build_mesh_draw_list(
    assets_dir: Path,
    spine_glob: str = "*.json",
) -> tuple[
    Path,
    Path,
    Path,
    AtlasPageInfo,
    list[tuple[str, str, list[tuple[float, float, float, float]]]],
    list[float],
    list[float],
]:
    (
        spine_path,
        atlas_path,
        png_path,
        page_info,
        page_w,
        page_h,
        _regions,
        sk,
        bones_json,
        mesh_slots,
        _anims,
        transform_defs,
    ) = load_spine_mesh_scene(assets_dir, spine_glob)
    draws, all_x, all_y = mesh_draws_for_bones(
        mesh_slots, bones_json, sk, page_w, page_h, transform_defs
    )
    return spine_path, atlas_path, png_path, page_info, draws, all_x, all_y
