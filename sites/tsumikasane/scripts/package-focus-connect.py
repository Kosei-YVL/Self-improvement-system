from pathlib import Path
import argparse,hashlib,json,shutil,zipfile
ROOT=Path(__file__).resolve().parent.parent;ART=Path('/workspace/artifacts');parser=argparse.ArgumentParser();parser.add_argument('--glass',action='store_true');parser.add_argument('--premium',action='store_true');parser.add_argument('--performance',action='store_true');parser.add_argument('--flex',action='store_true');parser.add_argument('--direct',action='store_true');parser.add_argument('--controls',action='store_true');parser.add_argument('--overtime',action='store_true');args=parser.parse_args();args.controls=args.controls or args.overtime;args.direct=args.direct or args.controls;args.flex=args.flex or args.direct;args.performance=args.performance or args.flex;args.premium=args.premium or args.performance;release_name='Focus-overtime-20261101' if args.overtime else 'Focus-controls-20261101' if args.controls else 'Focus-direct-placement-20261031' if args.direct else 'Focus-flex-20261031' if args.flex else 'Focus-performance-20261030' if args.performance else 'Focus-premium-20261029' if args.premium else 'Focus-connect-glass-20261029' if args.glass else 'Focus-connect-skins-20261029';stage=ART/release_name;target=ART/(release_name+'.zip')
previous_bases=[]
if (stage/'Focus-update/update-manifest.json').exists():previous_bases=json.loads((stage/'Focus-update/update-manifest.json').read_text()).get('baseAssets',[])
if (stage/'Focus-update/payload/app-assets.json').exists():previous_bases.append(hashlib.sha256((stage/'Focus-update/payload/app-assets.json').read_bytes()).hexdigest())
if stage.exists():shutil.rmtree(stage)
root=stage/'Focus-update';shutil.copytree(ART/'Focus-personal-20261029/Focus-update',root)
for name in ['payload','source','validation','vendor']:shutil.rmtree(root/name,ignore_errors=True)
shutil.copytree(ROOT/'focus-sync',root/'payload');shutil.copytree(ROOT/'scripts/vendor',root/'vendor')
shutil.copy2(ROOT/'scripts/focus-paths.mjs',root/'focus-paths.mjs');shutil.copy2(ROOT/'scripts/focus-windows-launcher.mjs',root/'focus-windows-launcher.mjs');shutil.copy2(ROOT/'scripts/focus-origin.mjs',root/'focus-origin.mjs');shutil.copy2(ROOT/'scripts/setup-focus-network.mjs',root/'setup-network.mjs')
updater=(ROOT/'scripts/update-focus.mjs').read_text().replace("'../web/focus-migrate.mjs'","'./payload/web/focus-migrate.mjs'");(root/'updater.mjs').write_text(updater)
connector=(ROOT/'scripts/connect-focus.mjs').read_text().replace("'./update-focus.mjs'","'./updater.mjs'").replace("'./setup-focus-network.mjs'","'./setup-network.mjs'");(root/'connect-focus.mjs').write_text(connector)
for name in ['START-HERE.vbs','UPDATE-FOCUS.vbs','SETUP-NETWORK.vbs']:
 content=(ROOT/'deploy/windows'/name).read_text().replace('\r\n','\n').replace('\n','\r\n');(root/name).write_bytes(b'\xff\xfe'+content.encode('utf-16le'))
bases=list(dict.fromkeys(json.loads((ROOT/'qa/focus-refinement/base-assets.json').read_text())+previous_bases));
for previous in ART.glob('Focus-*/Focus-update/payload/app-assets.json'):
 value=hashlib.sha256(previous.read_bytes()).hexdigest()
 if value not in bases:bases.append(value)
