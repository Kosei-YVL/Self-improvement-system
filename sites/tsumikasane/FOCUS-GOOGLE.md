# Focus Google Calendar連携

Googleの予定をFocusの日程へ読み込み、自動配置でもその予定の時間を避けます。Focusのタスク予定は選択したGoogleカレンダーへ反映できます。予定の表示・書き込み先・自動反映の設定は端末ごとです。実際のGoogleアカウントの接続には、以下の初期設定が必要です。ChatGPTのGoogle連携の認証は引き継ぎません。

## 初期設定（自分のGoogle Cloudプロジェクト）

1. Google Cloudでプロジェクトを作成し、Google Calendar APIを有効化します。
2. Google Auth Platform / OAuth同意画面を設定。個人テストの場合は自分のGoogleアカウントをテストユーザーへ追加します。
3. OAuthクライアントを「ウェブアプリケーション」で作成します。WindowsテストのリダイレクトURIは http://127.0.0.1:4545/oauth/google/callback 。開発版は4546、実際の端末間利用は共有HTTPS URLの /oauth/google/callback を登録します。
4. SETUP-GOOGLE-WINDOWS.cmdを開き、発行したクライアントIDとシークレットをこのPCで入力します。focus-data/personal/google-config.jsonへ保存されます。Focusを再起動します。手動設定の場合は同梱のgoogle-config.example.jsonを同じ保存先へコピーして値を置き換えます。秘密情報をチャットやGit、配布ZIPに入れません。
5. Focus設定で同期キーを接続してから、「Googleに接続」を押して認可します。Googleの読み書き許可が必要です。アプリは自分が作成したFocus予定だけを変更します。
6. 表示するカレンダーと、タスク予定の書き込み先を選びます。通常は専用の「Focus」カレンダーをGoogle側で作成すると見分けやすくなります。自動反映をONにすると、タスク配置・変更がGoogleにも反映されます。

API利用は通常追加料金なしですが割当制限があります。Google Cloudの設定と最新の割当を確認してください。OAuth同意画面が外部/テスト状態だと、カレンダー等のスコープではリフレッシュトークンが約7日で失効する場合があります。継続利用する場合はOAuth公開状態（Webアプリの一般公開とは別）・対象ユーザーに応じた設定/審査を確認してください。再認可が必要になった場合はFocus設定に表示します。

## クラウド版

D1にfocus-server/schema.sqlに加えfocus-server/google-schema.sqlを適用します。WorkerにGOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_TOKEN_KEYを設定します。GOOGLE_TOKEN_KEYは32バイトのランダム値のbase64url（43文字）で、server側のsecretとして保持します。GOOGLE_REDIRECT_URIは共有HTTPS URLの/oauth/google/callbackです。OAuthクライアントのリダイレクトURIも完全一致させます。開発と普段使いは別のDB/キー/認可を使います。

## 動作

- 取得範囲は原則30日前〜90日先。選んだ複数カレンダー、繰り返し予定を読み込みます。終日は日付の排他的な終了日を守り、JSTで日をまたぐ予定は表示上分割します。「予定あり」の時間を自動配置の制約にし、「空き」扱いは表示だけ行います。
- 読み込んだGoogle予定はFocusの記録には混ぜません。オフライン時は保存済みの予定を表示し、再接続・画面を開いている間の約1分ごとに更新します。アプリを閉じた状態での常時処理は保証しません。
- Googleへ反映するのはFocusのタスク予定の時間です。実績ログは自動で予定に変換しません。準備時間は説明へ含め、開始・終了には作業時間を使います。
- 同じ予定を何度も反映しても増殖しない安定IDを使います。Google側で直接変更された予定は上書きせず競合を表示します。設定の「日時・名前を採用」で、未着手・未記録・同じ日内の日時と名前をFocusへ取り込めます。Googleで追加した説明文の取り込みは行いません。開始済みの予定や日またぎ変更は直接調整してください。明示的に外したFocus予定だけ削除候補にし、一覧にないだけでは削除しません。Googleのその他の予定は読み取り専用です。反映先を変更しても以前のカレンダーの予定は自動削除しません。接続解除でも予定自体は残します。
- Googleトークンはサーバー側で暗号化して保存し、ブラウザ・通常のバックアップ・移行ZIPへ渡しません。Focus内の端末間同期の暗号化は維持しますが、Google連携を有効にした予定のタイトル・時刻・準備設定はFocusサーバー経由でGoogleへ送ります。記録・個人メモ・実測データは自動反映しません。

## 検証と未接続の区別

模擬Google APIでOAuth、再認可、読み込み、反映、重複防止、競合、削除を検証します。実アカウントへの接続・予定変更は、ユーザー自身のOAuth設定と認可が完了してから動作します。今回の開発中に実際のGoogle予定を書き換えません。

公式情報: https://developers.google.com/workspace/calendar/api/guides/quota 、 https://developers.google.com/identity/protocols/oauth2/web-server 。
