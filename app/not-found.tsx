import Link from 'next/link';

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-surface px-4 text-ink">
    <div className="w-full max-w-md rounded-[24px] border border-ink/10 bg-white p-6 text-center sm:p-8">
      <h1 className="text-xl font-semibold">ページが見つかりません</h1>
      <p className="mt-3 text-sm leading-6 text-muted-ink">URLが変更されたか、グループが削除・期限切れになった可能性があります。</p>
      <Link className="enc-primary mt-6 inline-flex" href="/">トップへ戻る</Link>
    </div>
  </main>;
}
