from pathlib import Path
import hashlib,json,shutil,zipfile

ROOT=Path(__file__).resolve().parent.parent
ART=Path('/workspace/artifacts')
DATE='20261028'
PRIVATE={'sync-key.txt','server-config.json','google-config.json','google-token-key.txt','desktop-session.json','desktop-start.lock','desktop-server.log','.env'}
FILES=['Focus.vbs','INSTALL-FOCUS.vbs','focus-paths.mjs','focus-launcher.mjs','focus.ico','FOCUS-WINDOWS.md']

def launcher_files(target):
    target.mkdir(parents=True,exist_ok=True)
    for name in FILES:
        if name.endswith('.vbs'):
            content=(ROOT/'deploy/windows'/name).read_text().replace('\r\n','\n').replace('\n','\r\n')
            (target/name).write_bytes(b'\xff\xfe'+content.encode('utf-16le'))
        else:
            source=ROOT/('scripts/focus-windows-launcher.mjs' if name=='focus-launcher.mjs' else 'deploy/windows/focus.ico' if name=='focus.ico' else name)
            shutil.copy2(source,target/name)

def archive(stage,target,top):
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
        for file in sorted(stage.rglob('*')):
            if not file.is_file():continue
            assert file.name not in PRIVATE and (not file.name.startswith('.env') or file.name=='.env.example') and '.sqlite' not in file.name,file
            assert not {'focus-data','node_modules','__pycache__'}.intersection(file.relative_to(stage).parts),file
            z.write(file,top+'/'+str(file.relative_to(stage)))
    with zipfile.ZipFile(target) as z:assert z.testzip() is None
    return {'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}

ART.mkdir(exist_ok=True)
addon=ART/f'Focus-startup-{DATE}'
if addon.exists():shutil.rmtree(addon)
launcher_files(addon)
(addon/'最初に読む.txt').write_text('INSTALL-FOCUS.vbsをダブルクリックし、以前のSTART-WINDOWS.cmdがあるFocusフォルダーを選んでください。\n以後はデスクトップのFocusから起動できます。\n既存のアプリフォルダーやfocus-dataを移動する必要はありません。\n詳細・終了方法・検証範囲はFOCUS-WINDOWS.mdを参照してください。\n',encoding='utf-8-sig')
addon_meta=archive(addon,ART/f'Focus-startup-{DATE}.zip','Focus-startup')

stage=ART/f'Focus-windows-{DATE}'
if stage.exists():shutil.rmtree(stage)
stage.mkdir()
for built,destination in [('focus-sync','personal'),('focus-development','development')]:shutil.copytree(ROOT/built,stage/destination)
launcher_files(stage)
source=stage/'source';source.mkdir()
for folder in ['web','scripts','focus-server','tests','drizzle','deploy']:
    shutil.copytree(ROOT/folder,source/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
for name in ['package.json','package-lock.json','.gitignore','FOCUS.md','FOCUS-SYNC.md','FOCUS-THREE-SCREEN.md','FOCUS-DEVELOPMENT.md','FOCUS-GOOGLE.md','FOCUS-WINDOWS.md']:
    shutil.copy2(ROOT/name,source/name)
for name in ['FOCUS-SYNC.md','FOCUS-THREE-SCREEN.md','FOCUS-DEVELOPMENT.md','FOCUS-GOOGLE.md']:shutil.copy2(ROOT/name,stage/name)
for name,folder,command in [('START-WINDOWS.cmd','personal','START-WINDOWS.cmd'),('START-DEVELOPMENT.cmd','development','START-WINDOWS.cmd'),('SETUP-GOOGLE-WINDOWS.cmd','personal','SETUP-GOOGLE-WINDOWS.cmd')]:
    (stage/name).write_bytes(('@echo off\r\ncd /d "%~dp0'+folder+'"\r\ncall '+command+'\r\n').encode())
(stage/'README.md').write_text('# Focus Windows起動版\n\nNode.js 24以上をインストール後、INSTALL-FOCUS.vbsをダブルクリックします。以後はデスクトップのFocusから起動します。詳細はFOCUS-WINDOWS.md。\n\nすでに利用中の場合は起動ツールだけのZIPを既存のFocusへ追加する方法が簡単です。アプリ全体を更新するときはサーバーを終了し、focus-data/を残してコードのみ更新します。同じURL・ブラウザ・プロファイルを使い続け、サイトデータは削除しません。\n\n独立ローカルテスト版です。クラウド公開・実Google認可・共有HTTPS URLの設定は行っていません。PC・iPhone間の利用には別途同期先が必要です。\n\n起動・再起動・同時起動・記録保持をLinux上で自動検証しています。Windowsのショートカット作成・非表示起動・実ウィンドウは実機未検証。validation/REPORT.mdを参照してください。\n')
validation=stage/'validation';validation.mkdir()
for name in ['REPORT.md','results.json','package-results.json','existing-data.png']:
    if (ROOT/'qa/focus-windows'/name).exists():shutil.copy2(ROOT/'qa/focus-windows'/name,validation/name)
for previous in ['focus-google','focus-three-screen']:
    if (ROOT/'qa'/previous).exists():shutil.copytree(ROOT/'qa'/previous,validation/previous)
full_meta=archive(stage,ART/f'Focus-windows-{DATE}.zip','Focus')
manifest={'date':'2026-10-28','addon':addon_meta,'full':full_meta,'windows_native_tested':False}
(ART/f'Focus-windows-{DATE}-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps(manifest,ensure_ascii=False,indent=2))
