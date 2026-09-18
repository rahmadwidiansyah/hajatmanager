#!/usr/bin/env python3
"""Lint XAML WPF: cegah <Color> dipakai sebagai <Brush>.

Crash yang dicegah:
  XamlParseException: Set property 'Panel.Background' threw an exception.
  Inner: '#FF1E2A3A' is not a valid value for property 'Background'.
Penyebab klasik: Background="{DynamicResource SurfaceContainer}"
padahal SurfaceContainer adalah <Color>, bukan <SolidColorBrush>.
Yang benar: SurfaceContainerBrush.

Aturan:
- Kumpulkan semua <Color x:Key="..."> dari Themes/*.xaml sebagai denylist.
- Scan App.xaml + Views/*.xaml untuk properti bertipe Brush yang
  me-refer key Color tersebut via {DynamicResource ...} / {StaticResource ...}.
- Properti yang dicek: Background, Foreground, BorderBrush, RowBackground,
  AlternatingRowBackground, HorizontalGridLinesBrush, VerticalGridLinesBrush.

Usage:
  python3 scripts/check-wpf-brushes.py
Exit 0 jika bersih, 1 jika ada pelanggaran.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WPF_ROOT = ROOT / "windows" / "src" / "HajatManager"
THEMES_DIR = WPF_ROOT / "Themes"

BRUSH_PROPS = (
    "Background",
    "Foreground",
    "BorderBrush",
    "RowBackground",
    "AlternatingRowBackground",
    "HorizontalGridLinesBrush",
    "VerticalGridLinesBrush",
)

COLOR_KEY_RE = re.compile(r'<Color\s+x:Key="([^"]+)"')
RESOURCE_USE_RE = re.compile(
    r"(?P<prop>" + "|".join(BRUSH_PROPS) + r")"
    r'\s*=\s*"\{(?P<kind>DynamicResource|StaticResource)\s+(?P<key>[A-Za-z0-9_.]+)[^}]*\}"'
)

# Key yang memang bukan Brush tapi legal untuk properti Brush.
ALLOWLIST = {"Transparent"}


def collect_color_keys() -> set[str]:
    keys: set[str] = set()
    if not THEMES_DIR.is_dir():
        print(f"::warning::Themes dir tidak ditemukan: {THEMES_DIR}", file=sys.stderr)
        return keys
    for f in sorted(THEMES_DIR.glob("*.xaml")):
        try:
            text = f.read_text(encoding="utf-8")
        except OSError as e:
            print(f"::warning::gagal baca {f}: {e}", file=sys.stderr)
            continue
        keys.update(COLOR_KEY_RE.findall(text))
    return keys


def scan_files(color_keys: set[str]) -> list[str]:
    targets: list[Path] = []
    app_xaml = WPF_ROOT / "App.xaml"
    if app_xaml.is_file():
        targets.append(app_xaml)
    views_dir = WPF_ROOT / "Views"
    if views_dir.is_dir():
        targets.extend(sorted(views_dir.glob("*.xaml")))
    # Sertakan Themes juga: Style di sana tidak boleh memakai Color sbg Brush.
    if THEMES_DIR.is_dir():
        targets.extend(sorted(THEMES_DIR.glob("*.xaml")))

    errors: list[str] = []
    for f in targets:
        try:
            lines = f.read_text(encoding="utf-8").splitlines()
        except OSError as e:
            print(f"::warning::gagal baca {f}: {e}", file=sys.stderr)
            continue
        for i, line in enumerate(lines, start=1):
            for m in RESOURCE_USE_RE.finditer(line):
                key = m.group("key").split(".")[-1]  # dukung Component.Key
                if key in ALLOWLIST:
                    continue
                if key in color_keys:
                    prop = m.group("prop")
                    hint = f"{key}Brush" if f"{key}Brush" not in color_keys else f"<Brush> ({key} adalah Color!)"
                    rel = f.relative_to(ROOT)
                    errors.append(
                        f"{rel}:{i}: {prop} memakai Color '{key}' "
                        f"(akan crash jadi '#FF...' is not valid). "
                        f"Ganti ke '{{DynamicResource {hint}}}'. >> {line.strip()}"
                    )
    return errors


def main() -> int:
    color_keys = collect_color_keys()
    if not color_keys:
        print("check-wpf-brushes: tidak ada <Color> ditemukan, lewati (OK).")
        return 0
    errors = scan_files(color_keys)
    if errors:
        print(f"check-wpf-brushes: {len(errors)} pelanggaran Color-as-Brush:", file=sys.stderr)
        for e in errors:
            print(f"::error::{e}", file=sys.stderr)
        return 1
    print(f"check-wpf-brushes: OK ({len(color_keys)} Color keys, tidak ada penyalahgunaan).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
