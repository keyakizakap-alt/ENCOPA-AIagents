"use client";

import { useEffect, useMemo, useState } from "react";
import { CreateGroup } from "@/components/encopa/create-group";
import { AllergyPicker } from "@/components/encopa/allergy-picker";
import { MapLinks } from "@/components/encopa/maps";
import { EMPTY_ALLERGY, type AllergyProfile } from "@/lib/group-types";
import {
  ArrowRight, CalendarDays, Check, ChevronRight, CircleCheck, Clock3, Download,
  MapPin, RefreshCw, Route, Search, Settings2, ShieldCheck, Sparkles,
  Users, UtensilsCrossed, WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Priority = "balance" | "conversation" | "cost" | "access";
type Autonomy = "suggest" | "prepare" | "execute";
type Query = { purpose:string; area:string; budget:number; people:number; priority:Priority; privateRoom:boolean; dietary:boolean };
type VenueBase = {
  id:string; name:string; genre:string; price:number; capacity:number; base:number;
  conversation:number; access:number; value:number; privateRoom:boolean; dietary:boolean;
  purpose:string[]; tags:string[]; minutes:number; risk:string; color:string;
};
type Venue = VenueBase & { score:number; reason:string; walk:string; availability:string; breakdown:{fit:number; budget:number; operation:number} };
type RouterState = { route:string; model:string|null; summary:string; traceId?:string; latencyMs?:number; tokenBudget?:number };
type Stage = "draft" | "ranked" | "collecting" | "awaiting_approval" | "scheduled";
type AuditEvent = { id:string; label:string; detail:string };

const venuePool: VenueBase[] = [
  { id:"nagi", name:"炉端と島ごはん 凪", genre:"長崎料理・炉端", price:5200, capacity:24, base:83, conversation:96, access:94, value:84, privateRoom:true, dietary:true, purpose:["忘年会","新年会","懇親会"], tags:["半個室","飲み放題","魚・肉を選べる"], minutes:4, risk:"キャンセル料は3日前から", color:"from-[#dc774b] to-[#bc5036]" },
  { id:"akari", name:"季節台所 灯り", genre:"創作和食", price:4800, capacity:20, base:81, conversation:91, access:88, value:95, privateRoom:true, dietary:true, purpose:["歓迎会","送別会","懇親会"], tags:["完全個室","ノンアル充実","食事相談可"], minutes:2, risk:"席は2時間制", color:"from-[#436d72] to-[#264f57]" },
  { id:"port", name:"PORT TABLE 17", genre:"洋食・ビストロ", price:5500, capacity:40, base:80, conversation:82, access:90, value:78, privateRoom:false, dietary:true, purpose:["打ち上げ","忘年会","歓迎会"], tags:["貸切相談","プロジェクター","景色"], minutes:3, risk:"予算上限と同額", color:"from-[#bd9550] to-[#8c6a2f]" },
  { id:"iori", name:"旬彩ダイニング 庵", genre:"和食・会席", price:6200, capacity:32, base:86, conversation:98, access:76, value:72, privateRoom:true, dietary:true, purpose:["新年会","送別会","忘年会"], tags:["完全個室","静かな席","会席"], minutes:8, risk:"5日前から人数変更料", color:"from-[#725269] to-[#493345]" },
  { id:"harbor", name:"HARBOR COMMONS", genre:"ダイニング", price:4300, capacity:60, base:76, conversation:73, access:82, value:98, privateRoom:false, dietary:false, purpose:["打ち上げ","懇親会","歓迎会"], tags:["大人数","貸切可","会費を抑える"], minutes:6, risk:"貸切は最低保証額あり", color:"from-[#557a8b] to-[#365361]" },
  { id:"tsubaki", name:"小料理 椿", genre:"割烹・小料理", price:5800, capacity:16, base:88, conversation:99, access:71, value:76, privateRoom:true, dietary:true, purpose:["送別会","新年会","懇親会"], tags:["少人数","静かな個室","料理重視"], minutes:10, risk:"最大16名まで", color:"from-[#8b6150] to-[#633e32]" },
];

const steps = [["条件","完了"],["候補比較","いまここ"],["みんなに確認","次"],["幹事が承認",""],["予約・予定確保",""]];
const priorityLabels: Record<Priority,string> = { balance:"バランス", conversation:"会話しやすさ", cost:"予算", access:"移動しやすさ" };

export default function Home() {
  const [allergy,setAllergy]=useState<AllergyProfile>(EMPTY_ALLERGY);
  const [addresses,setAddresses]=useState<Record<string,string>>({});
  const [searchError,setSearchError]=useState("");
  const [purpose,setPurpose]=useState("忘年会");
  const [area,setArea]=useState("長崎駅周辺");
  const [budget,setBudget]=useState("5500");
  const [people,setPeople]=useState("18");
  const [priority,setPriority]=useState<Priority>("balance");
  const [draftPriority,setDraftPriority]=useState<Priority>("balance");
  const [autonomy,setAutonomy]=useState<Autonomy>("prepare");
  const [draftAutonomy,setDraftAutonomy]=useState<Autonomy>("prepare");
  const [privateRoom,setPrivateRoom]=useState(true);
  const [draftPrivateRoom,setDraftPrivateRoom]=useState(true);
  const [dietary,setDietary]=useState(true);
  const [draftDietary,setDraftDietary]=useState(true);
  const [eventDate,setEventDate]=useState("2026-12-18");
  const [eventTime,setEventTime]=useState("19:00");
  const [draftEventDate,setDraftEventDate]=useState("2026-12-18");
  const [draftEventTime,setDraftEventTime]=useState("19:00");
  const [query,setQuery]=useState<Query>({purpose:"忘年会",area:"長崎駅周辺",budget:5500,people:18,priority:"balance",privateRoom:true,dietary:true});
  const [searched,setSearched]=useState(false);
  const [searching,setSearching]=useState(false);
  const [selected,setSelected]=useState(0);
  const [approvalOpen,setApprovalOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [completed,setCompleted]=useState(false);
  const [failover,setFailover]=useState(false);
  const [stage,setStage]=useState<Stage>("draft");
  const [audit,setAudit]=useState<AuditEvent[]>([{id:"init",label:"会を作成",detail:"外部操作はまだ行っていません"}]);
  const [restored,setRestored]=useState(false);
  const [router,setRouter]=useState<RouterState>({route:"待機中",model:null,summary:"条件が確定するとOrca Routerが最適な推論経路を選びます。",tokenBudget:0});

  const total=Number(budget||0)*Number(people||0);
  const candidates=useMemo(()=>rankVenues(query,failover),[query,failover]);
  const chosen=candidates[Math.min(selected,candidates.length-1)] ?? candidates[0];
  const stageIndex={draft:0,ranked:1,collecting:2,awaiting_approval:3,scheduled:4}[stage];
  const progress=[15,40,62,82,100][stageIndex];
  const addAudit=(label:string,detail:string)=>setAudit(current=>[{id:crypto.randomUUID(),label,detail},...current].slice(0,6));

  const search = async (override?:Partial<Query>) => {
    const next:Query={
      purpose, area:area.trim()||"現在地周辺", budget:Math.max(1000,Number(budget)||5500),
      people:Math.max(2,Number(people)||2), priority, privateRoom, dietary, ...override,
    };
    if(next.budget>30000||next.people>200){setSearchError("予算は30000円以下、人数は200名以下で入力してください。");return;}
    setSearchError("");
    setSearching(true); setCompleted(false); setFailover(false); setSelected(0);
    setQuery(next);
    try {
      const response=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});
      if(!response.ok)throw new Error("request_failed");
      const data=await response.json() as Partial<RouterState>;
      setRouter({route:data.route??"deterministic-fallback",model:data.model??null,summary:data.summary??"評価方針を更新しました。",traceId:data.traceId,latencyMs:data.latencyMs,tokenBudget:data.tokenBudget});
      addAudit("候補を再評価",`${next.purpose}・${next.people}名・上限${next.budget.toLocaleString()}円`);
    } catch {
      setRouter({route:"deterministic-fallback",model:null,summary:"通信に失敗したため、安全なローカル評価で候補を更新しました。",tokenBudget:0});
      addAudit("フォールバック", "外部通信を使わず候補生成を継続");
    } finally {
      setSearching(false); setSearched(true); setStage("ranked");
      setTimeout(()=>document.getElementById("results")?.scrollIntoView({behavior:"smooth",block:"start"}),60);
    }
  };

  const applySettings=()=>{
    setPriority(draftPriority); setAutonomy(draftAutonomy); setPrivateRoom(draftPrivateRoom); setDietary(draftDietary); setEventDate(draftEventDate); setEventTime(draftEventTime);
    setSettingsOpen(false);
    void search({priority:draftPriority,privateRoom:draftPrivateRoom,dietary:draftDietary});
  };

  const downloadCalendar=()=>{
    const start=new Date(`${eventDate}T${eventTime}:00+09:00`);
    const end=new Date(start.getTime()+2*60*60*1000);
    const stamp=(date:Date)=>date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
    const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ENCOPA//JA","BEGIN:VEVENT",`UID:${crypto.randomUUID()}@encopa`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${escapeIcs(query.purpose)}｜${escapeIcs(chosen?.name??"会場未定")}`,`LOCATION:${escapeIcs(query.area)}`,`DESCRIPTION:${escapeIcs(`ENCOPAで調整。参加予定 ${query.people}名。予約状況は主催者に確認してください。`)}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    const url=URL.createObjectURL(new Blob([ics],{type:"text/calendar;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="encopa-event.ics";link.click();URL.revokeObjectURL(url);
  };

  const advanceWorkflow=()=>{
    if(stage==="scheduled"){downloadCalendar();return}
    if(stage==="collecting"){setStage("awaiting_approval");addAudit("参加者回答を集約",`${query.people}名分のデモ回答を反映`);return}
    if(stage==="awaiting_approval"){setStage("scheduled");addAudit("幹事が最終承認","予定ファイルを作成。外部予約は未実行");downloadCalendar();return}
    setCompleted(true);setStage("collecting");addAudit("デモを開始","予約権限なし・回答収集のみ");
  };

  useEffect(()=>{
    try {
      const saved=localStorage.getItem("encopa-session-v1");
      if(saved){
        const value=JSON.parse(saved);
        // Restore the browser-owned draft once after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if(value.query){setQuery(value.query);setPurpose(value.query.purpose);setArea(value.query.area);setBudget(String(value.query.budget));setPeople(String(value.query.people));setPriority(value.query.priority);setPrivateRoom(value.query.privateRoom);setDietary(value.query.dietary);setSearched(true)}
        if(value.stage){setStage(value.stage);setCompleted(value.stage==="collecting"||value.stage==="awaiting_approval"||value.stage==="scheduled")}
        if(Array.isArray(value.audit))setAudit(value.audit);
        if(value.eventDate)setEventDate(value.eventDate);
        if(value.eventTime)setEventTime(value.eventTime);
      }
    } catch {}
    setRestored(true);
  },[]);

  useEffect(()=>{
    if(!restored)return;
    try {localStorage.setItem("encopa-session-v1",JSON.stringify({query,stage,audit,eventDate,eventTime}));} catch {}
  },[restored,query,stage,audit,eventDate,eventTime]);

  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options?:{signal?:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    void Promise.all([
      context.registerTool({
        name:"stage_venue_search",title:"候補を再評価",
        description:"目的・エリア・予算・人数を反映し、Orca Router経由で候補評価を開始します。予約は実行しません。",
        inputSchema:{type:"object",properties:{purpose:{type:"string"},area:{type:"string"},budget:{type:"integer",minimum:1000},people:{type:"integer",minimum:2}},required:["purpose","area","budget","people"],additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:false},
        execute:async(input:unknown)=>{const v=input as {purpose:string;area:string;budget:number;people:number};setPurpose(v.purpose);setArea(v.area);setBudget(String(v.budget));setPeople(String(v.people));await search(v);return{status:"ranked",router:"OrcaRouter",reservation_created:false,candidates:3}}
      },{signal:lifecycle.signal}),
      context.registerTool({
        name:"start_participant_confirmation",title:"参加者確認を開始",
        description:"選択中の候補について参加者確認画面を開きます。送信や予約は自動実行しません。",
        inputSchema:{type:"object",properties:{},additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:false},
        execute:()=>{setApprovalOpen(true);return{status:"confirmation_opened",venue:chosen?.name,reservation_created:false}}
      },{signal:lifecycle.signal})
    ]).catch(()=>{});
    return()=>lifecycle.abort();
  // The host tool registration is intentionally refreshed only when the selected venue changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[chosen?.name]);

  return <main className="min-h-screen bg-[#f7f5ef] text-[#1e2928]">
    <header className="sticky top-0 z-40 border-b border-[#1e2928]/10 bg-[#f7f5ef]/92 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-7 lg:px-10">
        <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-[12px] bg-[#1f4b46] text-[#fffaf1]"><UtensilsCrossed className="size-[18px]"/></div><div><p className="text-[20px] font-black tracking-[.08em]">ENCOPA <span className="font-sans text-xs font-semibold tracking-normal text-[#687371]">エンコパ</span></p><p className="hidden text-[11px] text-[#687371] sm:block">決めるところから、予定に入るまで。</p></div></div>
        <div className="flex items-center gap-2"><Badge className="hidden border-[#1f4b46]/15 bg-white text-[#36504c] sm:flex" variant="outline"><Route className="mr-1 size-3.5"/>Orca Router</Badge><Button onClick={()=>{setDraftPriority(priority);setDraftAutonomy(autonomy);setDraftPrivateRoom(privateRoom);setDraftDietary(dietary);setDraftEventDate(eventDate);setDraftEventTime(eventTime);setSettingsOpen(true)}} variant="outline" className="h-9 rounded-full border-[#1e2928]/15 bg-white px-4"><Settings2 className="mr-2 size-4"/>進行設定</Button></div>
      </div>
    </header>

    <section className="mx-auto grid max-w-[1440px] gap-6 px-4 py-5 sm:px-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10 lg:py-8">
      <div className="min-w-0">
        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {steps.map(([label],i)=><div key={label} className="flex shrink-0 items-center gap-2"><div className={`flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium ${i<=stageIndex?"bg-[#1f4b46] text-white":"bg-white text-[#77807e] ring-1 ring-[#1e2928]/10"}`}>{i<stageIndex?<Check className="size-3.5"/>:<span className="grid size-4 place-items-center rounded-full bg-current/10 text-[10px]">{i+1}</span>}{label}{i===stageIndex&&<span className="text-[10px] opacity-65">いまここ</span>}</div>{i<steps.length-1&&<ChevronRight className="size-4 text-[#a7aaa4]"/>}</div>)}
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[#1e2928]/10 bg-[#1f4b46] shadow-[0_18px_60px_rgba(31,75,70,.14)]">
          <div className="grid gap-7 p-5 sm:p-7 xl:grid-cols-[1fr_280px] xl:p-9">
            <div><div className="mb-5 flex items-center gap-2 text-[#d9c9a7]"><Sparkles className="size-4"/><span className="text-[13px] font-semibold tracking-[.08em]">集まる日の準備を、ひとつに</span></div><h1 className="max-w-[680px] font-serif text-[clamp(2rem,4.2vw,4.2rem)] leading-[1.04] tracking-[-.045em] text-[#fffaf1]">条件を変えるたび、<br className="hidden sm:block"/>候補と理由を組み直します。</h1><p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#e5e8df]/75">候補を比べて、予約内容をみんなで共有。アレルギーの確認も、待ち合わせの連絡も、この会のグループで。</p></div>
            <div className="rounded-[22px] border border-white/12 bg-white/[.07] p-5 text-[#fffaf1]"><p className="text-xs text-white/55">現在の入力上限</p><p className="mt-2 text-3xl font-semibold tracking-tight">{total.toLocaleString()}円</p><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-white/55">開催</span><span>{eventDate.slice(5).replace("-","/")} {eventTime}</span></div><div className="flex justify-between"><span className="text-white/55">優先</span><span>{priorityLabels[priority]}</span></div><div className="flex justify-between"><span className="text-white/55">進め方</span><span>{autonomy==="suggest"?"提案のみ":autonomy==="prepare"?"予約直前まで":"承認後に実行"}</span></div><div className="border-t border-white/10 pt-3 text-[12px] leading-5 text-white/55">個人名をモデルへ送らず、集約条件だけを評価します。</div></div></div>
          </div>
          <div className="grid gap-3 border-t border-white/10 bg-[#163d39] p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[1fr_1.25fr_.75fr_.65fr_auto]">
            <Field label="目的"><Select value={purpose} onValueChange={setPurpose}><SelectTrigger className="h-12 w-full rounded-xl border-white/10 bg-white text-[#1e2928]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="忘年会">忘年会</SelectItem><SelectItem value="新年会">新年会</SelectItem><SelectItem value="歓迎会">歓迎会</SelectItem><SelectItem value="送別会">送別会</SelectItem><SelectItem value="懇親会">懇親会</SelectItem><SelectItem value="打ち上げ">打ち上げ</SelectItem></SelectContent></Select></Field>
            <Field label="エリア"><div className="relative"><MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7d8986]"/><Input value={area} onChange={e=>setArea(e.target.value)} className="h-12 rounded-xl border-white/10 bg-white pl-9 text-base"/></div></Field>
            <Field label="予算 / 人"><div className="relative"><Input inputMode="numeric" value={budget} onChange={e=>setBudget(e.target.value.replace(/\D/g,""))} className="h-12 rounded-xl border-white/10 bg-white pr-9 text-base"/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#7d8986]">円</span></div></Field>
            <Field label="人数"><div className="relative"><Input inputMode="numeric" value={people} onChange={e=>setPeople(e.target.value.replace(/\D/g,""))} className="h-12 rounded-xl border-white/10 bg-white pr-9 text-base"/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#7d8986]">名</span></div></Field>
            <div className="flex items-end"><Button disabled={searching} onClick={()=>void search()} className="h-12 w-full rounded-xl bg-[#e17a4e] px-6 text-base font-semibold text-white shadow-lg hover:bg-[#ee8a5e] xl:w-auto">{searching?<RefreshCw className="mr-2 size-4 animate-spin"/>:<Search className="mr-2 size-4"/>}{searching?"再評価中":"候補を更新"}</Button></div>
          </div>
        </div>

        <section id="results" className="scroll-mt-24 pt-8">
          {searchError&&<p role="alert" className="mb-4 text-sm text-red-700">{searchError}</p>}
          <p className="mb-4 text-sm leading-6 text-[#687370]">以下は条件比較用のデモ店舗です。実店舗や空席の検索ではありません。グループ作成時に、実際の店名と住所を入力してください。</p>
          {allergy.status==='selected'&&<p className="mb-4 rounded-xl bg-[#eee6d7] p-4 text-sm">確認が必要な食材：{allergy.items.join('、')||'選択してください'}。候補の表示はアレルギー対応を保証しません。</p>}
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[12px] font-semibold tracking-[.12em] text-[#aa5a3d]">SHORTLIST · {query.area}</p><h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{searched?`${query.purpose}に合う3候補`:"条件に合わせた初期候補"}</h2></div><p className="max-w-md text-sm leading-6 text-[#6e7774]">現在は実店舗連携前の評価デモです。入力変更後に「候補を更新」で順位・点数・理由が変わります。</p></div>
          {failover&&<div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#d78a66]/30 bg-[#fff3eb] p-4 text-sm text-[#7c4631]"><RefreshCw className="mt-0.5 size-4 shrink-0"/><div><p className="font-semibold">第1候補が満席になったため、自動で再評価しました</p><p className="mt-1 text-xs">予算・個室・食事制限を維持したまま、次点候補を先頭へ切り替えています。</p></div></div>}
          <div className="grid gap-4 xl:grid-cols-3">
            {candidates.map((v,i)=><button key={v.id} onClick={()=>{setSelected(i);setCompleted(false);setStage("ranked")}} className={`group overflow-hidden rounded-[22px] border bg-white text-left transition duration-300 hover:-translate-y-1 hover:shadow-xl ${selected===i?"border-[#1f4b46] ring-2 ring-[#1f4b46]/12":"border-[#1e2928]/10"}`}>
              <div className={`relative h-28 bg-gradient-to-br ${v.color} p-5 text-white`}><div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_32%),linear-gradient(120deg,transparent_55%,white_55%,transparent_56%)]"/><div className="relative flex items-start justify-between"><Badge className="border-white/15 bg-white/15 text-white">{i===0?"最も条件に合う":`候補 ${i+1}`}</Badge><div className="grid size-12 place-items-center rounded-full bg-white text-[#244742] shadow-lg"><span className="text-lg font-bold">{v.score}</span></div></div></div>
              <div className="p-5"><p className="text-xs font-medium text-[#aa5a3d]">{v.genre}</p><h3 className="mt-1 text-xl font-semibold tracking-tight">{v.name}</h3><div className="mt-3 flex items-center justify-between text-sm"><span className="font-semibold">{v.price.toLocaleString()}円 / 人</span><span className="text-[#67726f]">{v.walk}</span></div><p className="mt-4 min-h-[72px] text-sm leading-6 text-[#687370]">{v.reason}</p><div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f7f5ef] p-3"><ScorePart label="条件適合" value={v.breakdown.fit}/><ScorePart label="予算" value={v.breakdown.budget}/><ScorePart label="運用安全" value={v.breakdown.operation}/></div><div className="mt-4 flex flex-wrap gap-2">{v.tags.map(t=><span key={t} className="rounded-full bg-[#f3f0e8] px-2.5 py-1 text-xs text-[#58625f]">{t}</span>)}</div><div className="mt-5 flex items-center justify-between border-t border-[#1e2928]/8 pt-4"><span className="flex items-center gap-1.5 text-xs font-medium text-[#2f6b57]"><CircleCheck className="size-4"/>{v.availability}</span>{selected===i&&<span className="text-xs font-semibold text-[#1f4b46]">選択中</span>}</div></div>
            </button>)}
          </div>
          <div className="mt-5 space-y-3 rounded-2xl border bg-white p-5"><label className="block text-sm font-semibold">選択した会場の住所<Input className="mt-2 h-12 bg-white" maxLength={200} placeholder="実際の店舗住所を入力" value={addresses[chosen?.id]||""} onChange={e=>setAddresses({...addresses,[chosen.id]:e.target.value})}/></label><MapLinks address={addresses[chosen?.id]||""}/></div>
          <CreateGroup title={`${query.purpose}のグループ`} initial={{venueName:chosen?.name||"",address:addresses[chosen?.id]||"",date:eventDate,time:eventTime,people:query.people,price:chosen?.price||query.budget,status:"planning",bookingReference:"",note:"",website:""}}/>
          <div className="mt-5 grid gap-4 rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-sm sm:p-6 xl:grid-cols-[1.1fr_.9fr_auto] xl:items-center">
            <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-[#e8eee9] text-[#1f4b46]"><Users className="size-4"/></span><div><p className="text-sm font-semibold">端末用の予定ファイル</p><p className="text-xs text-[#7b8381]">共有せず、カレンダーに予定だけを保存できます</p></div></div>
            <div className="grid grid-cols-3 gap-3 text-center"><MiniStat label="デモ回答" value={`${Math.max(2,query.people-4)} / ${query.people}`}/><MiniStat label="第1候補OK" value={`${Math.max(2,query.people-6)}名`}/><MiniStat label="未回答" value={`${Math.min(4,query.people)}名`}/></div>
            <Button onClick={()=>setApprovalOpen(true)} className="h-12 rounded-xl bg-[#1f4b46] px-6 text-white hover:bg-[#163d39]">予定を確認する<ArrowRight className="ml-2 size-4"/></Button>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-4 overflow-hidden rounded-[24px] border border-[#1e2928]/10 bg-[#1f4b46] p-5 text-white shadow-[0_16px_40px_rgba(30,41,40,.12)]">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#d9c9a7]">ORCA ROUTER</p><h2 className="mt-1 text-xl font-semibold">最適な推論経路を選択</h2></div><span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#e17a4e] opacity-60"/><span className="relative inline-flex size-3 rounded-full bg-[#e17a4e]"/></span></div>
          <div className="mt-4 rounded-2xl bg-white/[.07] p-4"><div className="flex items-center justify-between text-xs"><span className="text-white/55">現在の経路</span><span className="font-semibold">{router.route}</span></div>{router.model&&<div className="mt-2 flex items-center justify-between text-xs"><span className="text-white/55">選択モデル</span><span className="max-w-[170px] truncate font-semibold">{router.model}</span></div>}<div className="mt-2 flex items-center justify-between text-xs"><span className="text-white/55">出力上限</span><span className="font-semibold">{router.tokenBudget??0} tokens</span></div>{router.latencyMs!==undefined&&<div className="mt-2 flex items-center justify-between text-xs"><span className="text-white/55">応答時間</span><span className="font-semibold">{router.latencyMs} ms</span></div>}<p className="mt-3 text-xs leading-5 text-white/65">{router.summary}</p>{router.traceId&&<p className="mt-2 truncate font-mono text-[10px] text-white/35">trace {router.traceId}</p>}</div>
          <div className="mt-4 space-y-3 text-sm"><AgentAction text="条件を構造化して安全判定" done/><AgentAction text="品質・コスト・遅延でモデル選択" active/><AgentAction text="失敗時はローカル評価へ切替" done/></div>
          <Button onClick={()=>{setFailover(true);setSelected(0);setStage("ranked");addAudit("代替候補へ切替","第1候補を除外し、同じ制約で再評価")}} variant="outline" className="mt-5 w-full rounded-xl border-white/15 bg-white/[.06] text-white hover:bg-white/15 hover:text-white"><RefreshCw className="mr-2 size-4"/>満席時の切替を試す</Button>
        </div>
        <div className="rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-[0_16px_40px_rgba(30,41,40,.07)]"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#a85b40]">進行状況</p><h2 className="mt-1 text-xl font-semibold">この会の準備</h2></div><span className="text-2xl font-semibold text-[#1f4b46]">{progress}%</span></div><Progress value={progress} className="mt-4 h-2 bg-[#e9e8e1] [&>div]:bg-[#df764a]"/><div className="mt-6 space-y-1"><StatusRow icon={WalletCards} title="目的・予算" detail={`${query.purpose}・${query.budget.toLocaleString()}円`} done/><StatusRow icon={MapPin} title="会場候補" detail={`${query.area}・3件`} done={stageIndex>1} active={stageIndex===1}/><StatusRow icon={Users} title="参加者確認" detail={stageIndex<2?"リンク未送信":stageIndex===2?"回答を収集中":"回答完了"} done={stageIndex>2} active={stageIndex===2}/><StatusRow icon={CalendarDays} title="予約と予定" detail={stage==="scheduled"?"予定ファイル作成済み":"幹事承認後に実行"} done={stage==="scheduled"} active={stage==="awaiting_approval"}/></div><div className="mt-6 rounded-2xl bg-[#f3f0e8] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-[#2f6b57]"/>安全境界</div><p className="mt-2 text-xs leading-5 text-[#6d7572]">個人情報はモデルへ送らず、外部予約は実行しません。店舗への予約は幹事が行い、グループで状況を共有してください。</p></div></div>
        <div className="mt-4 rounded-[24px] border border-[#1e2928]/10 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#a85b40]">AUDIT TRAIL</p><h2 className="mt-1 text-lg font-semibold">実行証跡</h2></div><Badge variant="outline" className="bg-[#f7f5ef]">端末内保存</Badge></div><div className="mt-4 space-y-3">{audit.slice(0,4).map((item,index)=><div key={item.id} className="flex gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${index===0?"bg-[#e17a4e]":"bg-[#c7cbc7]"}`}/><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-0.5 text-xs leading-5 text-[#77807e]">{item.detail}</p></div></div>)}</div></div>
      </aside>
    </section>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] bg-[#fbfaf6] sm:max-w-[560px]"><DialogHeader><DialogTitle className="font-serif text-2xl">ENCOPAの進行設定</DialogTitle><DialogDescription>設定を保存すると、候補をその場で再評価します。</DialogDescription></DialogHeader><div className="space-y-5 py-2"><div className="grid grid-cols-2 gap-3"><div><Label className="mb-2 block">開催日</Label><Input type="date" value={draftEventDate} onChange={e=>setDraftEventDate(e.target.value)} className="h-11 bg-white"/></div><div><Label className="mb-2 block">開始時刻</Label><Input type="time" value={draftEventTime} onChange={e=>setDraftEventTime(e.target.value)} className="h-11 bg-white"/></div></div><div><Label className="mb-2 block">候補選びで優先すること</Label><Select value={draftPriority} onValueChange={v=>setDraftPriority(v as Priority)}><SelectTrigger className="h-11 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="balance">バランス</SelectItem><SelectItem value="conversation">会話しやすさ</SelectItem><SelectItem value="cost">予算の収まり</SelectItem><SelectItem value="access">移動しやすさ</SelectItem></SelectContent></Select></div><div><Label className="mb-2 block">自律進行レベル</Label><Select value={draftAutonomy} onValueChange={v=>setDraftAutonomy(v as Autonomy)}><SelectTrigger className="h-11 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="suggest">提案のみ</SelectItem><SelectItem value="prepare">予約直前まで</SelectItem><SelectItem value="execute">幹事承認後に予約・予定登録</SelectItem></SelectContent></Select></div><SettingSwitch label="個室・半個室を優先" description="会話のしやすさを評価に加えます" checked={draftPrivateRoom} onCheckedChange={setDraftPrivateRoom}/><SettingSwitch label="食事制限への対応を優先" description="相談可のデモ条件を評価します。対応保証ではありません" checked={draftDietary} onCheckedChange={setDraftDietary}/><AllergyPicker value={allergy} onChange={setAllergy} privateSharing={false}/></div><DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>変更しない</Button><Button onClick={applySettings} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">保存して再評価</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] border-0 bg-[#fbfaf6] p-0 sm:max-w-[600px]"><DialogHeader className="border-b border-[#1e2928]/10 p-6 text-left"><DialogTitle className="font-serif text-2xl">確認・承認・予定確保</DialogTitle><DialogDescription>外部操作の前に人が承認する段階を明確に分けています。</DialogDescription></DialogHeader><div className="space-y-4 px-6"><div className="rounded-2xl border border-[#1e2928]/10 bg-white p-4"><p className="text-xs text-[#7a8380]">現在の第一候補</p><p className="mt-1 text-lg font-semibold">{chosen?.name}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><span className="text-[#68716f]">開催予定</span><span className="text-right font-medium">{eventDate} {eventTime}</span><span className="text-[#68716f]">費用見込み</span><span className="text-right font-medium">{((chosen?.price??0)*query.people).toLocaleString()}円</span><span className="text-[#68716f]">注意</span><span className="text-right font-medium">{chosen?.risk}</span></div></div><div className="grid gap-3 sm:grid-cols-3"><CheckCard icon={Clock3} title="日程" value="開催日時を固定"/><CheckCard icon={UtensilsCrossed} title="食事" value="店舗への確認が必要"/><CheckCard icon={Users} title="匿名性" value="必要情報だけ集約"/></div>{stage==="scheduled"?<div className="rounded-2xl bg-[#e8f0ea] p-4 text-sm text-[#24533f]"><div className="flex items-center gap-2 font-semibold"><CircleCheck className="size-5"/>予定ファイルを作成しました</div><p className="mt-1 pl-7 text-xs leading-5">カレンダーへ登録できます。外部店舗の予約APIは未接続のため、予約成立とは表示しません。</p></div>:completed?<div className="rounded-2xl bg-[#e8f0ea] p-4 text-sm text-[#24533f]"><div className="flex items-center gap-2 font-semibold"><CircleCheck className="size-5"/>{stage==="awaiting_approval"?"回答が揃い、最終承認待ちです":"参加者確認のデモです"}</div><p className="mt-1 pl-7 text-xs leading-5">操作は監査ログへ記録され、予約権限はまだ使用されていません。</p></div>:<div className="rounded-2xl bg-[#f4eee2] p-4 text-xs leading-5 text-[#75643f]">回答は会場評価に必要な形へ集約し、個人名や自由記述をOrca Routerへ送りません。</div>}</div><DialogFooter className="p-6 pt-2 sm:justify-between"><Button variant="outline" onClick={()=>setApprovalOpen(false)}>候補を見直す</Button><Button onClick={advanceWorkflow} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">{stage==="scheduled"?<><Download className="mr-2 size-4"/>予定を再取得</>:stage==="awaiting_approval"?"最終承認して予定作成":stage==="collecting"?"デモ回答を反映":"デモを開始"}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function rankVenues(query:Query, failover:boolean):Venue[] {
  const scored=venuePool.map(v=>{
    let score=v.base;
    if(v.purpose.includes(query.purpose))score+=7;
    if(v.capacity>=query.people)score+=6; else score-=30+(query.people-v.capacity)*2;
    const difference=query.budget-v.price;
    score+=difference>=0?Math.min(8,difference/250):-Math.min(25,Math.abs(difference)/120);
    if(query.privateRoom)score+=v.privateRoom?8:-10;
    if(query.dietary)score+=v.dietary?6:-9;
    if(query.priority==="conversation")score+=(v.conversation-75)/3;
    if(query.priority==="cost")score+=(v.value-75)/2.5;
    if(query.priority==="access")score+=(v.access-75)/2.5;
    if(failover&&v.id==="nagi")score-=60;
    const strengths=[
      v.price<=query.budget?"予算内":"予算超過",
      v.capacity>=query.people?`${query.people}名を同じ会場で案内可能`:"人数上限に注意",
      query.privateRoom&&v.privateRoom?"個室条件に対応":"",
      query.dietary&&v.dietary?"食事制限を相談可能":"",
      query.priority==="access"&&v.access>85?"移動負担が小さい":"",
      query.priority==="conversation"&&v.conversation>90?"会話しやすい":"",
    ].filter(Boolean);
    const fit=Math.max(0,Math.min(100,Math.round((v.base+v.conversation+(v.purpose.includes(query.purpose)?100:55))/3)));
    const budgetScore=Math.max(0,Math.min(100,Math.round(100-Math.max(0,v.price-query.budget)/35-Math.max(0,query.budget-v.price)/180)));
    const operation=Math.max(0,Math.min(100,Math.round((v.access+(v.capacity>=query.people?100:30)+(v.dietary?95:55))/3)));
    return {...v,score:Math.max(35,Math.min(99,Math.round(score))),reason:`${strengths.slice(0,3).join("・")}。設定した「${priorityLabels[query.priority]}」を重視して評価しました。`,walk:`徒歩${v.minutes}分（デモ）`,availability:v.capacity>=query.people?"空席未確認（デモ）":"人数条件に不一致",breakdown:{fit,budget:budgetScore,operation}};
  }).sort((a,b)=>b.score-a.score);
  return scored.slice(0,3);
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="mb-2 block text-[12px] font-semibold text-white/65">{label}</Label>{children}</div>}
function MiniStat({label,value}:{label:string;value:string}){return <div><p className="text-[11px] text-[#838a88]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>}
function StatusRow({icon:Icon,title,detail,done,active}:{icon:React.ElementType;title:string;detail:string;done?:boolean;active?:boolean}){return <div className={`flex items-center gap-3 rounded-xl p-3 ${active?"bg-[#eef2ed]":""}`}><span className={`grid size-9 place-items-center rounded-xl ${done?"bg-[#dfeae2] text-[#2f6b57]":active?"bg-[#1f4b46] text-white":"bg-[#f1f0eb] text-[#8a918f]"}`}>{done?<Check className="size-4"/>:<Icon className="size-4"/>}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="truncate text-xs text-[#7a8380]">{detail}</p></div>{active&&<span className="size-2 rounded-full bg-[#df764a]"/>}</div>}
function CheckCard({icon:Icon,title,value}:{icon:React.ElementType;title:string;value:string}){return <div className="rounded-2xl border border-[#1e2928]/10 bg-white p-3"><Icon className="size-4 text-[#1f4b46]"/><p className="mt-3 text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-4 text-[#77807e]">{value}</p></div>}
function AgentAction({text,done,active}:{text:string;done?:boolean;active?:boolean}){return <div className="flex items-center gap-2.5"><span className={`grid size-5 place-items-center rounded-full ${done?"bg-[#d9c9a7] text-[#1f4b46]":active?"bg-[#e17a4e] text-white":"border border-white/25 text-white/40"}`}>{done?<Check className="size-3"/>:<span className="size-1.5 rounded-full bg-current"/>}</span><span className={active?"font-semibold":"text-white/70"}>{text}</span></div>}
function SettingSwitch({label,description,checked,onCheckedChange}:{label:string;description:string;checked:boolean;onCheckedChange:(v:boolean)=>void}){return <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#1e2928]/10 bg-white p-4"><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-[#77807e]">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange}/></div>}
function ScorePart({label,value}:{label:string;value:number}){return <div className="text-center"><p className="text-[10px] text-[#7b8381]">{label}</p><p className="mt-1 text-sm font-bold text-[#1f4b46]">{value}</p></div>}
function escapeIcs(value:string){return value.replace(/\\/g,"\\\\").replace(/,/g,"\\,").replace(/;/g,"\\;").replace(/\n/g,"\\n")}
