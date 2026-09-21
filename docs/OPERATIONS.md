# 運用手順

## リリース

1. `pnpm install --frozen-lockfile`
2. `pnpm lint && pnpm typecheck && pnpm build && pnpm test`
3. Vercel Previewでホーム、グループ作成、参加者参加、チャット、予約共有を確認
4. Productionへ昇格

## ロールバック

直前の正常なVercel Deploymentへ戻すか、GitHubの直前コミットをrevertして再デプロイします。DBスキーマは追加のみで、今回の版では破壊的なマイグレーションを行いません。

ロールバック判断：グループ作成不可、参加者が別グループを閲覧できる、予約共有が誤った内容になる、重大な情報漏えいが疑われる場合。

## 障害調査

サーバーは1行のJSONで構造化ログを出力します（利用者データは含みません）。

| event | 意味 |
|---|---|
| `agent_call_ok` | 外部モデル呼び出し成功。`dailyUsed` / `dailyLimit` で日次消費を確認できます |
| `agent_call_failed` | 再試行後も失敗。`reason`（`orca_http_429` / `timeout` / `transport_error` など）と`consecutiveFailures`を確認 |
| `agent_fallback` | ローカル評価へ切り替え。`reason`が`circuit_open`ならブレーカ作動中、`daily_limit`なら上限到達 |
| `agent_cache_hit` | キャッシュ応答。外部呼び出しなし。`tier`が`memory`ならプロセス内、`shared`なら`encopa_ai_cache`由来 |
| `agent_cache_read_failed` / `agent_cache_write_failed` | キャッシュ処理の失敗。リクエストは継続します（外部モデル呼び出しへ縮退） |
| `agent_request_rejected` | ゲートウェイが4xxで拒否。`providerCode`（`code/type/param`）が原因を示します。最小構成で再試行します |
| `agent_limit_unavailable` | 上限の計上自体に失敗（多くはDB障害）。安全側でローカル評価へ倒しています |
| `request_failed` | 共有機能の想定外エラー。例外クラス名のみ記録します |

利用者から申告されたエラーIDは、レスポンスの`traceId`および画面の「エラーID」と一致します。ログを`traceId`で検索してください。

`agent_call_failed`が連続3回に達すると60秒間、外部モデルの呼び出し自体を停止します（プロセス内メモリで保持するため、インスタンスごとに独立して動作します）。

`agent_limit_unavailable`が出ている場合はデータベース障害です。上限に達したわけではないので、`ENCOPA_AI_DAILY_LIMIT`を上げても解決しません。

**APIキー投入直後に確認すること**：最初の検索で`agent_call_ok`が出れば正常です。`agent_request_rejected`が出た場合は`providerCode`の`param`が拒否されたパラメータ名を示します（最小構成での再試行も失敗した場合は、`app/api/agent/route.ts`の`buildRequest()`を調整してください）。`agent_call_failed`で`reason`が`orca_http_401`なら鍵、`orca_http_404`ならモデル名（`MODEL`定数）を確認してください。

## キャッシュ運用

`encopa_ai_cache`は候補評価の説明文のみを保持し、利用者データも検索条件の平文も含みません（キーはSHA-256ハッシュ）。TTLは10分です。

- プロンプト・モデル・サンプリング設定を変更したときは、`app/api/agent/route.ts`の`PROMPT_VERSION`を更新してください。旧プロンプト由来の説明が再利用されなくなります。
- 不正な説明文が配信されている場合は、`DELETE FROM encopa_ai_cache;`で即時に無効化できます（次回リクエストから再生成されます）。
- 期限切れ行は`pnpm db:cleanup`で削除します。

`ENCOPA_AI_PROMPT_CACHE=1`にした場合は、`agent_call_ok`の`cachedTokens`が0より大きくなるかを確認してください。0のままなら、経由先モデルのキャッシュ最小長に届いていないため、有効化の意味はありません。

## 定期運用

- 毎日：Vercel Functionの5xxとDB接続エラーを確認
- 毎週：`pnpm db:cleanup`を実行し期限切れデータ（グループ・レート制限・キャッシュ）を削除
- 毎月：依存関係の監査、Turso利用量、Orca Router利用量を確認
- 毎月：`agent_call_ok`の`dailyUsed`を確認し、`ENCOPA_AI_DAILY_LIMIT`が実需に合っているか見直す
- 秘密値漏えい時：Tursoトークン、作成コード、Orcaキーをローテーション

## 本番スモークテスト

- ホームがPCとスマートフォンで崩れない
- グループ作成後に幹事画面へ遷移する
- シークレットウィンドウで招待リンクから参加できる
- 参加者が最新の予約内容と地図リンクを閲覧できる
- 参加者は予約内容を編集できない
- アレルギー詳細は本人と幹事だけが閲覧できる
- 幹事が予約内容をチャットへ送れる
- GoogleマップとAppleマップが入力住所を開く
- 招待再発行後、旧リンクが拒否される
- グループ削除後、URLが404になる
- 存在しないURLで案内付きの404画面が表示される
- ブラウザの開発者ツールでCSP違反が記録されていない（scriptがブロックされていれば画面が操作不能になります）
- レスポンスヘッダのnonceと、HTML内の`<script nonce="...">`が一致している
- キーボードのTab移動でフォーカスリングが全要素にはっきり表示される
