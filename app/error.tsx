'use client';
import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level Error Boundary. A render exception previously replaced the whole page with
 * Next's default screen and left no way back; this keeps the recovery paths visible and
 * surfaces the digest so a report can be matched against the server log.
 */
export default function RouteError({error,reset}:{error:Error&{digest?:string};reset:()=>void}) {
  useEffect(()=>{console.error('[encopa] render failed',error.digest??error.name)},[error]);
  return <main className="grid min-h-screen place-items-center bg-surface px-4 text-ink">
    <div className="w-full max-w-md rounded-[24px] border border-ink/10 bg-white p-6 sm:p-8">
      <h1 className="text-xl font-semibold">画面を表示できませんでした</h1>
      <p className="mt-3 text-sm leading-6 text-muted-ink">保存されたデータは失われていません。再試行しても直らない場合は、しばらく待ってからもう一度お試しください。</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="enc-primary" onClick={reset}>もう一度表示する</button>
        <Link className="enc-secondary" href="/">トップへ戻る</Link>
      </div>
      {error.digest&&<p className="mt-4 font-mono text-[11px] text-muted-ink">エラーID: {error.digest}</p>}
    </div>
  </main>;
}
