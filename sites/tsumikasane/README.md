# 積みかさね

タスク・スケジュール・実行記録・達成履歴をまとめる自己改善アプリです。

個人用の端末内テスト版は `npm run build:device` で生成できます。`device-test/START-WINDOWS.cmd` を開き、`http://127.0.0.1:4545` にアクセスします。記録はブラウザのIndexedDBへ保存し、公開・クラウド送信は行いません。詳しくは [DEVICE-TEST.md](DEVICE-TEST.md) を参照してください。

## 開発

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run build
npm run dev
```

`http://127.0.0.1:4173` を開きます。Node.js 24が必要です。開発サーバーはループバック限定でローカル認証とSQLiteを使用します。本番ではSitesの認証とD1を使います。

- `web/`：HTML・CSS・JavaScriptの画面ソース。
- `worker/index.js`：認証済みユーザー専用のデータAPI。
- `db/schema.ts`・`drizzle/`：D1スキーマと生成済みマイグレーション。
- `scripts/build.mjs`：画面をWorker ESMに組み込み、Sitesの配置形式を生成。
- `dist/`：ビルド出力。ここは直接編集しません。

初回はサンプル表示です。「自分のデータで始める」で、アカウント専用のクラウド保存を使います。旧バージョンの端末内データがあり、クラウドが空の場合はその内容を引き継ぎます。別端末と保存が競合した場合は、控えをダウンロードしてから使う側を選べます。

## 主な機能

- ライト・ダーク・端末設定に連動する表示モード。
- iPhone / Androidのホーム画面への追加、オフライン起動、画面の切り欠き・ホームインジケーターに対応。
- タスクの検索、希望時間帯、所要時間、日付・時・分のホイール入力。
- 時間帯の空きに仮配置し、ドラッグ・スマホの長押しで予定を調整。
- 実際の取り組み時間、振り返り、週集計、継続日数。
- 日時つき達成・変更履歴。アーカイブと復元。
- 全データJSON、全タスク・作業ログ・達成履歴CSV、予定ICS、元データCSV。
- NotionのZIPを直接取り込み。日本語日付、日次タスク、締切、作業ログ、予定、振り返りを処理し、未対応項目も元データとして保管。

データ形式と日時の精度は [SCHEMA.md](SCHEMA.md) に記載しています。完了しても見積もり時間を実績へ加算しません。Google Calendarとの自動参照・自動同期、繰り返し予定の展開は未対応です。Google連携に必要なSitesの利用資格確認ツールが、この環境に提供されていないためです。

## ChatGPTから独立して使う

`npm run build:standalone` で、独立したNode.jsアプリ一式を `standalone/` に生成できます。このビルドはSitesの設定・認証・インストール済みパッケージを必要としません。専用パスワードとSQLiteを使い、ChatGPTへの接続は不要です。Windows用の初期設定・起動ファイルと、Renderでの外部公開・永続保存の設定も含みます。公開先アカウントの接続と料金の確認は、実際の公開前に必要です。詳しくは [STANDALONE.md](STANDALONE.md) を参照してください。

ホーム画面への追加方法は、アプリの「データと設定」から確認できます。オフライン用キャッシュには画面用ファイルだけを保存し、API・認証・ユーザーごとの応答は含めません。新しい版は設定画面で更新できます。

## 検証

```bash
node tests/core.test.mjs
node tests/features.test.mjs
node tests/notion.test.mjs
node tests/storage-history.test.mjs
npm run build:standalone
node tests/standalone.test.mjs
node tests/independent-setup.test.mjs
node tests/offline-cloud.test.mjs
```

ブラウザ操作は、開発サーバーを起動してPlaywright・Chromiumのある環境で `python tests/assets-browser.py` を実行します。添付ZIPを検証する場合だけ、`TSUMIKASANE_NOTION_ZIP` にローカルのファイルパスを指定します。実データはソースや配布物へ含めません。

`tests/mobile-pwa-browser.py` は4173番の開発サーバーと、4174番のテスト専用独立サーバー（パスワード `browser-test-password-123`、実データを入れない）の両方を起動して実行します。スマホ幅・横向き、インストール案内、オフラインでの再起動、独立ログイン・保存・ログアウトを確認します。

`python tests/independent-browser.py` は4174番のテスト専用独立サーバーだけで実行できます。専用パスワードで2つの端末からログインし、保存データの共有・オフライン再起動後の編集と再接続・ChatGPT/OpenAIへの通信がないことを確認します。
