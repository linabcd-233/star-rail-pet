"""Spine 4.2 骨骼世界矩阵（对齐 libgdx Bone.updateWorldTransform）。"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

DEG_RAD = math.pi / 180.0


def _atan2_deg(y: float, x: float) -> float:
    return math.degrees(math.atan2(y, x))


@dataclass
class BoneWorld:
    a: float
    b: float
    c: float
    d: float
    world_x: float
    world_y: float


def compute_bone_worlds(
    bones_json: list[dict],
    skeleton_scale_x: float = 1.0,
    skeleton_scale_y: float = 1.0,
    skeleton_x: float = 0.0,
    skeleton_y: float = 0.0,
) -> list[BoneWorld]:
    n = len(bones_json)
    name_to_i = {b["name"]: i for i, b in enumerate(bones_json)}
    out: list[BoneWorld | None] = [None] * n
    skx = skeleton_scale_x if skeleton_scale_x else 1.0
    sky = skeleton_scale_y if skeleton_scale_y else 1.0

    for i, bone in enumerate(bones_json):
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
            out[i] = BoneWorld(
                la,
                lb,
                lc,
                ld,
                x * skx + skeleton_x,
                y * sky + skeleton_y,
            )
            continue

        p = out[name_to_i[parent_name]]
        assert p is not None
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
            out[i] = BoneWorld(a, b, c, d, world_x, world_y)
            continue

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
            out[i] = BoneWorld(a, b, c, d, world_x, world_y)
            continue

        a *= skx
        b *= skx
        c *= sky
        d *= sky
        out[i] = BoneWorld(a, b, c, d, world_x, world_y)

    return [x for x in out if x is not None]

def transform_vertex(bw: BoneWorld, vx: float, vy: float) -> tuple[float, float]:
    return (
        bw.a * vx + bw.b * vy + bw.world_x,
        bw.c * vx + bw.d * vy + bw.world_y,
    )


def ortho_size_match_viewport(
    min_x: float,
    max_x: float,
    min_y: float,
    max_y: float,
    viewport_w: int,
    viewport_h: int,
    margin_frac: float = 0.12,
) -> tuple[float, float, float]:
    """
    返回 (cx, cy, half_w, half_h)，使 glOrtho 的 (right-left)/(top-bottom) == viewport_w/viewport_h，
    避免非正方形视口把角色压扁或拉宽。
    """
    bw = max(max_x - min_x, 1.0)
    bh = max(max_y - min_y, 1.0)
    m = max(bw, bh) * margin_frac
    need_w = bw + 2 * m
    need_h = bh + 2 * m
    aspect = viewport_w / max(viewport_h, 1)
    if need_w / need_h > aspect:
        ortho_w = need_w
        ortho_h = ortho_w / aspect
        if ortho_h < need_h:
            ortho_h = need_h
            ortho_w = ortho_h * aspect
    else:
        ortho_h = need_h
        ortho_w = ortho_h * aspect
        if ortho_w < need_w:
            ortho_w = need_w
            ortho_h = ortho_w / aspect
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    return cx, cy, ortho_w / 2, ortho_h / 2

