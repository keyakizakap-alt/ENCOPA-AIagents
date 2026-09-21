'use client';

/** Last-resort boundary: catches failures in the root layout, so it renders its own document. */
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}) {
  return <html lang="ja"><body style={{margin:0,minHeight:'100vh',display:'grid',placeItems:'center',background:'#f7f5ef',color:'#1e2928',fontFamily:'"Hiragino Sans","Yu Gothic UI",system-ui,sans-serif'}}>
    <div style={{maxWidth:'28rem',padding:'2rem'}}>
      <h1 style={{fontSize:'1.25rem',margin:0}}>アプリを読み込めませんでした</h1>
      <p style={{marginTop:'.75rem',fontSize:'.875rem',lineHeight:1.7,color:'#5f6a67'}}>時間をおいて再読み込みしてください。改善しない場合は管理者へ連絡してください。</p>
      <button onClick={reset} style={{marginTop:'1.5rem',minHeight:44,padding:'10px 16px',borderRadius:12,border:0,background:'#1f4b46',color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer'}}>再読み込み</button>
      {error.digest&&<p style={{marginTop:'1rem',fontFamily:'monospace',fontSize:11,color:'#5f6a67'}}>エラーID: {error.digest}</p>}
    </div>
  </body></html>;
}
