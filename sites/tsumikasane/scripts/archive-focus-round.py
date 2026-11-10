"""Freeze a runnable local package, the source used, and its test evidence."""
import sys,json,zipfile,hashlib,shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
n=int(sys.argv[1]);qa=root/f'qa/focus-iterations/round{n}';package=root/'focus-test';art=Path('/workspace/artifacts');art.mkdir(exist_ok=True)
summary=(qa/'REPORT.md').read_text()
(package/'今回の改善.md').write_text(summary)
source=qa/'source';source.mkdir(exist_ok=True)
for folder in ['web','scripts','tests']:
 shutil.copytree(root/folder,source/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
for file in ['package.json','package-lock.json','FOCUS.md']:
 if (root/file).exists():shutil.copy2(root/file,source/file)
name=f'Focus-round{n}-20261025.zip';target=art/name
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(package.rglob('*')):
  if f.is_file():z.write(f,'Focus/'+str(f.relative_to(package)))
 for f in sorted(qa.rglob('*')):
  if f.is_file():z.write(f,'Focus/検証/'+str(f.relative_to(qa)))
 for f in [root/'qa/focus/results.json']:
  if f.exists():z.write(f,'Focus/検証/template-results.json')
checksum=hashlib.sha256(target.read_bytes()).hexdigest();(qa/'artifact.json').write_text(json.dumps({'file':name,'sha256':checksum,'bytes':target.stat().st_size},indent=2));print(name,target.stat().st_size,checksum)
