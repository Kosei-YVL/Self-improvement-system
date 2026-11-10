from pathlib import Path
import base64,html,json,shutil,zipfile,hashlib
root=Path(__file__).resolve().parent.parent;art=Path('/workspace/artifacts');art.mkdir(exist_ok=True);qa=root/'qa/focus-three-screen';stage=art/'Focus-three-screen-20261026';stage.mkdir(exist_ok=True)
for directory in ['personal','development','source','validation']:
 target=stage/directory
 if target.exists():shutil.rmtree(target)
shutil.copytree(root/'focus-sync',stage/'personal');shutil.copytree(root/'focus-development',stage/'development');shutil.copytree(qa,stage/'validation')
source=stage/'source';source.mkdir()
for folder in ['web','scripts','focus-server','tests','drizzle','deploy']:
 shutil.copytree(root/folder,source/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
for name in ['package.json','package-lock.json','.gitignore','FOCUS.md','FOCUS-SYNC.md','FOCUS-THREE-SCREEN.md','FOCUS-DEVELOPMENT.md']:
 if (root/name).exists():shutil.copy2(root/name,source/name)
for name in ['FOCUS-SYNC.md','FOCUS-THREE-SCREEN.md','FOCUS-DEVELOPMENT.md']:shutil.copy2(root/name,stage/name)
shutil.copy2(root/'FOCUS-THREE-SCREEN.md',stage/'README.md')
(stage/'START-WINDOWS.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0personal"\r\ncall START-WINDOWS.cmd\r\n');(stage/'START-DEVELOPMENT.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0development"\r\ncall START-WINDOWS.cmd\r\n')
def pic(name,alt):return '<img loading="lazy" alt="'+html.escape(alt)+'" src="data:image/png;base64,'+base64.b64encode((qa/name).read_bytes()).decode()+'">'
page=['''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Focus — 3画面テスト版</title><style>body{margin:0;background:#10171c;color:#e7eeec;font:15px/1.8 system-ui,sans-serif}main{max-width:1150px;padding:24px;margin:auto}h1{font-size:27px}h2{font-size:21px;margin-top:34px}a{color:#a9e3c9}nav{display:flex;flex-wrap:wrap;gap:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;padding:12px;background:#182228;border:1px solid #2b3b40;border-radius:14px}figcaption{font-size:13px;color:#a9c8bd;margin-bottom:12px}img{display:block;width:100%;max-height:820px;object-fit:contain;object-position:top}.note{padding:16px;border:1px solid #2b3b40;border-radius:12px;color:#bad1c8}details{padding:14px;border:1px solid #2b3b40;border-radius:12px;margin:14px 0}summary{cursor:pointer}pre{font:14px/1.8 system-ui;white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:22px 0}td,th{padding:12px;border-bottom:1px solid #2b3b40;text-align:left;vertical-align:top}@media(max-width:700px){main{padding:16px}.grid{grid-template-columns:1fr}td,th{padding:8px;font-size:13px}}</style><main><h1>Focus — 3画面テスト版</h1><p>2026-10-26 · 独立アプリ · 未公開</p><nav><a href="#dashboard">ダッシュボード</a><a href="#tasks">タスク</a><a href="#review">振り返り</a><a href="#timer">端末をまたぐ計測</a><a href="#validation">検証</a></nav><p class="note">画像は架空の検証データを使用した入力後の画面です。PC・スマホは独立したブラウザ保存領域で検証。クラウドへの接続、iPhone/iPad/Safariの実機検証は未実施です。</p><table><tr><th>日常の操作</th><th>データ・開発</th></tr><tr><td>登録したタスクとやることを選択 → 時間帯と準備時間から配置 → 開始 → 終了して1件記録</td><td>暗号化同期、全体JSON・CSV・ICS、復元ポイント。普段使いと開発の保存先を分離。</td></tr></table>''']
for key,label in [('dashboard','ダッシュボード'),('tasks','タスク'),('review','振り返り')]:
 page+=['<h2 id="'+key+'">'+label+'</h2><div class="grid"><figure><figcaption>スマホ・ダーク</figcaption>',pic(key+'-mobile.png',label+'スマホ画面'),'</figure><figure><figcaption>PC・ライトの検証</figcaption>',pic(key+'-desktop.png',label+'PC画面'),'</figure></div>']
page+=['<h2 id="timer">端末をまたぐ計測</h2><p>開始でページやログは増えません。計測状態を同期し、一時停止・再開・終了を別端末から行えます。再読み込み・スリープ相当の時間経過から経過時間を復元する検証に合格しました。閉じた状態の音・通知は未実装です。</p><div class="grid"><figure><figcaption>別の保存領域へ引き継いだ計測</figcaption>',pic('timer-mobile.png','計測の引継ぎ'),'</figure><figure><figcaption>実装した経路</figcaption><p>PCで開始 → スマホ側で再読み込み → スマホで一時停止 → PCで再開 → スマホで終了</p><p>実測91秒・記録1件を確認。同時に違う計測を始めた場合は競合を表示します。</p><p>実際のPC・iPhone・iPad間の利用には、共通のHTTPS URLと同期先の設定が残っています。</p><p>Googleカレンダー接続とローカルAIモデルは未実装です。自動配置はアプリ内の制約計算で動作します。</p></figure></div><h2 id="validation">検証結果</h2><pre>',html.escape((qa/'REPORT.md').read_text()),'</pre><details><summary>操作・導入・制限</summary><pre>',html.escape((root/'FOCUS-THREE-SCREEN.md').read_text()),'</pre></details></main></html>']
preview=art/'Focus-three-screen-preview-20261026.html';preview.write_text(''.join(page));shutil.copy2(preview,stage/'画面と検証.html')
target=art/'Focus-three-screen-20261026.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(stage.rglob('*')):
  if f.is_file():
   assert not f.name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm')) and f.name not in ['sync-key.txt','server-config.json','.env'],f
   z.write(f,'Focus/'+str(f.relative_to(stage)))
with zipfile.ZipFile(target) as z:assert z.testzip() is None
metadata={'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'preview':preview.name};(art/'Focus-three-screen-20261026-manifest.json').write_text(json.dumps(metadata,indent=2));print(json.dumps(metadata))
