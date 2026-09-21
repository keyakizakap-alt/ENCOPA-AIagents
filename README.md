# ENCOPA AI Agents

宴会の候補比較から、予約内容の共有、食物アレルギーの回答、参加者チャットまでを1つにまとめるNext.jsアプリです。

## 実装済み

- 47都道府県から場所を選び、予算、人数、個室などを使った実在店舗の検索・比較
- OrcaRouterによる標準分析と、条件が難しい場合だけ行う専門担当の追加確認
- 28品目と「その他」から選べる食物アレルギー回答
- 店舗の住所とアクセス情報を表示し、GoogleマップとAppleマップで確認
- 招待リンク式の会グループ
- 参加者全員が閲覧できる最新予約内容
- 幹事だけが行える予約内容の編集とチャット共有
- 参加者同士のグループチャット
- アレルギー詳細を本人と幹事だけに返す権限制御
- 予約内容の版管理、二重投稿防止、招待リンクの失効と再発行
- Vercel向けTurso接続と、ローカル開発用SQLite

店舗情報はホットペッパーグルメWebサービスから取得します。空席照会と予約操作は行わないため、店舗ページまたは電話で確認し、予約成立後に幹事が予約状況を登録してください。

## ローカル起動

Node.js 24とpnpm 11.19.0を使用します。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

ローカルでは`TURSO_DATABASE_URL`が空の場合、`data/encopa.db`を自動作成します。`.env.local`へ`ENCOPA_CREATE_KEY`、`ENCOPA_DATA_KEY`、[ホットペッパーグルメWebサービス](https://webservice.recruit.co.jp/doc/hotpepper/reference.html)の`HOTPEPPER_API_KEY`、[OrcaRouter](https://docs.orcarouter.ai/introduction)の`ORCAROUTER_API_KEY`を設定してください。暗号化キーは`openssl rand -hex 32`で生成できます。

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
| `ENCOPA_DATA_KEY` | 本番必須 | 予約内容とアレルギー情報をAES-256-GCMで暗号化する32バイト鍵 |
| `APP_ORIGIN` | 本番必須 | `https://example.com`形式の公開Origin |
| `HOTPEPPER_API_KEY` | 本番必須 | 実店舗検索。ブラウザへ公開しないサーバー専用キー |
| `ORCAROUTER_API_KEY` | 本番必須 | 候補分析。ブラウザへ公開しない`sk-orca-*`キー |
| `ORCAROUTER_BASE_URL` | 任意 | 既定値はHosted版の`https://api.orcarouter.ai/v1` |
| `ORCAROUTER_ALLOWED_HOSTS` | 任意 | 信頼するセルフホスト接続先を追加する場合のみ指定 |
| `ORCAROUTER_MODEL` | 任意 | 既定値はOrcaRouterがモデルを選ぶ`auto` |
| `ENCOPA_AGENT_DAILY_LIMIT` | 任意 | 1日あたりの分析ワークフロー上限。既定100 |
| `ENCOPA_AGENT_DETAILED_DAILY_LIMIT` | 任意 | 1日あたりの詳細分析上限。既定30。上限後も標準分析は継続 |

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

- OrcaRouter互換モックを使い、通常条件では1回、要確認条件では最大4回になる適応型分析
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
- 予約内容とアレルギー情報はAES-256-GCMで暗号化して保存します。既存の平文レコードは読み取り互換を維持し、更新時から暗号化されます。
- CookieはHttpOnly、SameSite Strict、本番ではSecureです。
- POSTは同一Origin、JSON、16KiB以下に制限します。
- グループは90日、参加セッションは30日、招待リンクは7日で期限切れになります。
- チャットは最新100件を表示します。
- 店舗検索は送信元ごとに1時間30回へ制限し、外部APIは8秒でタイムアウトします。
- 店舗検索結果はDBへ保存せず、この端末の一時保存も23時間以内に失効します。
- 候補分析へ送るのは検索条件と公開店舗情報だけです。氏名、連絡先、アレルギー品目は送信しません。
- OrcaRouterの接続先は`api.orcarouter.ai`と明示的に許可したホストだけに制限し、APIキーの誤送信を防ぎます。
- 候補分析は送信元ごとに1時間10回、全体では設定した日次上限に制限します。通常条件はOrcaRouterを1回、食事配慮・大人数・候補僅差・店舗情報不足などは最大4回使用し、詳細分析には別の日次上限を設定できます。
- グループ削除は復元できません。期限切れデータは`pnpm db:cleanup`で削除できます。
- 本格運用では、管理者が定期クリーンアップ、バックアップ、監視、障害対応を設定してください。

## 主な構成

```text
app/page.tsx                    候補比較とグループ作成
app/api/venues/route.ts         実店舗検索、入力検証、候補スコアリング
app/api/agent/route.ts          OrcaRouterを使った標準分析と条件付きの専門分析
components/encopa/agent-insight.tsx  分析状況、確認事項、次の行動
app/groups/[id]/page.tsx        予約内容・参加者・チャット画面
app/api/groups/route.ts         グループ作成
app/api/groups/[id]/route.ts    参加・更新・投稿・権限制御
lib/server/db.ts                SQLite / Turso接続とスキーマ
lib/server/security.ts          Cookie、Origin、入力長、レート制限
tests/groups.test.mjs           共有機能の統合試験
docs/SECURITY_REVIEW.md         脅威、対策、検証結果、残存リスク
```

## 既知の制約

- メールアドレス認証やSSOではなく、招待リンクとブラウザCookieによる軽量な参加方式です。
- Cookieを削除した参加者は、再び有効な招待リンクから参加する必要があります。
- チャット更新はリアルタイムSocketではなく15秒間隔のポーリングです。
- アレルギー選択は店舗対応を保証しません。必ず店舗へ確認してください。
- 実空席、予約実行、プッシュ通知は未接続です。
- 店舗情報や料金は変更される場合があります。最新情報とアレルギー対応は店舗へ直接確認してください。
- 通常の候補分析はモデル呼び出し1回です。食事配慮、大人数、候補の僅差、店舗情報不足などでは専門担当2回と再統合を追加し、最大4回になります。
