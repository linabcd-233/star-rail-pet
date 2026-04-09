"""
Spine 4.2 JSON 骨骼动画线性采样（用于程序内预览，非完整运行时）。
- rotate / translate / shear：相对 setup 的加性偏移（与 spine 常见行为一致）
- scale：相对 setup 的乘性系数
- 忽略贝塞尔 curve，关键帧之间线性插值；stepped 近似为线性。
"""
from __future__ import annotations

import copy
from typing import Any


def animation_duration_seconds(anim: dict[str, Any]) -> float:
    m = 0.0

    def scan(frames: Any) -> None:
        nonlocal m
        if not isinstance(frames, list):
            return
        for fr in frames:
            if isinstance(fr, dict) and "time" in fr:
                m = max(m, float(fr["time"]))

    for btracks in (anim.get("bones") or {}).values():
        for frames in btracks.values():
            scan(frames)
    for stracks in (anim.get("slots") or {}).values():
        for frames in stracks.values():
            scan(frames)
    for _ikn, ik_data in (anim.get("ik") or {}).items():
        if isinstance(ik_data, list):
            scan(ik_data)
        elif isinstance(ik_data, dict):
            for frames in ik_data.values():
                scan(frames)
    return max(m, 1e-3)


def _key_time(frames: list[dict], index: int) -> float:
    if index == 0:
        return 0.0
    return float(frames[index]["time"])


def _expand_scalar_channel(
    frames: list[dict], key: str, default: float
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    cur = default
    for i, fr in enumerate(frames):
        ti = _key_time(frames, i)
        if key in fr:
            cur = float(fr[key])
        pts.append((ti, cur))
    return pts


def _sample_piecewise_linear(pts: list[tuple[float, float]], t: float) -> float:
    if not pts:
        return 0.0
    if t <= pts[0][0]:
        return pts[0][1]
    if t >= pts[-1][0]:
        return pts[-1][1]
    for i in range(len(pts) - 1):
        t0, v0 = pts[i]
        t1, v1 = pts[i + 1]
        if t0 <= t <= t1:
            if t1 <= t0:
                return v1
            a = (t - t0) / (t1 - t0)
            return v0 + (v1 - v0) * a
    return pts[-1][1]


def _sample_rotate(frames: list[dict], t: float) -> float:
    pts = _expand_scalar_channel(frames, "value", 0.0)
    return _sample_piecewise_linear(pts, t)


def _sample_translate(frames: list[dict], t: float) -> tuple[float, float]:
    px = _expand_scalar_channel(frames, "x", 0.0)
    py = _expand_scalar_channel(frames, "y", 0.0)
    return _sample_piecewise_linear(px, t), _sample_piecewise_linear(py, t)


def _sample_scale(frames: list[dict], t: float) -> tuple[float, float]:
    px = _expand_scalar_channel(frames, "x", 1.0)
    py = _expand_scalar_channel(frames, "y", 1.0)
    return _sample_piecewise_linear(px, t), _sample_piecewise_linear(py, t)


def _sample_shear(frames: list[dict], t: float) -> tuple[float, float]:
    px = _expand_scalar_channel(frames, "x", 0.0)
    py = _expand_scalar_channel(frames, "y", 0.0)
    return _sample_piecewise_linear(px, t), _sample_piecewise_linear(py, t)


def apply_animation_to_bones(
    bones_template: list[dict[str, Any]], anim: dict[str, Any], t: float
) -> list[dict[str, Any]]:
    """返回应用动画后的骨骼列表（深拷贝，顺序与 template 一致）。"""
    name_to_idx = {b["name"]: i for i, b in enumerate(bones_template)}
    out = [copy.deepcopy(b) for b in bones_template]

    for bone_name, tracks in (anim.get("bones") or {}).items():
        if bone_name not in name_to_idx:
            continue
        bi = name_to_idx[bone_name]
        base = bones_template[bi]
        b = out[bi]

        if "rotate" in tracks:
            off = _sample_rotate(tracks["rotate"], t)
            b["rotation"] = float(base.get("rotation", 0)) + off
        if "translate" in tracks:
            dx, dy = _sample_translate(tracks["translate"], t)
            b["x"] = float(base.get("x", 0)) + dx
            b["y"] = float(base.get("y", 0)) + dy
        if "scale" in tracks:
            sx, sy = _sample_scale(tracks["scale"], t)
            b["scaleX"] = float(base.get("scaleX", 1)) * sx
            b["scaleY"] = float(base.get("scaleY", 1)) * sy
        if "shear" in tracks:
            shx, shy = _sample_shear(tracks["shear"], t)
            b["shearX"] = float(base.get("shearX", 0)) + shx
            b["shearY"] = float(base.get("shearY", 0)) + shy

    return out
