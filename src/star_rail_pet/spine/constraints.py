"""Transform 约束（世界平移段）。"""
from __future__ import annotations

import math
from typing import Any

from star_rail_pet.spine.bones import BoneWorld, DEG_RAD, _atan2_deg

def _build_children_by_parent(bones_json: list[dict[str, Any]]) -> dict[int, list[int]]:
    name_to_i = {b["name"]: i for i, b in enumerate(bones_json)}
    ch: dict[int, list[int]] = {i: [] for i in range(len(bones_json))}
    for i, b in enumerate(bones_json):
        p = b.get("parent")
        if p and p in name_to_i:
            ch[name_to_i[p]].append(i)
    return ch


def _compute_one_bone_world(
    i: int,
    worlds_parent_ready: list[BoneWorld],
    bones_json: list[dict[str, Any]],
    name_to_i: dict[str, int],
    skx: float,
    sky: float,
    skeleton_x: float,
    skeleton_y: float,
) -> BoneWorld:
    """在父骨骼世界矩阵已就绪时，计算第 i 根骨的世界矩阵（与 compute_bone_worlds 逻辑一致）。"""
    bone = bones_json[i]
    x = float(bone.get("x", 0))
    y = float(bone.get("y", 0))
    rot = float(bone.get("rotation", 0))
    sx = float(bone.get("scaleX", 1))
    sy = float(bone.get("scaleY", 1))
    shx = float(bone.get("shearX", 0))
    shy = float(bone.get("shearY", 0))
    inherit = bone.get("inherit", "normal")
    parent_name = bone.get("parent")

    if parent_name is None:
        rx = (rot + shx) * DEG_RAD
        ry = (rot + 90 + shy) * DEG_RAD
        la = math.cos(rx) * sx * skx
        lb = math.cos(ry) * sy * skx
        lc = math.sin(rx) * sx * sky
        ld = math.sin(ry) * sy * sky
        return BoneWorld(
            la, lb, lc, ld, x * skx + skeleton_x, y * sky + skeleton_y
        )

    p = worlds_parent_ready[name_to_i[parent_name]]
    pa, pb, pc, pd = p.a, p.b, p.c, p.d
    world_x = pa * x + pb * y + p.world_x
    world_y = pc * x + pd * y + p.world_y

    rx = (rot + shx) * DEG_RAD
    ry = (rot + 90 + shy) * DEG_RAD
    la = math.cos(rx) * sx
    lb = math.cos(ry) * sy
    lc = math.sin(rx) * sx
    ld = math.sin(ry) * sy

    if inherit == "normal":
        a = pa * la + pb * lc
        b = pa * lb + pb * ld
        c = pc * la + pd * lc
        d = pc * lb + pd * ld
        return BoneWorld(a, b, c, d, world_x, world_y)

    if inherit == "onlyTranslation":
        a, b, c, d = la, lb, lc, ld
    elif inherit == "noRotationOrReflection":
        sx_div = 1.0 / skx
        sy_div = 1.0 / sky
        pa2 = pa * sx_div
        pb2 = pb
        pc2 = pc * sy_div
        pd2 = pd
        s = pa2 * pa2 + pc2 * pc2
        if s > 0.0001:
            s = abs(pa2 * pd2 * sy_div - pb2 * sx_div * pc2) / s
            pb2 = pc2 * s
            pd2 = pa2 * s
            prx = _atan2_deg(pc2, pa2)
        else:
            pa2 = 0.0
            pc2 = 0.0
            prx = 90.0 - _atan2_deg(pd2, pb2)
        rx2 = (rot + shx - prx) * DEG_RAD
        ry2 = (rot + shy - prx + 90) * DEG_RAD
        la2 = math.cos(rx2) * sx
        lb2 = math.cos(ry2) * sy
        lc2 = math.sin(rx2) * sx
        ld2 = math.sin(ry2) * sy
        a = pa2 * la2 - pb2 * lc2
        b = pa2 * lb2 - pb2 * ld2
        c = pc2 * la2 + pd2 * lc2
        d = pc2 * lb2 + pd2 * ld2
    elif inherit in ("noScale", "noScaleOrReflection"):
        rot_rad = rot * DEG_RAD
        cosr = math.cos(rot_rad)
        sinr = math.sin(rot_rad)
        za = (pa * cosr + pb * sinr) / skx
        zc = (pc * cosr + pd * sinr) / sky
        s_mag = math.sqrt(za * za + zc * zc)
        if s_mag > 1e-5:
            s_mag = 1.0 / s_mag
        za *= s_mag
        zc *= s_mag
        s_mag = math.sqrt(za * za + zc * zc)
        if inherit == "noScale":
            det_neg = pa * pd - pb * pc < 0
            sk_neg = (skx < 0) != (sky < 0)
            if det_neg != sk_neg:
                s_mag = -s_mag
        rot2 = math.pi / 2 + math.atan2(zc, za)
        zb = math.cos(rot2) * s_mag
        zd = math.sin(rot2) * s_mag
        shxr = shx * DEG_RAD
        shy_r = (90.0 + shy) * DEG_RAD
        la2 = math.cos(shxr) * sx
        lb2 = math.cos(shy_r) * sy
        lc2 = math.sin(shxr) * sx
        ld2 = math.sin(shy_r) * sy
        a = za * la2 + zb * lc2
        b = za * lb2 + zb * ld2
        c = zc * la2 + zd * lc2
        d = zc * lb2 + zd * ld2
    else:
        a = pa * la + pb * lc
        b = pa * lb + pb * ld
        c = pc * la + pd * lc
        d = pc * lb + pd * ld
        return BoneWorld(a, b, c, d, world_x, world_y)

    a *= skx
    b *= skx
    c *= sky
    d *= sky
    return BoneWorld(a, b, c, d, world_x, world_y)


