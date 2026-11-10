"""Build a personal offline Windows x64 installer; no signing or deployment."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,argparse
parser=argparse.ArgumentParser();parser.add_argument('--performance',action='store_true');parser.add_argument('--flex',action='store_true');parser.add_argument('--direct',action='store_true');parser.add_argument('--controls',action='store_true');parser.add_argument('--overtime',action='store_true');args=parser.parse_args();stamp='20261101-1' if args.overtime else '20261101' if args.controls else '20261031-1' if args.direct else '20261031' if args.flex else '20261030' if args.performance else '20261029'
ROOT=Path(__file__).resolve().parent.parent;ART=Path('/workspace/artifacts');STAGE=ART/('Focus-windows-installer-'+stamp);PACKAGE=STAGE/'package';RUNTIME=Path('/workspace/tooling/node-windows');NSIS=Path('/workspace/tooling/focus-installer/root/usr');OUT=ART/('Focus-Setup-'+stamp+'-x64.exe')
STAGE.mkdir(exist_ok=True);shutil.rmtree(PACKAGE,ignore_errors=True);PACKAGE.mkdir()
release=ART/('Focus-overtime-20261101/Focus-update' if args.overtime else 'Focus-controls-20261101/Focus-update' if args.controls else 'Focus-direct-placement-20261031/Focus-update' if args.direct else 'Focus-flex-20261031/Focus-update' if args.flex else 'Focus-performance-20261030/Focus-update' if args.performance else 'Focus-premium-20261029/Focus-update')
for name in ['payload']:shutil.copytree(release/name,PACKAGE/name)
for name in ['update-manifest.json','migration.json','updater.mjs','focus-windows-launcher.mjs','focus-paths.mjs']:shutil.copy2(release/name,PACKAGE/name)
installer=(ROOT/'scripts/install-focus-windows.mjs').read_text().replace("'./update-focus.mjs'","'./updater.mjs'").replace("'../web/focus-migrate.mjs'","'./payload/web/focus-migrate.mjs'");(PACKAGE/'install-focus-windows.mjs').write_text(installer)
runtime_info={'version':'24.19.0','platform':'win-x64','sha256':hashlib.sha256((RUNTIME/'node.exe').read_bytes()).hexdigest(),'officialArchiveSHA256':'57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73','source':'https://nodejs.org/dist/v24.19.0/node-v24.19.0-win-x64.zip'};(RUNTIME/'runtime.json').write_text(json.dumps(runtime_info,indent=2))
env={**os.environ,'NSISDIR':str(NSIS/'share/nsis')};compiler=str(NSIS/'bin/makensis');icon=str(ROOT/'deploy/windows/focus.ico');launcher=STAGE/'Focus.exe'
def compile(args,file):subprocess.run([compiler,'-V2',*args,str(ROOT/'deploy/windows/native'/file)],env=env,check=True)
compile(['-DOUTFILE='+str(launcher),'-DICONFILE='+icon],'focus-launcher.nsi')
# Uninstall only known app code. Never recursively remove an installation or any data folder.
manifest=json.loads((PACKAGE/'update-manifest.json').read_text());paths=sorted({f['path'] for f in manifest['files']},reverse=True);directories=set();lines=[]
for path in paths:
 assert Path(path).name not in {'installation.json','sync-key.txt','google-config.json','local-network.json','focus.sqlite'} and not any(x in path for x in ['.sqlite','$','"'])
 lines.append('Delete "$INSTDIR\\'+path.replace('/','\\')+'"')
 for p in Path(path).parents:
  if str(p)!='.':directories.add(p.as_posix())
for path in sorted(directories,key=lambda s:(s.count('/'),s),reverse=True):lines.append('RMDir "$INSTDIR\\'+path.replace('/','\\')+'"')
deletes=STAGE/'delete-code.nsh';deletes.write_text('\n'.join(lines)+'\n')
compile(['-DAPP_VERSION='+('2026.11.01.1' if args.overtime else '2026.11.01' if args.controls else '2026.10.31.1' if args.direct else '2026.10.31' if args.flex else '2026.10.30' if args.performance else '2026.10.29'),'-DPRODUCT_VERSION='+('2.7.1.1' if args.overtime else '2.7.1.0' if args.controls else '2.6.31.1' if args.direct else '2.6.31.0' if args.flex else '2.6.30.0' if args.performance else '2.6.29.0'),'-DOUTFILE='+str(OUT),'-DICONFILE='+icon,'-DPACKAGEROOT='+str(PACKAGE),'-DRUNTIMEROOT='+str(RUNTIME),'-DLAUNCHER='+str(launcher),'-DTOOLSSCRIPT='+str(ROOT/'scripts/focus-desktop-tools.mjs'),'-DGUIDEFILE='+str(ROOT/'FOCUS-INSTALL.md'),'-DDELETEFILES='+str(deletes)],'focus-setup.nsi')
assert OUT.read_bytes()[:2]==b'MZ'
result={'file':str(OUT),'bytes':OUT.stat().st_size,'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'bundledRuntime':runtime_info,'containsPersonalNotionData':True,'signed':False,'windowsNativeExecuted':False,'adminRequired':False,'dataPreservedOnUninstall':True};(ART/('Focus-Setup-'+stamp+'-x64-manifest.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
