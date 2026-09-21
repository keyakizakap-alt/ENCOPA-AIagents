# ENCOPA AI Agents

宴会の候補比較から、予約内容の共有、食物アレルギーの回答、参加者チャットまでを1つにまとめるNext.jsアプリです。

## 実装済み

- 条件に応じたデモ会場のランキングとOrca Router連携
- 28品目と「その他」から選べる食物アレルギー回答
- 店舗住所からGoogleマップとAppleマップを開くリンク
- 招待リンク式の会グループ
- 参加者全員が閲覧できる最新予約内容
- 幹事だけが行える予約内容の編集とチャット共有
- 参加者同士のグループチャット
- アレルギー詳細を本人と幹事だけに返す権限制御
- 予約内容の版管理、二重投稿防止、招待リンクの失効と再発行
- Vercel向けTurso接続と、ローカル開発用SQLite

> 候補カードは比較ロジックを確認するためのデモ店舗です。実店舗検索・空席照会・店舗予約は行いません。店舗で予約が成立した後、幹事が正しい予約状況を登録してください。

## ローカル起動

Node.js 24とpnpm 11.19.0を使用します。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

ローカルでは`TURSO_DATABASE_URL`が空の場合、`data/encopa.db`を自動作成します。グループ作成コードを使う場合は`.env.local`へ`ENCOPA_CREATE_KEY`を設定してください。

## Vercelへデプロイ

1. このリポジトリをVercelへImportする
2. Tursoでデータベースを作成する
3. VercelのEnvironment Variablesへ以下を設定する
4. Deployする

| 変数 | 必須 | 用途 |
|---|---:|---|
| `TURSO_DATABASE_URL` | 本番必須 | 共有データベースURL |
| `TURSO_AUTH_TOKEN` | 本番必須 | Tursoのサーバー専用トークン |
| `ENCOPA_CREATE_KEY` | 本番必須 | 幹事がグループを作るためのコード |
| `APP_ORIGIN` | 本番必須 | `https://example.com`形式の公開Origin |
| `ORCAROUTER_API_KEY` | 任意 | 評価方針の説明生成。未設定時はローカル評価 |
| `ENCOPA_AI_DAILY_LIMIT` | 任意 | Orca Routerのサイト全体日次上限。既定100 |

秘密値に`NEXT_PUBLIC_`を付けないでください。Vercelのローカルファイルシステムは永続化されないため、本番で`file:`データベースは使用できません。

## 検証

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm audit --prod
```

`pnpm test`は一時SQLiteデータベースと本番ビルドを起動し、次を統合試験します。

- 未参加者による予約内容の閲覧拒否
- 参加者2人と幹事のデータ分離
- アレルギー同意と閲覧権限
- 参加者による予約編集の拒否
- チャット保存と再送時の重複防止
- 予約スナップショットと版競合
- CSRF、危険なURL、無効日付の拒否
- 別グループからのアクセス拒否
- 招待再発行と退出処理

## データとセキュリティ

- 認証情報は32バイトのランダム値をCookieへ保存し、DBにはSHA-256ハッシュだけを保持します。
- CookieはHttpOnly、SameSite Strict、本番ではSecureです。
- POSTは同一Origin、JSON、16KiB以下に制限します。
- グループは90日、参加セッションは30日、招待リンクは7日で期限切れになります。
- チャットは最新100件を表示します。
- グループ削除は復元できません。期限切れデータは`pnpm db:cleanup`で削除できます。
- 本格運用では、管理者が定期クリーンアップ、バックアップ、監視、障害対応を設定してください。

## 主な構成

```text
app/page.tsx                    候補比較とグループ作成
app/groups/[id]/page.tsx        予約内容・参加者・チャット画面
app/api/groups/route.ts         グループ作成
app/api/groups/[id]/route.ts    参加・更新・投稿・権限制御
lib/server/db.ts                SQLite / Turso接続とスキーマ
lib/server/security.ts          Cookie、Origin、入力長、レート制限
tests/groups.test.mjs           共有機能の統合試験
```

## 既知の制約

- メールアドレス認証やSSOではなく、招待リンクとブラウザCookieによる軽量な参加方式です。
- Cookieを削除した参加者は、再び有効な招待リンクから参加する必要があります。
- チャット更新はリアルタイムSocketではなく15秒間隔のポーリングです。
- アレルギー選択は店舗対応を保証しません。必ず店舗へ確認してください。
- 実店舗検索、実空席、予約実行、プッシュ通知は未接続です。