def _recompute_descendants(
    parent_idx: int,
    worlds: list[BoneWorld],
    bones_json: list[dict[str, Any]],
    name_to_i: dict[str, int],
    children: dict[int, list[int]],
    skx: float,
    sky: float,
    skeleton_x: float,
    skeleton_y: float,
) -> None:
    for ci in children.get(parent_idx, []):
        worlds[ci] = _compute_one_bone_world(
            ci, worlds, bones_json, name_to_i, skx, sky, skeleton_x, skeleton_y
        )
        _recompute_descendants(
            ci, worlds, bones_json, name_to_i, children, skx, sky, skeleton_x, skeleton_y
        )


def apply_transform_constraints_translate_world(
    worlds: list[BoneWorld],
    bones_json: list[dict[str, Any]],
    constraints: list[dict[str, Any]],
    skx: float,
    sky: float,
    skeleton_x: float,
    skeleton_y: float,
) -> list[BoneWorld]:
    """
    Spine TransformConstraint 世界空间「绝对平移」部分（_spTransformConstraint_applyAbsoluteWorld 的 translate 段）。
    让五官/发片等骨骼按 mix 跟随目标骨上的锚点，缓解与躯干呼吸不同步的「延迟感」。
    mixY 未写出时与 Spine 一致，按 mixX 处理。
    未实现：约束里的 rotate/scale/shear 及 local/relative 模式。
    """
    if not constraints:
        return worlds
    name_to_i = {b["name"]: i for i, b in enumerate(bones_json)}
    children = _build_children_by_parent(bones_json)
    ws = list(worlds)

    for c in sorted(constraints, key=lambda x: float(x.get("order", 0))):
        tgt = c.get("target")
        if not tgt or tgt not in name_to_i:
            continue
        tw = ws[name_to_i[tgt]]
        offx = float(c.get("x", 0))
        offy = float(c.get("y", 0))
        ax = tw.a * offx + tw.b * offy + tw.world_x
        ay = tw.c * offx + tw.d * offy + tw.world_y
        mix_x = float(c.get("mixX", 0) or 0)
        # Spine 导出常省略与 mixX 相同的 mixY；当作 0 会导致只跟 X、不跟 Y（呼吸时脸上下「延迟」）
        _my = c.get("mixY")
        mix_y = float(_my) if _my is not None else mix_x
        if mix_x == 0 and mix_y == 0:
            continue
        for bname in c.get("bones", []):
            if bname not in name_to_i:
                continue
            bi = name_to_i[bname]
            bw = ws[bi]
            if mix_x != 0:
                bw.world_x += (ax - bw.world_x) * mix_x
            if mix_y != 0:
                bw.world_y += (ay - bw.world_y) * mix_y
            _recompute_descendants(
                bi, ws, bones_json, name_to_i, children, skx, sky, skeleton_x, skeleton_y
            )
    return ws
