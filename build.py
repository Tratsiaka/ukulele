#!/usr/bin/env python3
"""Собирает PWA «Уке» в docs/ (оттуда её раздаёт GitHub Pages).

Нужны Node.js и `npm install`. Запуск: `python3 build.py` (или `npm run build`).
src/main.jsx → esbuild → docs/assets/app.js + app.css; шаблоны index.html и sw.js получают версию (хэш сборки);
src/static/* копируется как есть.
"""
import gzip, hashlib, pathlib, shutil, subprocess, sys

root = pathlib.Path(__file__).parent
src, dist = root / "src", root / "docs"
esbuild = root / "node_modules" / ".bin" / "esbuild"
JS_BUDGET_GZ = 180 * 1024  # ~треть — собственный контент: уроки и стартовые песни

if not esbuild.exists():
    sys.exit("нет node_modules: сначала npm install")
if dist.exists():
    shutil.rmtree(dist)
(dist / "assets").mkdir(parents=True)

subprocess.run([
    str(esbuild), str(src / "main.jsx"), "--bundle", "--minify", "--format=esm", "--target=es2020,chrome100,safari15",
    "--jsx=automatic", "--jsx-import-source=preact", "--loader:.json=json", "--loader:.svg=text", "--legal-comments=none",
    "--log-level=warning", f"--outdir={dist / 'assets'}", "--entry-names=app",
], check=True)

static = src / "static"
if static.exists():
    shutil.copytree(static, dist, dirs_exist_ok=True)

assets = sorted(p for p in (dist / "assets").iterdir() if p.is_file())
version = hashlib.sha1(b"".join(p.read_bytes() for p in assets) + b"".join(
    p.read_bytes() for p in sorted(static.rglob("*")) if p.is_file()) if static.exists() else b"").hexdigest()[:8]

(dist / "index.html").write_text((src / "index.tpl.html").read_text(encoding="utf-8").replace("__V__", version), encoding="utf-8")
(dist / "sw.js").write_text((src / "sw.tpl.js").read_text(encoding="utf-8").replace("__V__", version), encoding="utf-8")
(dist / ".nojekyll").write_text("", encoding="utf-8")

gz = lambda p: len(gzip.compress(p.read_bytes(), 9))
js = dist / "assets" / "app.js"
css = dist / "assets" / "app.css"
js_gz = gz(js)
total = sum(p.stat().st_size for p in dist.rglob("*") if p.is_file())
print(f"version {version} · app.js {js.stat().st_size/1024:.0f} KB ({js_gz/1024:.1f} KB gz)"
      + (f" · app.css {css.stat().st_size/1024:.0f} KB ({gz(css)/1024:.1f} KB gz)" if css.exists() else "")
      + f" · всего {total/1024:.0f} KB")
if js_gz > JS_BUDGET_GZ:
    print(f"warning: app.js больше бюджета {JS_BUDGET_GZ//1024} KB gz")
