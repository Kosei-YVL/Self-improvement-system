from pathlib import Path
import argparse,hashlib,json,shutil,zipfile

ROOT=Path(__file__).resolve().parent.parent
ART=Path('/workspace/artifacts')
QA=ROOT/'qa/focus-refinement'
PRIVATE={'focus-data','sync-key.txt','server-config.json','google-config.json','google-token-key.txt','desktop-session.json','desktop-start.lock','desktop-server.log','pending-migration.json','local-network.json','phone-setup.html','.env'}
parser=argparse.ArgumentParser();parser.add_argument('--round',type=int,choices=[1,2,3],required=True);parser.add_argument('--migration',type=Path);args=parser.parse_args()
name=f'Focus-refinement-r{args.round}-20261029'
stage=ART/name
if stage.exists():shutil.rmtree(stage)
stage.mkdir(parents=True)
payload=stage/'payload';shutil.copytree(ROOT/'focus-sync',payload)
updater=(ROOT/'scripts/update-focus.mjs').read_text().replace("'../web/focus-migrate.mjs'","'./payload/web/focus-migrate.mjs'")
(stage/'updater.mjs').write_text(updater)
shutil.copy2(ROOT/'scripts/focus-windows-launcher.mjs',stage/'focus-windows-launcher.mjs')
shutil.copy2(ROOT/'scripts/setup-focus-network.mjs',stage/'setup-network.mjs')
shutil.copy2(ROOT/'scripts/focus-origin.mjs',stage/'focus-origin.mjs')
shutil.copytree(ROOT/'scripts/vendor',stage/'vendor')
network_content=(ROOT/'deploy/windows/SETUP-NETWORK.vbs').read_text().replace('\r\n','\n').replace('\n','\r\n');(stage/'SETUP-NETWORK.vbs').write_bytes(b'\xff\xfe'+network_content.encode('utf-16le'))
content=(ROOT/'deploy/windows/UPDATE-FOCUS.vbs').read_text().replace('\r\n','\n').replace('\n','\r\n');(stage/'UPDATE-FOCUS.vbs').write_bytes(b'\xff\xfe'+content.encode('utf-16le'))
base_path=QA/'base-assets.json';bases=json.loads(base_path.read_text()) if base_path.exists() else []
current=hashlib.sha256((payload/'app-assets.json').read_bytes()).hexdigest()
if current not in bases:bases.append(current)
base_path.write_text(json.dumps(bases))
files=[]
for path in sorted(payload.rglob('*')):
    if path.is_file():files.append({'scope':'app','path':str(path.relative_to(payload)),'source':str(path.relative_to(payload)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
for file in ['Focus.vbs','INSTALL-FOCUS.vbs','focus-paths.mjs','focus-launcher.mjs','focus.ico','FOCUS-WINDOWS.md']:
    files.append({'scope':'root','path':file,'source':file,'sha256':hashlib.sha256((payload/file).read_bytes()).hexdigest()})
manifest={'format':'focus-update','version':1,'id':name,'environment':'personal','baseAssets':bases,'files':files}
if args.migration:
    shutil.copy2(args.migration,stage/'migration.json');manifest['migration']='migration.json'
(stage/'update-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(stage/'使い方.txt').write_text('UPDATE-FOCUS.vbsを開き、今使っているFocusフォルダーを選びます。\nアプリ本体を更新し、記録・設定・同期キーは元の保存先へ残します。\n控えはfocus-data/personal/updates/に保存します。旧START-WINDOWS.cmdから起動中の場合は、先に黒い画面を閉じます。\n更新後はFocusが開きます。移行ファイル同梱版は、既存データへNotionのタスクと記録を追加します。\n同じブラウザ・プロファイルで使い続けてください。Windows実機の起動・ショートカットは未検証です。\n',encoding='utf-8-sig')
source=stage/'source';source.mkdir()
for folder in ['web','scripts','tests','focus-server','deploy','worker','db','drizzle']:
    shutil.copytree(ROOT/folder,source/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
for file in ['package.json','package-lock.json','.gitignore','drizzle.config.ts',*list(p.name for p in ROOT.glob('*.md'))]:shutil.copy2(ROOT/file,source/file)
(source/'README.md').write_text('# Focus source\n\nNode.js 24以上。普段使いのfocus-data/とブラウザ保存領域を保持し、開発用の別環境で変更を確認してください。\n\n- node scripts/build-focus-sync.mjs: 普段用のfocus-sync/をビルド\n- node scripts/build-focus-sync.mjs --dev: 分離したfocus-development/をビルド\n- FOCUS-THREE-SCREEN.md: 現行UI・保存・更新\n- FOCUS-DEVELOPMENT.md: データ形式と開発時の確認\n- FOCUS-PRIVATE-NETWORK.md: 私用PC/iPhone接続\n- FOCUS-GOOGLE.md: Google OAuth初期設定\n\n旧UIの文書も履歴として含みます。現行の画面と検証結果はFOCUS-THREE-SCREEN.mdとvalidation/を参照してください。\n')
if (QA/f'round{args.round}').exists():shutil.copytree(QA/f'round{args.round}',stage/'validation')
target=ART/(name+('.personal.zip' if args.migration else '.zip'))
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
    for path in sorted(stage.rglob('*')):
        if not path.is_file():continue
        assert not PRIVATE.intersection(path.relative_to(stage).parts) and '.sqlite' not in path.name,path
        z.write(path,'Focus-update/'+str(path.relative_to(stage)))
with zipfile.ZipFile(target) as z:assert z.testzip() is None
metadata={'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'round':args.round,'personal':bool(args.migration)}
(ART/(name+('-personal' if args.migration else '')+'-manifest.json')).write_text(json.dumps(metadata,indent=2))
print(json.dumps(metadata))
