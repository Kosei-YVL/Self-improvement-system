# Self-improvement-system — 積みかさね

タスク管理・スケジュール・積み上げ記録をまとめた自己改善アプリです。スマホのホーム画面から起動でき、ChatGPTに依存しない独立版も生成できます。

アプリのソースと使い方は [sites/tsumikasane](sites/tsumikasane/README.md)、データモデルと設計の検討項目は [DESIGN.md](sites/tsumikasane/DESIGN.md) にあります。

```bash
cd sites/tsumikasane
npm ci
npm run build
npm run dev
```

`http://localhost:4173` をブラウザで開きます。

ChatGPTから独立して公開する場合は `npm run build:standalone` を実行します。サーバー・認証・データ移行は [独立版の手順](sites/tsumikasane/STANDALONE.md) を参照してください。
