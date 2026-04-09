"""Mesh 附件、场景加载。"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from star_rail_pet.spine.atlas import AtlasPageInfo, AtlasRegion, parse_atlas
from star_rail_pet.spine.bones import BoneWorld, transform_vertex

def resolve_attachment(
    attachments: dict[str, dict[str, Any]],
    slot_name: str,
    att_name: str,
) -> tuple[dict[str, Any], str] | None:
    """返回 (合并后的 mesh 数据, 图集路径名用于查 region)。"""
    slot_atts = attachments.get(slot_name)
    if not slot_atts or att_name not in slot_atts:
        return None
    att = slot_atts[att_name]
    t = att.get("type")
    if t == "mesh":
        return att, att.get("path") or att_name
    if t == "linkedmesh":
        parent_name = att["parent"]
        parent = slot_atts.get(parent_name)
        if not parent or parent.get("type") != "mesh":
            return None
        merged = dict(parent)
        merged.update({k: v for k, v in att.items() if k not in ("type", "parent")})
        merged["type"] = "mesh"
        path = att.get("path") or att_name
        return merged, path
    return None


@dataclass
class MeshSlotStatic:
    """不含世界坐标的 mesh 绘制单元（纹理坐标每帧不变）。"""

    slot_name: str
    att_name: str
    uvs: list[float]
    triangles: list[int]
    vertices_flat: list[float]
    region: AtlasRegion


def mesh_world_vertices(
    vertices_flat: list[float], bone_worlds: list[BoneWorld]
) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    i = 0
    n = len(vertices_flat)
    while i < n:
        bone_count = int(vertices_flat[i])
        i += 1
        wx = wy = 0.0
        for _ in range(bone_count):
            bi = int(vertices_flat[i])
            vx = float(vertices_flat[i + 1])
            vy = float(vertices_flat[i + 2])
            w = float(vertices_flat[i + 3])
            i += 4
            bw = bone_worlds[bi]
            tx, ty = transform_vertex(bw, vx, vy)
            wx += tx * w
            wy += ty * w
        out.append((wx, wy))
    return out


def _find_spine_json(assets_dir: Path, spine_glob: str = "*.json") -> Path | None:
    pat = spine_glob if "*" in spine_glob else spine_glob
    jsons = sorted(
        p
        for p in assets_dir.glob(pat)
        if p.suffix.lower() == ".json" and "_ske" not in p.name.lower()
    )
    if not jsons:
        jsons = sorted(assets_dir.glob("*.json"))
        jsons = [p for p in jsons if "_ske" not in p.name.lower()]
    return jsons[0] if jsons else None


def load_spine_mesh_scene(
    assets_dir: Path,
    spine_glob: str = "*.json",
) -> tuple[
    Path,
    Path,
    Path,
    AtlasPageInfo,
    int,
    int,
    dict[str, AtlasRegion],
    dict[str, Any],
    list[dict[str, Any]],
    list[MeshSlotStatic],
    dict[str, Any],
    list[dict[str, Any]],
]:
    spine_path = _find_spine_json(assets_dir, spine_glob)
    if not spine_path:
        print(f"在 {assets_dir} 未找到 Spine JSON（不含 _ske）")
        sys.exit(1)
    atlas_path = assets_dir / "1302.atlas"
    png_path = next(
        (p for p in (assets_dir / "1302.png", assets_dir / "1302.PNG") if p.is_file()),
        None,
    )
    if not atlas_path.is_file() or png_path is None:
        print(f"需要同目录存在 1302.atlas 与 1302.png，当前: {assets_dir}")
        sys.exit(1)

    data = json.loads(spine_path.read_text(encoding="utf-8"))
    sk = data.get("skeleton", {})
    bones_json = data["bones"]
    slots = data["slots"]
    skin_atts = data["skins"][0]["attachments"]

    page_info, regions = parse_atlas(atlas_path.read_text(encoding="utf-8"))
    if page_info.width <= 0:
        print("atlas 解析失败：未找到 size")
        sys.exit(1)
    page_w, page_h = page_info.width, page_info.height

    mesh_slots: list[MeshSlotStatic] = []
    for slot in slots:
        att_name = slot.get("attachment")
        if not att_name:
            continue
        slot_name = slot["name"]
        resolved = resolve_attachment(skin_atts, slot_name, att_name)
        if not resolved:
            continue
        mesh, path_key = resolved
        if mesh.get("type") != "mesh":
            continue
        region = regions.get(path_key) or regions.get(att_name)
        if not region:
            continue
        mesh_slots.append(
            MeshSlotStatic(
                slot_name=slot_name,
                att_name=att_name,
                uvs=mesh["uvs"],
                triangles=mesh["triangles"],
                vertices_flat=mesh["vertices"],
                region=region,
            )
        )

    if not mesh_slots:
        print("没有可绘制的 mesh（检查 region 名称与 path 是否与 atlas 一致）")
        sys.exit(1)

    anims = data.get("animations", {})
    if isinstance(anims, list):
        anims = {a["name"]: a for a in anims if isinstance(a, dict) and "name" in a}
    transform_defs = data.get("transform") or []
    if not isinstance(transform_defs, list):
        transform_defs = []

    return (
        spine_path,
        atlas_path,
        png_path,
        page_info,
        page_w,
        page_h,
        regions,
        sk,
        bones_json,
        mesh_slots,
        anims,
        transform_defs,
    )
