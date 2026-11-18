"""Create OmniMail color variants of the supplied Lottie files; retain originals."""
import json
import sys
from pathlib import Path

PALETTE = {
    (1, .694, .078): "674cfb",
    (1, .871, .439): "e9e5ff",
    (.063, .129, .251): "243648",
    (.082, .165, .322): "354d61",
    (.82, .2, .29): "5140b8",
    (.937, .337, .408): "fd6f41",
    (.922, .282, .361): "fd6f41",
    (.106, .318, .776): "674cfb",
    (.396, .518, .776): "a696ef",
    (.8, .769, .8): "d7e1e7",
    (.859, .824, .859): "e9e5ff",
    (.071, .467, .333): "226d5c",
    (.2, .62, .494): "52a58c",
}


def recolor(node):
    changed = 0
    if isinstance(node, dict):
        if node.get("ty") in ("fl", "st"):
            color = node.get("c", {}).get("k")
            if isinstance(color, list) and len(color) == 4 and all(isinstance(v, (int, float)) for v in color):
                replacement = PALETTE.get(tuple(round(v, 3) for v in color[:3]))
                if replacement:
                    node["c"]["k"] = [round(int(replacement[i:i+2], 16) / 255, 6) for i in (0, 2, 4)] + [color[3]]
                    changed += 1
        for value in node.values():
            changed += recolor(value)
    elif isinstance(node, list):
        for value in node:
            changed += recolor(value)
    return changed


if __name__ == "__main__":
    output = Path(__file__).resolve().parents[1] / "apps/web/public/animations"
    output.mkdir(parents=True, exist_ok=True)
    for source in map(Path, sys.argv[1:]):
        data = json.loads(source.read_text(encoding="utf-8-sig"))
        count = recolor(data)
        target = output / source.name
        if target.resolve() == source.resolve():
            raise ValueError("Source and output must be different files")
        target.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{target.name}: adapted {count} colors; retained timing, paths and metadata")
