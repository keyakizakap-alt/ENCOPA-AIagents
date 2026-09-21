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
| `agent_cache_hit` | キャッシュ応答。外部呼び出しなし |
| `request_failed` | 共有機能の想定外エラー。例外クラス名のみ記録します |

利用者から申告されたエラーIDは、レスポンスの`traceId`および画面の「エラーID」と一致します。ログを`traceId`で検索してください。

`agent_call_failed`が連続3回に達すると60秒間、外部モデルの呼び出し自体を停止します（プロセス内メモリで保持するため、インスタンスごとに独立して動作します）。

## 定期運用

- 毎日：Vercel Functionの5xxとDB接続エラーを確認
- 毎週：`pnpm db:cleanup`を実行し期限切れデータを削除
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
- ブラウザの開発者ツールでCSP違反が記録されていない
- キーボードのTab移動でフォーカスリングが全要素にはっきり表示される
