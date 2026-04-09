"""Spine atlas 文本解析与 UV。"""
from __future__ import annotations

from dataclasses import dataclass

@dataclass
class AtlasRegion:
    name: str
    x: int
    y: int
    w: int
    h: int
    rotate: int  # 0, 90, 180, 270
    orig_w: int
    orig_h: int
    off_x: int
    off_y: int


@dataclass
class AtlasPageInfo:
    """单页图集元数据（与 spine-c Atlas 一致）。"""

    width: int
    height: int
    scale: float  # 导出缩放，仅作说明；PNG 已是缩放后分辨率
    pma: bool  # 预乘 Alpha
    filter_linear: bool


def parse_atlas(text: str) -> tuple[AtlasPageInfo, dict[str, AtlasRegion]]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    page_w = page_h = 0
    atlas_scale = 1.0
    pma = False
    filter_linear = True
    regions: dict[str, AtlasRegion] = {}
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.endswith(".png"):
            i += 1
            continue
        if ln.startswith("size:"):
            parts = ln.split(":")[1].split(",")
            page_w, page_h = int(parts[0]), int(parts[1])
            i += 1
            continue
        if ln.startswith("filter:"):
            rest = ln.split(":", 1)[1].lower()
            filter_linear = "linear" in rest
            i += 1
            continue
        if ln.startswith("scale:"):
            try:
                atlas_scale = float(ln.split(":", 1)[1].strip())
            except ValueError:
                atlas_scale = 1.0
            i += 1
            continue
        if ln.startswith("pma:"):
            pma = ln.split(":", 1)[1].strip().lower() in ("true", "1", "yes")
            i += 1
            continue
        # region name
        name = ln
        i += 1
        rx = ry = rw = rh = 0
        rotate = 0
        off_x = off_y = 0
        ow, oh = rw, rh
        while i < len(lines) and ":" in lines[i] and not lines[i].endswith(".png"):
            key, _, rest = lines[i].partition(":")
            key = key.strip()
            rest = rest.strip()
            if key == "bounds":
                a, b, c, d = [int(x) for x in rest.split(",")]
                rx, ry, rw, rh = a, b, c, d
                ow, oh = rw, rh
            elif key == "rotate":
                try:
                    rotate = int(float(rest))
                except ValueError:
                    rotate = 90 if rest.lower() == "true" else 0
            elif key == "offsets":
                parts = [int(x) for x in rest.split(",")]
                off_x, off_y, ow, oh = parts[0], parts[1], parts[2], parts[3]
            i += 1
        regions[name] = AtlasRegion(name, rx, ry, rw, rh, rotate, ow, oh, off_x, off_y)
    page = AtlasPageInfo(page_w, page_h, atlas_scale, pma, filter_linear)
    return page, regions


def _region_norm_rect(reg: AtlasRegion, page_w: int, page_h: int) -> tuple[float, float, float, float]:
    """spine-c Atlas.c：根据 bounds 与 rotate 得到 u,v,u2,v2（纹理左上为原点）。"""
    x, y, rw, rh = reg.x, reg.y, reg.w, reg.h
    u = x / page_w
    v = y / page_h
    if reg.rotate == 90:
        u2 = (x + rh) / page_w
        v2 = (y + rw) / page_h
    else:
        u2 = (x + rw) / page_w
        v2 = (y + rh) / page_h
    return u, v, u2, v2


def region_uv_to_gl_texcoord(
    reg: AtlasRegion, page_w: int, page_h: int, ru: float, rv: float
) -> tuple[float, float]:
    """
    将 JSON 中 mesh 的 uvs（Spine 的 regionUVs）转为 OpenGL 纹理坐标（左下为原点）。
    算法与 spine-c spMeshAttachment_updateRegion 一致，含 offsets / 旋转 / 裁剪。
    """
    u, v, u2, v2 = _region_norm_rect(reg, page_w, page_h)
    du = u2 - u
    dv = v2 - v
    if du < 1e-9:
        du = 1e-9
    if dv < 1e-9:
        dv = 1e-9

    ow, oh = reg.orig_w, reg.orig_h
    ox, oy = reg.off_x, reg.off_y
    rw, rh = reg.w, reg.h
    deg = reg.rotate

    if deg == 90:
        texture_width = rh / du
        texture_height = rw / dv
        u -= (oh - oy - rh) / texture_width
        v -= (ow - ox - rw) / texture_height
        width = oh / texture_width
        height = ow / texture_height
        out_u = u + rv * width
        out_v = v + (1.0 - ru) * height
    elif deg == 180:
        texture_width = rw / du
        texture_height = rh / dv
        u -= (ow - ox - rw) / texture_width
        v -= oy / texture_height
        width = ow / texture_width
        height = oh / texture_height
        out_u = u + (1.0 - ru) * width
        out_v = v + (1.0 - rv) * height
    elif deg == 270:
        texture_height = rh / dv
        texture_width = rw / du
        u -= oy / texture_width
        v -= ox / texture_height
        width = oh / texture_width
        height = ow / texture_height
        out_u = u + (1.0 - rv) * width
        out_v = v + ru * height
    else:
        texture_width = rw / du
        texture_height = rh / dv
        u -= ox / texture_width
        v -= (oh - oy - rh) / texture_height
        width = ow / texture_width
        height = oh / texture_height
        out_u = u + ru * width
        out_v = v + rv * height

    # Spine 纹理 v 与位图一致（向下）；OpenGL 需翻转
    return out_u, 1.0 - out_v
