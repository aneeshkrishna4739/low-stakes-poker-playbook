"""Inlines css/ and js/ into one self-contained HTML file in dist/.

Run from anywhere:  python tools/build_single_file.py
Re-run it after editing js/data.js so the single-file copy stays in sync.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")


def inline_css(match):
    css = (ROOT / match.group(1)).read_text(encoding="utf-8")
    return "<style>\n" + css + "</style>"


def inline_js(match):
    js = (ROOT / match.group(1)).read_text(encoding="utf-8")
    return "<script>\n" + js + "</script>"


html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

out = ROOT / "dist" / "low-stakes-poker-playbook.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print("Wrote", out)
