"""向后兼容：请使用 `from star_rail_pet.anim.sample import ...`。"""
from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from star_rail_pet.anim.sample import animation_duration_seconds, apply_animation_to_bones

__all__ = ["animation_duration_seconds", "apply_animation_to_bones"]
