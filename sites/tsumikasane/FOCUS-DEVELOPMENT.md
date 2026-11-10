# Focusのデータを残して開発する

日常利用のデータとソースコードは分ける。build:focus:syncはfocus-sync/だけ、build:focus:devはfocus-development/だけを再作成する。focus-data/のSQLite、サーバー認証情報、ブラウザのIndexedDBをビルドで削除しない。

開発版は別ポート4546・別IndexedDB名focus-development-v1・別サーバーDB・別同期環境developmentを使う。クラウドでも別Worker・別D1・別キーにする。テストは一時フォルダと架空データで動かす。

データ形式の基準はweb/focus-portable.mjsのdecodeBackup、web/focus-model.mjsの検証、web/core.mjsのvalidateData。完全なバックアップはformat=focus-device、version=1、data.version=1または2。metadataは任意。config、timer、draftのほか、data内の追加属性・履歴・archive・sourceTablesを維持する。

未知のバックアップ版は拒否する。新しいデータ形式を追加する際は新しいcodecと変換を追加し、変換前のファイルまたは復元ポイントを残す。既存形式へ読み込めない新形式を書いたら旧コードへの安易な切戻しをしない。旧バックアップの読み込み→保存→書き出しで追加属性とIDが残る回帰検証を追加する。

共有形式はformat=focus-shared、version=1、data、routines、session、任意のplanning。テーマやブロック配置などの端末設定・キーは共有しない。自動配置条件は共有する。sessionは1つの進行中計測で、変更が競合したら項目全体を確認する。削除を単純な配列結合で復活させず、共通の基準データに対する3方向統合を使う。同じフィールドへの異なる変更は停止・確認する。

APIは同一オリジンの/api/focus-sync。revisionによる比較更新。暗号文は400,000文字ごとに分割し、headの比較更新とchunk挿入を1トランザクションに入れる。最新3世代を保持。認証用派生値と暗号鍵は分離し、API・ログ・エクスポートに復号キーを入れない。

変更後の確認:

- node tests/focus-sync.test.mjs
- python tests/focus-three-screen.py（先に同期版・開発版をビルド）
- 旧4パネルの履歴テストはtests/legacy-focus/に保管。現行UIはfocus-three-screen.pyで検証
- node tests/core.test.mjs、node tests/features.test.mjs
- SQLiteアダプターの変更時はnode tests/standalone.test.mjs
- Windows起動処理の変更時はnode tests/focus-windows-launcher.test.mjs（同期版・開発版を先にビルド）とWindowsでのINSTALL-FOCUS.vbs、起動・終了を確認

自動配置は、ルーチンの取り組める時間帯、分数、締切、優先度、固定予定、Google由来のbusy区間を受ける純粋関数から始める。外部同期やAIモデルと分け、配置理由と未配置の理由を返す。手動固定を変更せず、アプリ起動・タスク変更・予定同期時に配置案を更新する。Googleへの書き込みとユーザーの確定済み予定の変更は、別の設定として扱う。

Google連携の実装はweb/focus-google.mjsとfocus-server/google.mjs。Google予定のキャッシュはドメインデータから分離し、通常バックアップへ混ぜない。認証トークンはサーバー側で暗号化して保存し、配布物・ログ・ブラウザへ出さない。schema.sqlに加えgoogle-schema.sqlを適用する。Focus所有マーカーとETagを確認し、他の予定やGoogle側の編集を黙って書き換えない。node tests/focus-google.test.mjs、node tests/focus-google-server.test.mjs、python tests/focus-google-browser.pyを確認する。

32MiB以内の共有JSONは64KiBを超え圧縮効果がある場合にgzipしてから暗号化する（focus-cipher/2）。従来のfocus-cipher/1も読める。サイズと圧縮形式は認証付き暗号のAADで保護する。古いアプリはv2を読めないため、同期する端末のコードを同じ版へ更新する。変更のない同期照会はrevisionを送り、暗号文の再送や同一基準データの繰り返し保存を避ける。

PCの全属性JSON控えはfocus-data/personal/device-backupsに保存する。更新時はUPDATE-FOCUS.vbsで既存フォルダーを選び、データとコードを分けて控えを残す。ノートや移行元本文を含む個人用データは汎用ソース配布やスクリーンショットへ含めない。
