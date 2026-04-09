"""向后兼容：请优先使用 `python tools/preview_spine_character.py` 或 `python -m star_rail_pet.preview_entry`。"""
from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from star_rail_pet.preview_entry import main

if __name__ == "__main__":
    main()
