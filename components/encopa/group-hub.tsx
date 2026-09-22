'use client';

import Link from 'next/link';
import { useCallback,useEffect,useState } from 'react';
import { ArrowRight,CalendarDays,MessageCircle,RefreshCw,Store,Users } from 'lucide-react';
import { forgetGroup,knownGroups } from '@/lib/group-registry';
import { RSVP_LABELS,type GroupView } from '@/lib/group-types';

type AvailableGroup = GroupView & { lastOpenedAt:number };

export function GroupHub(){
 const [groups,setGroups]=useState<AvailableGroup[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  const saved=knownGroups();
  const checked=await Promise.all(saved.map(async item=>{
   try{
    const response=await fetch(`/api/groups/${item.id}`,{cache:'no-store'});
    if(response.status===401||response.status===404){forgetGroup(item.id,false);return null}
    if(!response.ok)throw new Error('unavailable');
    return {...await response.json() as GroupView,lastOpenedAt:item.lastOpenedAt};
   }catch{return {unavailable:true,id:item.id,lastOpenedAt:item.lastOpenedAt}}
  }));
  const available=checked.filter((item):item is AvailableGroup=>!!item&&!('unavailable' in item));
  setGroups(available);
  if(checked.some(item=>item&&'unavailable' in item))setError('一部のグループを確認できませんでした。時間をおいて更新してください。');
  setLoading(false);
 },[]);
 useEffect(()=>{const sync=()=>void refresh();const timer=window.setTimeout(sync,0);window.addEventListener('encopa-groups-changed',sync);window.addEventListener('focus',sync);return()=>{window.clearTimeout(timer);window.removeEventListener('encopa-groups-changed',sync);window.removeEventListener('focus',sync)}},[refresh]);

 return <section className="mb-7 overflow-hidden rounded-[26px] border border-[#182523]/8 bg-white shadow-[0_12px_36px_rgba(24,37,35,.06)]">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#182523]/8 p-5 sm:p-6"><div><p className="text-xs font-bold tracking-[.12em] text-[#b55c38]">MY GROUPS</p><h2 className="mt-1 text-xl font-bold">参加中のグループ</h2><p className="mt-1 text-sm leading-6 text-[#65716e]">作成した会と参加した会を、この端末から開けます。</p></div><button type="button" disabled={loading} onClick={()=>void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#182523]/12 bg-white px-4 text-sm font-bold text-[#173f3a] transition hover:bg-[#f3f7f4] disabled:opacity-60"><RefreshCw className={`size-4 ${loading?'animate-spin':''}`}/>更新</button></div>
  {error&&<p role="status" className="mx-5 mt-4 rounded-xl border border-[#f0c48a] bg-[#fbf0dc] p-3 text-sm text-[#7a5a25] sm:mx-6">{error}</p>}
  {loading?<div className="grid min-h-40 place-items-center p-6 text-sm text-[#65716e]"><span className="flex items-center gap-2"><RefreshCw className="size-4 animate-spin"/>グループを確認しています</span></div>:groups.length?<div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">{groups.map(group=>{
   const attending=group.members.filter(member=>member.rsvp==='yes').length;
   return <article key={group.id} className="flex min-w-0 flex-col rounded-[20px] border border-[#182523]/9 bg-[#faf9f5] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="inline-flex rounded-full bg-[#e5eee9] px-2.5 py-1 text-xs font-bold text-[#24564d]">{group.me.role==='owner'?'幹事':'参加者'}</span><h3 className="mt-3 truncate text-lg font-bold" title={group.title}>{group.title}</h3></div><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff0e9] text-[#d45b3f]"><MessageCircle className="size-5"/></span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><GroupFact icon={Store} label="会場" value={group.reservation.venueName}/><GroupFact icon={CalendarDays} label="日時" value={`${group.reservation.date.slice(5).replace('-','/')} ${group.reservation.time}`}/><GroupFact icon={Users} label="参加" value={`${attending} / ${group.members.length}名`}/><GroupFact icon={MessageCircle} label="自分の回答" value={RSVP_LABELS[group.me.rsvp]}/></dl><Link href={`/groups/${group.id}`} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#173f3a] px-4 text-sm font-bold text-white transition hover:bg-[#0e332f]">グループを開く<ArrowRight className="size-4"/></Link></article>
  })}</div>:<div className="grid min-h-48 place-items-center px-6 py-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#fff0e9] text-[#d45b3f]"><Users className="size-5"/></span><h3 className="mt-4 font-bold">まだグループがありません</h3><p className="mt-2 text-sm leading-6 text-[#65716e]">会場を選んでグループを作るか、受け取った招待リンクから参加してください。</p></div></div>}
  <p className="border-t border-[#182523]/8 px-5 py-3 text-xs leading-5 text-[#77807e] sm:px-6">安全のため、参加情報はブラウザごとに管理されます。別の端末では招待リンクから参加してください。</p>
 </section>
}

function GroupFact({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:string}){return <div className="min-w-0"><dt className="flex items-center gap-1.5 text-xs text-[#77807e]"><Icon className="size-3.5"/>{label}</dt><dd className="mt-1 truncate font-semibold" title={value}>{value}</dd></div>}
