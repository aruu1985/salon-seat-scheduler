"""Build an atomic static release for GitHub Pages (no runtime dependencies)."""
from pathlib import Path
import hashlib,json,re,shutil
root=Path(__file__).resolve().parents[1]
out=root/'dist'
if out.exists():shutil.rmtree(out)
out.mkdir()
html=(root/'source/index.html').read_text()
assets=re.findall(r'(?:src|href)="([^"?]+\.(?:js|css))"',html)
for name in assets:
 if name.startswith('https:'):continue
 data=(root/name).read_bytes();hashed=f'{Path(name).stem}.{hashlib.sha256(data).hexdigest()[:16]}{Path(name).suffix}'
 (out/hashed).write_bytes(data);html=html.replace('"'+name+'"','"'+hashed+'"')
build=hashlib.sha256(html.encode()).hexdigest()[:16]
html=html.replace('<head>','<head>\n<meta name="app-build" content="'+build+'">\n<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">')
html=html.replace('V0.12.15 月排班篩選同步版','V0.12.15 月排班篩選同步版 · '+build)
(out/'index.html').write_text(html)
(out/'version.json').write_text(json.dumps({'version':'0.12.15','build':build}))
for name in ['sw.js','manifest.webmanifest','app-icon.svg','gov-holidays']:
 src=root/name
 if src.is_dir():shutil.copytree(src,out/name)
 else:shutil.copy2(src,out/name)
(out/'.nojekyll').touch()
# Branch-based Pages publishes the generated entry and immutable assets at root.
for asset in out.iterdir():
 if asset.is_file():shutil.copy2(asset,root/asset.name)
print(build)