current=hashlib.sha256((root/'payload/app-assets.json').read_bytes()).hexdigest()
if current not in bases:bases.append(current)
files=[]
for path in sorted((root/'payload').rglob('*')):
 if path.is_file():name=path.relative_to(root/'payload').as_posix();files.append({'scope':'app','path':name,'source':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
for name in ['Focus.vbs','INSTALL-FOCUS.vbs','focus-paths.mjs','focus-launcher.mjs','focus.ico','FOCUS-WINDOWS.md']:
 files.append({'scope':'root','path':name,'source':name,'sha256':hashlib.sha256((root/'payload'/name).read_bytes()).hexdigest()})
manifest={'format':'focus-update','version':1,'id':release_name,'environment':'personal','baseAssets':bases,'files':files,'migration':'migration.json'};(root/'update-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
if args.glass or args.premium:
 shutil.copytree(ROOT/'qa/focus-responsive',root/'validation-responsive',ignore=shutil.ignore_patterns('failure-*.png','failures-live.json','progress.json'))
 if (ART/'Focus-glass-demo-20261029.html').exists():shutil.copy2(ART/'Focus-glass-demo-20261029.html',root/'review/Focus-glass-demo-20261029.html')
 for folder in ['focus-glass','focus-calendar']:
  if (ROOT/'qa'/folder).exists():shutil.copytree(ROOT/'qa'/folder,root/('validation-'+folder),ignore=shutil.ignore_patterns('trace.json'))
 shutil.copy2(ROOT/'FOCUS-DESIGN.md',root/'FOCUS-DESIGN.md')
if args.premium:
 shutil.copy2(ROOT/'FOCUS-INSTALL.md',root/'FOCUS-INSTALL.md')
 shutil.copy2(ROOT/'FOCUS-PREMIUM-REPORT.md',root/'FOCUS-PREMIUM-REPORT.md')
 if (ART/'Focus-20-skins-20261029.html').exists():shutil.copy2(ART/'Focus-20-skins-20261029.html',root/'review/Focus-20-skins-20261029.html')
 if (ROOT/'qa/focus-premium').exists():shutil.copytree(ROOT/'qa/focus-premium',root/'validation-premium',ignore=shutil.ignore_patterns('*.png'))
if args.performance:
 shutil.copy2(ROOT/'FOCUS-PERFORMANCE.md',root/'FOCUS-PERFORMANCE.md')
 shutil.copytree(ROOT/'qa/focus-performance',root/'validation-performance',ignore=shutil.ignore_patterns('*.png'))
if args.flex:
 shutil.copy2(ROOT/'FOCUS-FLEX.md',root/'FOCUS-FLEX.md')
 shutil.copytree(ROOT/'qa/focus-flex',root/'validation-flex',ignore=shutil.ignore_patterns('*.png'))
if args.direct:
 shutil.copy2(ROOT/'FOCUS-DIRECT.md',root/'FOCUS-DIRECT.md')
 shutil.copytree(ROOT/'qa/focus-direct',root/'validation-direct',ignore=shutil.ignore_patterns('*.png'))
if args.controls:
 shutil.copy2(ROOT/'FOCUS-CONTROLS.md',root/'FOCUS-CONTROLS.md')
 shutil.copytree(ROOT/'qa/focus-controls',root/'validation-controls',ignore=shutil.ignore_patterns('*.png'))
if args.overtime:
 shutil.copy2(ROOT/'FOCUS-OVERTIME.md',root/'FOCUS-OVERTIME.md')
 shutil.copytree(ROOT/'qa/focus-overtime',root/'validation-overtime',ignore=shutil.ignore_patterns('*.png'))
source=root/'source';source.mkdir()
for folder in ['web','scripts','tests','focus-server','deploy','worker','db','drizzle']:shutil.copytree(ROOT/folder,source/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
for file in ['package.json','package-lock.json','.gitignore','drizzle.config.ts',*list(p.name for p in ROOT.glob('*.md'))]:shutil.copy2(ROOT/file,source/file)
shutil.copy2(ROOT/'FOCUS-THREE-SCREEN.md',source/'README.md');shutil.copytree(ROOT/'qa/focus-connect',root/'validation');shutil.copy2(ART/'Focus-skins-20261029.html',root/'review/Focus-skins-20261029.html');shutil.copy2(ROOT/'FOCUS-PRIVATE-NETWORK.md',root/'FOCUS-PRIVATE-NETWORK.md')
guide='''Focus 更新・PC / iPhone / iPad 接続版

1. Focusの画面を閉じ、ZIPを展開します。旧START-WINDOWS.cmdから起動中なら黒い画面も閉じます。
2. START-HERE.vbsを開き、今使っているFocusフォルダーを選びます。
3. アプリ更新後、Tailscale未導入なら準備の案内が開きます。
4. Windows・iPhone・iPadにTailscaleを入れ、同じ個人アカウントでログインして接続します。
5. Focusの画面を閉じ、START-HERE.vbsを再実行。更新済みのコードは再適用せず、接続設定へ進みます。
6. PCのFocusが同期済みになったら、表示されたQRをiPhoneとiPadそれぞれで読み、Safariで開きます。
7. 共有→ホーム画面に追加。追加したFocusの設定→連携で同期済みを確認。未接続なら案内にある同じ同期キーを設定します。

PCでタスクを選ぶ→iPhoneでも確認→iPhoneで開始→iPadで計測を確認→完了後3台で同じ記録を確認、の順にチェックしてください。

日程のFocus予定はドラッグで5分刻みに移動できます。スマホでは予定右端の⠿をドラッグし、タップで時刻を入力します。記録済みでも予定を動かせます。手動の移動では重複を許容し、重なる時間だけ色を変えます。Googleの枠は参照用、計測中の枠は終了後に移動できます。前日からの自動持ち越しはせず、登録候補から選び直します。

Chrome / Garnetは設定→表示→スキンで選べます。Glass・Chrome・Garnetの「ガラスの反射」でスクロール連動の光沢を切り替えられます。初期表示はGraphite、ロゴは同心円です。review/Focus-skins-20261029.htmlで比較できます。

Notionの見積もり残時間は配置・実績集計に使いません。既存記録・同期キーを保持し、Notionの53件を追加します。同じ移行ファイルは重複登録しません。

同期先はWindowsのPCです。PCの停止・スリープ中は各端末内で記録し、再接続後に同期します。Tailscaleは個人向け無料プランを使用します。iPhone/iPadで初めて開く時と同期する時はTailscaleの接続が必要です。

このZIPには個人のNotionデータが入っています。QR・同期キーとともに共有しないでください。
更新・接続ツールの動作はローカルのサーバーと模擬Tailscaleで検証済みです。WindowsのVBS・実機iPhone/iPad・実Tailscale接続は未検証。あなたのPCへこのチャットから直接適用したものではありません。
'''
if args.premium:guide='Focus プレミアム・20スキン版\n\nWindowsのFocus-Setup-20261029-x64.exeは別配布です。このZIPは既存版への更新とソース・バックアップ用です。\nスキンは設定→表示→一覧。アプリ導入の説明はFOCUS-INSTALL.mdを開きます。\n\n'+guide
if args.performance:guide=(ROOT/'FOCUS-PERFORMANCE.md').read_text()+'\n\n'+guide
if args.flex:guide=(ROOT/'FOCUS-FLEX.md').read_text()+'\n\n'+guide[guide.index('Focus 更新・PC'): ]
if args.direct:guide=(ROOT/'FOCUS-DIRECT.md').read_text()+'\n\n'+guide[guide.index('Focus 更新・PC'): ]
if args.controls:guide=(ROOT/'FOCUS-CONTROLS.md').read_text()+'\n\n'+guide[guide.index('Focus 更新・PC'): ]
if args.overtime:guide=(ROOT/'FOCUS-OVERTIME.md').read_text()+'\n\n'+guide[guide.index('Focus 更新・PC'): ]
(root/'最初に読む.txt').write_text(guide,encoding='utf-8-sig');(root/'使い方.txt').write_text(guide,encoding='utf-8-sig')
private={'sync-key.txt','server-config.json','google-config.json','google-token-key.txt','desktop-session.json','desktop-start.lock','desktop-server.log','local-network.json','phone-setup.html','connection-setup.html'}
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for path in sorted(root.rglob('*')):
  if path.is_file():assert path.name not in private and '.sqlite' not in path.name,path;z.write(path,path.relative_to(stage))
with zipfile.ZipFile(target) as z:assert z.testzip() is None
meta={'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'containsPersonalNotionData':True,'privateConnection':'Windows+iPhone+iPad','newOptionalSkins':['chrome','garnet'],'scrollGlass':bool(args.glass or args.premium),'calendarDrag':bool(args.glass or args.premium),'skinCount':20 if args.premium else 4,'defaultLogo':'original concentric circles'};(ART/(release_name+'-manifest.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2));print(json.dumps(meta,ensure_ascii=False))
