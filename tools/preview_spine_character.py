"""薄入口：将仓库根加入 PYTHONPATH 后调用包内 CLI。"""
from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from star_rail_pet.preview_entry import main

if __name__ == "__main__":
    main()
