"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CreateGroup } from "@/components/encopa/create-group";
import { AllergyPicker } from "@/components/encopa/allergy-picker";
import { AgentInsight } from "@/components/encopa/agent-insight";
import { MapLinks, VenueMap } from "@/components/encopa/maps";
import { EMPTY_ALLERGY, type AllergyProfile } from "@/lib/group-types";
import type { AgentPlan, AgentPlanResponse } from "@/lib/agent-types";
import type { VenueSearchResponse, VenueSearchResult } from "@/lib/venue-types";
import {
  ArrowRight, CalendarDays, Check, ChevronRight, CircleCheck, Clock3, Copy, Download, ExternalLink,
  MapPin, RefreshCw, Search, Settings2, Share2, ShieldCheck, Sparkles,
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
type Query = { purpose:string; area:string; budget:number; people:number; priority:Priority; privateRoom:boolean; dietary:boolean };
type Stage = "draft" | "ranked" | "collecting" | "awaiting_approval" | "scheduled";
type AuditEvent = { id:string; label:string; detail:string };

const steps = [["条件","完了"],["候補比較","いまここ"],["みんなに確認","次"],["幹事が承認",""],["予約・予定確保",""]];
const priorityLabels: Record<Priority,string> = { balance:"バランス", conversation:"会話しやすさ", cost:"予算", access:"移動しやすさ" };

export default function Home() {
  const [allergy,setAllergy]=useState<AllergyProfile>(EMPTY_ALLERGY);
  const [searchError,setSearchError]=useState("");
  const [purpose,setPurpose]=useState("忘年会");
  const [area,setArea]=useState("長崎駅周辺");
  const [budget,setBudget]=useState("5500");
  const [people,setPeople]=useState("18");
  const [priority,setPriority]=useState<Priority>("balance");
  const [draftPriority,setDraftPriority]=useState<Priority>("balance");
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
  const [venues,setVenues]=useState<VenueSearchResult[]>([]);
  const [agentStatus,setAgentStatus]=useState<"idle"|"running"|"ready"|"error">("idle");
  const [agentPlan,setAgentPlan]=useState<AgentPlan|null>(null);
  const [agentError,setAgentError]=useState("");
  const [providerTotal,setProviderTotal]=useState(0);
  const [fetchedAt,setFetchedAt]=useState(0);
  const [selected,setSelected]=useState(0);
  const [approvalOpen,setApprovalOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [allergyOpen,setAllergyOpen]=useState(false);
  const [shareStatus,setShareStatus]=useState("");
  const [completed,setCompleted]=useState(false);
  const [failover,setFailover]=useState(false);
  const [stage,setStage]=useState<Stage>("draft");
  const [audit,setAudit]=useState<AuditEvent[]>([{id:"init",label:"会を作成",detail:"外部操作はまだ行っていません"}]);
  const [restored,setRestored]=useState(false);

  const total=Number(budget||0)*Number(people||0);
  const hasAllergy=allergy.status==="selected"&&allergy.items.length>0;
  const candidates=useMemo(()=>failover&&venues.length>1?[...venues.slice(1),venues[0]]:venues,[venues,failover]);
  const chosen=candidates[Math.min(selected,candidates.length-1)] ?? candidates[0];
  const stageIndex={draft:0,ranked:1,collecting:2,awaiting_approval:3,scheduled:4}[stage];
  const progress=[15,40,62,82,100][stageIndex];
  const addAudit=(label:string,detail:string)=>setAudit(current=>[{id:crypto.randomUUID(),label,detail},...current].slice(0,6));

  const search = async (override?:Partial<Query>) => {
    const next:Query={
      purpose, area:area.trim()||"現在地周辺", budget:Math.max(1000,Number(budget)||5500),
      people:Math.max(2,Number(people)||2), priority, privateRoom, dietary:dietary||hasAllergy, ...override,
    };
    if(next.budget>30000||next.people>200){setSearchError("予算は30000円以下、人数は200名以下で入力してください。");return;}
    setSearchError("");
    setSearching(true); setCompleted(false); setFailover(false); setSelected(0); setAgentStatus("idle"); setAgentPlan(null); setAgentError("");
    setQuery(next);
    try {
      const response=await fetch("/api/venues",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});
      const data=await response.json() as Partial<VenueSearchResponse>&{error?:string};
      if(!response.ok)throw new Error(data.error||"店舗を検索できませんでした。");
      const nextVenues=Array.isArray(data.venues)?data.venues:[];
      setVenues(nextVenues);setProviderTotal(Number(data.total||nextVenues.length));setFetchedAt(Number(data.fetchedAt||Date.now()));
      if(!nextVenues.length)setSearchError("条件に合う店舗が見つかりませんでした。エリア名を駅名や市区町村名に変えてお試しください。");
      addAudit("実店舗を検索",`${next.area}で${nextVenues.length}件の候補を表示`);
      if(nextVenues.length){
        setAgentStatus("running");
        try {
          const agentResponse=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...next,candidates:nextVenues.slice(0,6)})});
          const agentData=await agentResponse.json() as AgentPlanResponse;
          if(!agentResponse.ok||!agentData.available)throw new Error(agentData.available?"候補分析を完了できませんでした。":agentData.error);
          setAgentPlan(agentData);setAgentStatus("ready");
          const advice=new Map(agentData.venueAdvice.map(item=>[item.venueId,item]));
          const enriched=nextVenues.map(venue=>{const item=advice.get(venue.id);return item?{...venue,score:Math.round(venue.score*.65+item.score*.35),reason:item.reason||venue.reason}:venue}).sort((a,b)=>b.score-a.score);
          setVenues(enriched);
          const recommendedIndex=enriched.findIndex(venue=>venue.id===agentData.recommendedVenueId);
          if(recommendedIndex>=0)setSelected(recommendedIndex);
          addAudit("候補を詳しく比較","会場条件と予約前の確認事項を整理しました");
        } catch (error) {
          setAgentStatus("error");setAgentError(error instanceof Error?error.message:"候補分析を完了できませんでした。");
        }
      }
    } catch (error) {
      setVenues([]);setProviderTotal(0);setSearchError(error instanceof Error?error.message:"店舗を検索できませんでした。");
    } finally {
      setSearching(false); setSearched(true); setStage("ranked");
      setTimeout(()=>document.getElementById("results")?.scrollIntoView({behavior:"smooth",block:"start"}),60);
    }
  };

  const applySettings=()=>{
    setPriority(draftPriority); setPrivateRoom(draftPrivateRoom); setDietary(draftDietary); setEventDate(draftEventDate); setEventTime(draftEventTime);
    setSettingsOpen(false);
    void search({priority:draftPriority,privateRoom:draftPrivateRoom,dietary:draftDietary});
  };

  const downloadCalendar=()=>{
    const start=new Date(`${eventDate}T${eventTime}:00+09:00`);
    const end=new Date(start.getTime()+2*60*60*1000);
    const stamp=(date:Date)=>date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
    const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ENCOPA//JA","BEGIN:VEVENT",`UID:${crypto.randomUUID()}@encopa`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${escapeIcs(query.purpose)}｜${escapeIcs(chosen?.name??"会場未定")}`,`LOCATION:${escapeIcs(chosen?.address??query.area)}`,`URL:${escapeIcs(chosen?.url??"")}`,`DESCRIPTION:${escapeIcs(`ENCOPAで調整。参加予定 ${query.people}名。予約状況は主催者に確認してください。`)}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    const url=URL.createObjectURL(new Blob([ics],{type:"text/calendar;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="encopa-event.ics";link.click();URL.revokeObjectURL(url);
  };

  const planText=()=>[
    `【${query.purpose}】`,
    `${eventDate} ${eventTime}`,
    `${chosen?.name??"会場未定"}（${chosen?.address??query.area}）`,
    `${query.people}名・${chosen?.budgetLabel??`1人 ${query.budget.toLocaleString()}円目安`}`,
    hasAllergy?"アレルギー確認：あり（詳細は幹事が個別に確認）":"アレルギー確認：設定なし",
    "詳細・出欠はENCOPAのグループで確認してください。",
  ].join("\n");

  const sharePlan=async()=>{
    setShareStatus("");
    try{
      if(navigator.share){await navigator.share({title:`${query.purpose}のプラン`,text:planText(),url:location.href});setShareStatus("共有しました");return;}
      await navigator.clipboard.writeText(`${planText()}\n${location.href}`);setShareStatus("共有用テキストをコピーしました");
    }catch(error){if((error as DOMException).name!=="AbortError")setShareStatus("共有できませんでした。もう一度お試しください。");}
  };

  const copyPlan=async()=>{
    try{await navigator.clipboard.writeText(`${planText()}\n${location.href}`);setShareStatus("共有用テキストをコピーしました");}
    catch{setShareStatus("コピーできませんでした。ブラウザの権限をご確認ください。");}
  };

  const advanceWorkflow=()=>{
    if(stage==="scheduled"){downloadCalendar();return}
    if(stage==="collecting"){setStage("awaiting_approval");addAudit("参加者の回答を確認","出欠と希望条件をまとめました");return}
    if(stage==="awaiting_approval"){setStage("scheduled");addAudit("幹事が最終承認","予定ファイルを作成。外部予約は未実行");downloadCalendar();return}
    setCompleted(true);setStage("collecting");addAudit("参加者確認を開始","共有リンクから回答を受け付けます");
  };

  useEffect(()=>{
    try {
      const saved=localStorage.getItem("encopa-session-v2");
      if(saved){
        const value=JSON.parse(saved);
        // Restore the browser-owned draft once after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if(value.query){setQuery(value.query);setPurpose(value.query.purpose);setArea(value.query.area);setBudget(String(value.query.budget));setPeople(String(value.query.people));setPriority(value.query.priority);setPrivateRoom(value.query.privateRoom);setDietary(value.query.dietary)}
        if(Array.isArray(value.venues)&&Date.now()-Number(value.fetchedAt)<23*60*60*1000){setVenues(value.venues);setFetchedAt(Number(value.fetchedAt));setProviderTotal(Number(value.providerTotal||value.venues.length));setSearched(true)}
        if(value.stage){setStage(value.stage);setCompleted(value.stage==="collecting"||value.stage==="awaiting_approval"||value.stage==="scheduled")}
        if(Array.isArray(value.audit))setAudit(value.audit);
        if(value.eventDate)setEventDate(value.eventDate);
        if(value.eventTime)setEventTime(value.eventTime);
        if(value.allergy)setAllergy(value.allergy);
      }
    } catch {}
    setRestored(true);
  },[]);

  useEffect(()=>{
    if(!restored)return;
    try {localStorage.setItem("encopa-session-v2",JSON.stringify({query,stage,audit,eventDate,eventTime,allergy,venues,providerTotal,fetchedAt}));} catch {}
  },[restored,query,stage,audit,eventDate,eventTime,allergy,venues,providerTotal,fetchedAt]);

  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options?:{signal?:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    void Promise.all([
      context.registerTool({
        name:"stage_venue_search",title:"候補を再評価",
        description:"目的・エリア・予算・人数を反映し、候補を並べ直します。",
        inputSchema:{type:"object",properties:{purpose:{type:"string"},area:{type:"string"},budget:{type:"integer",minimum:1000},people:{type:"integer",minimum:2}},required:["purpose","area","budget","people"],additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:false},
        execute:async(input:unknown)=>{const v=input as {purpose:string;area:string;budget:number;people:number};setPurpose(v.purpose);setArea(v.area);setBudget(String(v.budget));setPeople(String(v.people));await search(v);return{status:"ranked",reservation_created:false}}
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
        <div className="flex items-center gap-2"><Button disabled={!chosen} onClick={()=>void sharePlan()} variant="outline" className="hidden h-9 rounded-full border-[#1e2928]/15 bg-white px-4 sm:inline-flex"><Share2 className="mr-2 size-4"/>プラン共有</Button><Button onClick={()=>{setDraftPriority(priority);setDraftPrivateRoom(privateRoom);setDraftDietary(dietary);setDraftEventDate(eventDate);setDraftEventTime(eventTime);setSettingsOpen(true)}} variant="outline" className="h-9 rounded-full border-[#1e2928]/15 bg-white px-4"><Settings2 className="mr-2 size-4"/>詳細設定</Button></div>
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
            <div className="rounded-[22px] border border-white/12 bg-white/[.07] p-5 text-[#fffaf1]"><p className="text-xs text-white/55">予算の目安</p><p className="mt-2 text-3xl font-semibold tracking-tight">{total.toLocaleString()}円</p><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-white/55">開催</span><span>{eventDate.slice(5).replace("-","/")} {eventTime}</span></div><div className="flex justify-between"><span className="text-white/55">優先</span><span>{priorityLabels[priority]}</span></div><div className="flex justify-between"><span className="text-white/55">アレルギー</span><span>{hasAllergy?`${allergy.items.length}項目を確認`:allergy.status==="none"?"なし":"未設定"}</span></div><div className="border-t border-white/10 pt-3 text-[12px] leading-5 text-white/65">選んだ条件とプランは、いつでも参加者へ共有できます。</div></div></div>
          </div>
          <div className="grid gap-3 border-t border-white/10 bg-[#163d39] p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[.9fr_1.15fr_.68fr_.56fr_.85fr_auto]">
            <Field label="目的"><Select value={purpose} onValueChange={setPurpose}><SelectTrigger className="h-12 w-full rounded-xl border-white/10 bg-white text-[#1e2928]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="忘年会">忘年会</SelectItem><SelectItem value="新年会">新年会</SelectItem><SelectItem value="歓迎会">歓迎会</SelectItem><SelectItem value="送別会">送別会</SelectItem><SelectItem value="懇親会">懇親会</SelectItem><SelectItem value="打ち上げ">打ち上げ</SelectItem></SelectContent></Select></Field>
            <Field label="エリア"><div className="relative"><MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7d8986]"/><Input value={area} onChange={e=>setArea(e.target.value)} className="h-12 rounded-xl border-white/10 bg-white pl-9 text-base"/></div></Field>
            <Field label="予算 / 人"><div className="relative"><Input inputMode="numeric" value={budget} onChange={e=>setBudget(e.target.value.replace(/\D/g,""))} className="h-12 rounded-xl border-white/10 bg-white pr-9 text-base"/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#7d8986]">円</span></div></Field>
            <Field label="人数"><div className="relative"><Input inputMode="numeric" value={people} onChange={e=>setPeople(e.target.value.replace(/\D/g,""))} className="h-12 rounded-xl border-white/10 bg-white pr-9 text-base"/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#7d8986]">名</span></div></Field>
            <Field label="アレルギー"><button type="button" onClick={()=>setAllergyOpen(true)} className="flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-white px-3 text-left text-sm font-medium text-[#1e2928] transition hover:bg-[#f7f5ef]"><span className="truncate">{hasAllergy?`${allergy.items.length}項目を設定`:allergy.status==="none"?"なし":"設定する"}</span><ChevronRight className="size-4 text-[#7d8986]"/></button></Field>
            <div className="flex items-end"><Button disabled={searching} onClick={()=>void search()} className="h-12 w-full rounded-xl bg-[#e17a4e] px-6 text-base font-semibold text-white shadow-lg hover:bg-[#ee8a5e] xl:w-auto">{searching?<RefreshCw className="mr-2 size-4 animate-spin"/>:<Search className="mr-2 size-4"/>}{searching?"検索中":"実店舗を検索"}</Button></div>
          </div>
        </div>

        <section id="results" className="scroll-mt-24 pt-8">
          {searchError&&<p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{searchError}</p>}
          {allergy.status==='selected'&&<p className="mb-4 rounded-xl bg-[#eee6d7] p-4 text-sm"><span className="font-semibold">店舗へ確認する食材：</span>{allergy.items.join('、')||'選択してください'}。予約前に、調理時の混入を含めて店舗へご確認ください。</p>}
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[12px] font-semibold tracking-[.12em] text-[#aa5a3d]">RESTAURANTS · {query.area}</p><h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{searched?candidates.length?`${query.purpose}に合う実店舗 ${candidates.length}件`:"検索結果":"条件を入力して実店舗を検索"}</h2></div><p className="max-w-md text-sm leading-6 text-[#6e7774]">予算、人数、個室などの条件から実在する店舗を比較します。空席とアレルギー対応は予約前に店舗へ確認してください。</p></div>
          {!searched&&<div className="grid min-h-56 place-items-center rounded-[24px] border border-dashed border-[#1e2928]/20 bg-white px-6 text-center"><div><Search className="mx-auto size-8 text-[#1f4b46]"/><p className="mt-4 font-semibold">エリアを入力して「実店舗を検索」を押してください</p><p className="mt-2 text-sm text-[#687370]">例：長崎駅、思案橋、浜町</p></div></div>}
          {failover&&candidates.length>1&&<div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#d78a66]/30 bg-[#fff3eb] p-4 text-sm text-[#7c4631]"><RefreshCw className="mt-0.5 size-4 shrink-0"/><div><p className="font-semibold">次の候補を先頭に表示しました</p><p className="mt-1 text-xs">検索条件は変えずに、別の店舗を比較できます。</p></div></div>}
          {candidates.length>0&&<div className="grid gap-4 xl:grid-cols-3">
            {candidates.map((v,i)=><button key={v.id} onClick={()=>{setSelected(i);setCompleted(false);setStage("ranked")}} className={`group overflow-hidden rounded-[22px] border bg-white text-left transition duration-300 hover:-translate-y-1 hover:shadow-xl ${selected===i?"border-[#1f4b46] ring-2 ring-[#1f4b46]/12":"border-[#1e2928]/10"}`}>
              <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#436d72] to-[#264f57] text-white">{v.photoUrl&&<Image src={v.photoUrl} alt="" fill sizes="(min-width:1280px) 30vw, 100vw" className="object-cover transition duration-300 group-hover:scale-[1.03]"/>}<div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"/><div className="absolute inset-x-0 top-0 flex items-start justify-between p-4"><Badge className="border-white/15 bg-black/35 text-white">{i===0?"最も条件に合う":`候補 ${i+1}`}</Badge><div className="grid size-12 place-items-center rounded-full bg-white text-[#244742] shadow-lg"><span className="text-lg font-bold">{v.score}</span></div></div></div>
              <div className="p-5"><p className="text-xs font-medium text-[#aa5a3d]">{v.genre}</p><h3 className="mt-1 line-clamp-2 min-h-[56px] text-xl font-semibold tracking-tight">{v.name}</h3><div className="mt-3 flex items-start justify-between gap-3 text-sm"><span className="font-semibold">{v.budgetLabel}</span><span className="line-clamp-2 text-right text-xs text-[#67726f]">{v.access}</span></div><p className="mt-4 min-h-[72px] text-sm leading-6 text-[#687370]">{v.reason}</p><div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f7f5ef] p-3"><ScorePart label="条件との一致" value={v.breakdown.fit}/><ScorePart label="予算" value={v.breakdown.budget}/><ScorePart label="利用しやすさ" value={v.breakdown.convenience}/></div><div className="mt-4 flex flex-wrap gap-2">{[v.privateRoom&&"個室あり",v.freeDrink&&"飲み放題",v.course&&"コースあり",v.partyCapacity&&`宴会最大${v.partyCapacity}名`].filter(Boolean).map(tag=><span key={String(tag)} className="rounded-full bg-[#f3f0e8] px-2.5 py-1 text-xs text-[#58625f]">{tag}</span>)}</div><div className="mt-5 flex items-center justify-between border-t border-[#1e2928]/8 pt-4"><span className="flex items-center gap-1.5 text-xs font-medium text-[#2f6b57]"><CircleCheck className="size-4"/>空席は店舗へ確認</span>{selected===i&&<span className="text-xs font-semibold text-[#1f4b46]">選択中</span>}</div></div>
            </button>)}
          </div>}
          <AgentInsight status={agentStatus} plan={agentPlan} error={agentError}/>
          {searched&&<div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#687370]"><span>{providerTotal.toLocaleString()}件から条件の近い店舗を表示</span><a href="https://www.hotpepper.jp/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1f4b46] underline-offset-4 hover:underline">店舗情報提供：ホットペッパー グルメ</a></div>}
          {chosen&&<><div className="mt-5 grid gap-5 rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-sm sm:p-6 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-semibold tracking-[.1em] text-[#aa5a3d]">場所を確認</p><h3 className="mt-1 text-xl font-semibold">{chosen.name}</h3><p className="mt-4 text-sm leading-6 text-[#687370]">{chosen.address}</p><p className="mt-2 text-sm leading-6 text-[#687370]">{chosen.access}</p><div className="mt-4"><MapLinks address={chosen.address}/></div><a href={chosen.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#1f4b46] underline-offset-4 hover:underline">店舗ページで詳細・空席を確認<ExternalLink className="size-4"/></a></div><VenueMap address={chosen.address} label={chosen.name}/></div>
          <CreateGroup title={`${query.purpose}のグループ`} initial={{venueName:chosen.name,address:chosen.address,date:eventDate,time:eventTime,people:query.people,price:chosen.estimatedPrice||query.budget,status:"planning",bookingReference:"",note:"",website:chosen.url}}/>
          <div className="mt-5 grid gap-4 rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-sm sm:p-6 xl:grid-cols-[1.1fr_.9fr_auto] xl:items-center"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-[#e8eee9] text-[#1f4b46]"><Users className="size-4"/></span><div><p className="text-sm font-semibold">プランを確定して共有</p><p className="text-xs text-[#7b8381]">参加者用グループとカレンダー予定をまとめて準備できます</p></div></div><div className="grid grid-cols-3 gap-3 text-center"><MiniStat label="参加予定" value={`${query.people}名`}/><MiniStat label="予算目安" value={chosen.budgetLabel}/><MiniStat label="候補順位" value={`${selected+1}位`}/></div><Button onClick={()=>setApprovalOpen(true)} className="h-12 rounded-xl bg-[#1f4b46] px-6 text-white hover:bg-[#163d39]">予定を確認する<ArrowRight className="ml-2 size-4"/></Button></div></>}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-4 overflow-hidden rounded-[24px] border border-[#1e2928]/10 bg-[#1f4b46] p-5 text-white shadow-[0_16px_40px_rgba(30,41,40,.12)]">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#d9c9a7]">PLAN SHARE</p><h2 className="mt-1 text-xl font-semibold">みんなにプランを共有</h2></div><span className="grid size-10 place-items-center rounded-full bg-white/10"><Share2 className="size-5"/></span></div>
          <div className="mt-4 rounded-2xl bg-white/[.08] p-4"><p className="text-xs text-white/55">選択中のプラン</p><p className="mt-1 text-lg font-semibold">{chosen?.name||"店舗を検索してください"}</p><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-4"><span className="text-white/55">日時</span><span className="text-right">{eventDate.slice(5).replace("-","/")} {eventTime}</span></div><div className="flex justify-between gap-4"><span className="text-white/55">人数</span><span>{query.people}名</span></div><div className="flex justify-between gap-4"><span className="text-white/55">予算</span><span className="max-w-[180px] truncate text-right">{chosen?.budgetLabel||`${query.budget.toLocaleString()}円 / 人`}</span></div><div className="flex justify-between gap-4"><span className="text-white/55">場所</span><span className="max-w-[180px] truncate text-right">{chosen?.address||query.area}</span></div></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><Button disabled={!chosen} onClick={()=>void sharePlan()} className="rounded-xl bg-[#e17a4e] text-white hover:bg-[#ee8a5e]"><Share2 className="mr-2 size-4"/>共有する</Button><Button disabled={!chosen} onClick={()=>void copyPlan()} variant="outline" className="rounded-xl border-white/15 bg-white/[.06] text-white hover:bg-white/15 hover:text-white"><Copy className="mr-2 size-4"/>コピー</Button></div>
          {shareStatus&&<p role="status" className="mt-3 text-xs leading-5 text-white/70">{shareStatus}</p>}
          <Button disabled={candidates.length<2} onClick={()=>{setFailover(true);setSelected(0);setStage("ranked");addAudit("次の候補へ変更","現在の条件を保ったまま候補を切り替えました")}} variant="ghost" className="mt-3 w-full rounded-xl text-white/75 hover:bg-white/10 hover:text-white"><RefreshCw className="mr-2 size-4"/>満席なら次の候補へ</Button>
        </div>
        <div className="rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-[0_16px_40px_rgba(30,41,40,.07)]"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#a85b40]">進行状況</p><h2 className="mt-1 text-xl font-semibold">この会の準備</h2></div><span className="text-2xl font-semibold text-[#1f4b46]">{progress}%</span></div><Progress value={progress} className="mt-4 h-2 bg-[#e9e8e1] [&>div]:bg-[#df764a]"/><div className="mt-6 space-y-1"><StatusRow icon={WalletCards} title="目的・予算" detail={`${query.purpose}・${query.budget.toLocaleString()}円`} done/><StatusRow icon={MapPin} title="会場候補" detail={candidates.length?`${query.area}・${candidates.length}件`:"店舗を検索してください"} done={stageIndex>1&&candidates.length>0} active={stageIndex===1}/><StatusRow icon={Users} title="参加者確認" detail={stageIndex<2?"リンク未送信":stageIndex===2?"回答を収集中":"回答完了"} done={stageIndex>2} active={stageIndex===2}/><StatusRow icon={CalendarDays} title="予約と予定" detail={stage==="scheduled"?"カレンダーへ追加済み":"内容を確認して確定"} done={stage==="scheduled"} active={stage==="awaiting_approval"}/></div><div className="mt-6 rounded-2xl bg-[#f3f0e8] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-[#2f6b57]"/>プライバシー</div><p className="mt-2 text-xs leading-5 text-[#6d7572]">アレルギーの詳細は本人と幹事だけが確認できます。参加者全員には表示されません。</p></div></div>
        <div className="mt-4 rounded-[24px] border border-[#1e2928]/10 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#a85b40]">最近の更新</p><h2 className="mt-1 text-lg font-semibold">プランの履歴</h2></div><Badge variant="outline" className="bg-[#f7f5ef]">この端末</Badge></div><div className="mt-4 space-y-3">{audit.slice(0,4).map((item,index)=><div key={item.id} className="flex gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${index===0?"bg-[#e17a4e]":"bg-[#c7cbc7]"}`}/><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-0.5 text-xs leading-5 text-[#77807e]">{item.detail}</p></div></div>)}</div></div>
      </aside>
    </section>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] bg-[#fbfaf6] sm:max-w-[560px]"><DialogHeader><DialogTitle className="font-serif text-2xl">プランの詳細設定</DialogTitle><DialogDescription>日時や候補選びの優先条件を変更できます。</DialogDescription></DialogHeader><div className="space-y-5 py-2"><div className="grid grid-cols-2 gap-3"><div><Label className="mb-2 block">開催日</Label><Input type="date" value={draftEventDate} onChange={e=>setDraftEventDate(e.target.value)} className="h-11 bg-white"/></div><div><Label className="mb-2 block">開始時刻</Label><Input type="time" value={draftEventTime} onChange={e=>setDraftEventTime(e.target.value)} className="h-11 bg-white"/></div></div><div><Label className="mb-2 block">候補選びで優先すること</Label><Select value={draftPriority} onValueChange={v=>setDraftPriority(v as Priority)}><SelectTrigger className="h-11 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="balance">バランス</SelectItem><SelectItem value="conversation">会話しやすさ</SelectItem><SelectItem value="cost">予算の収まり</SelectItem><SelectItem value="access">アクセス情報</SelectItem></SelectContent></Select></div><SettingSwitch label="個室・半個室を優先" description="会話のしやすさを候補選びに加えます" checked={draftPrivateRoom} onCheckedChange={setDraftPrivateRoom}/><SettingSwitch label="食事制限の確認を追加" description="候補ごとに、予約前の店舗確認を案内します" checked={draftDietary} onCheckedChange={setDraftDietary}/><button type="button" onClick={()=>{setSettingsOpen(false);setAllergyOpen(true)}} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-[#1e2928]/10 bg-white px-4 text-left"><div><p className="text-sm font-semibold">食物アレルギー</p><p className="mt-1 text-xs text-[#77807e]">{hasAllergy?`${allergy.items.join("、")}を確認`:allergy.status==="none"?"なし":"未設定"}</p></div><ChevronRight className="size-4 text-[#77807e]"/></button></div><DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>変更しない</Button><Button onClick={applySettings} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">保存して候補を更新</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={allergyOpen} onOpenChange={setAllergyOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] bg-[#fbfaf6] sm:max-w-[680px]"><DialogHeader><DialogTitle className="font-serif text-2xl">アレルギーを設定</DialogTitle><DialogDescription>確認が必要な食材を選ぶと、プランと店舗への確認事項に反映されます。</DialogDescription></DialogHeader><div className="py-2"><AllergyPicker value={allergy} onChange={setAllergy} privateSharing={false}/></div><DialogFooter><Button onClick={()=>{setAllergyOpen(false);if(allergy.status==="selected")setDietary(true)}} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">設定を保存</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] border-0 bg-[#fbfaf6] p-0 sm:max-w-[600px]"><DialogHeader className="border-b border-[#1e2928]/10 p-6 text-left"><DialogTitle className="font-serif text-2xl">プランの最終確認</DialogTitle><DialogDescription>参加者へ共有する前に、日時・費用・確認事項をご確認ください。</DialogDescription></DialogHeader><div className="space-y-4 px-6"><div className="rounded-2xl border border-[#1e2928]/10 bg-white p-4"><p className="text-xs text-[#7a8380]">選択中の会場</p><p className="mt-1 text-lg font-semibold">{chosen?.name}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><span className="text-[#68716f]">開催予定</span><span className="text-right font-medium">{eventDate} {eventTime}</span><span className="text-[#68716f]">予算目安</span><span className="text-right font-medium">{chosen?.budgetLabel||"店舗へ確認"}</span><span className="text-[#68716f]">定休日</span><span className="text-right font-medium">{chosen?.closed||"店舗ページで確認"}</span></div></div><div className="grid gap-3 sm:grid-cols-3"><CheckCard icon={Clock3} title="日程" value="開催日時を確認"/><CheckCard icon={UtensilsCrossed} title="食事" value={hasAllergy?`${allergy.items.length}項目を店舗へ確認`:"特記事項なし"}/><CheckCard icon={Users} title="参加者" value={`${query.people}名で共有`}/></div>{stage==="scheduled"?<div className="rounded-2xl bg-[#e8f0ea] p-4 text-sm text-[#24533f]"><div className="flex items-center gap-2 font-semibold"><CircleCheck className="size-5"/>カレンダー用ファイルを作成しました</div><p className="mt-1 pl-7 text-xs leading-5">端末のカレンダーへ追加できます。店舗への予約状況はグループで共有してください。</p></div>:completed?<div className="rounded-2xl bg-[#e8f0ea] p-4 text-sm text-[#24533f]"><div className="flex items-center gap-2 font-semibold"><CircleCheck className="size-5"/>{stage==="awaiting_approval"?"回答が揃い、最終確認待ちです":"参加者へ確認中です"}</div><p className="mt-1 pl-7 text-xs leading-5">出欠と希望条件をまとめて確認できます。</p></div>:<div className="rounded-2xl bg-[#f4eee2] p-4 text-xs leading-5 text-[#75643f]">確定前に参加者へプランを共有し、出欠と食事に関する希望を確認しましょう。</div>}</div><DialogFooter className="p-6 pt-2 sm:justify-between"><Button variant="outline" onClick={()=>setApprovalOpen(false)}>候補を見直す</Button><Button onClick={advanceWorkflow} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">{stage==="scheduled"?<><Download className="mr-2 size-4"/>予定を再取得</>:stage==="awaiting_approval"?"プランを確定して予定作成":stage==="collecting"?"回答内容を確認":"参加者へ確認する"}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="mb-2 block text-[12px] font-semibold text-white/65">{label}</Label>{children}</div>}
function MiniStat({label,value}:{label:string;value:string}){return <div><p className="text-[11px] text-[#838a88]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>}
function StatusRow({icon:Icon,title,detail,done,active}:{icon:React.ElementType;title:string;detail:string;done?:boolean;active?:boolean}){return <div className={`flex items-center gap-3 rounded-xl p-3 ${active?"bg-[#eef2ed]":""}`}><span className={`grid size-9 place-items-center rounded-xl ${done?"bg-[#dfeae2] text-[#2f6b57]":active?"bg-[#1f4b46] text-white":"bg-[#f1f0eb] text-[#8a918f]"}`}>{done?<Check className="size-4"/>:<Icon className="size-4"/>}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="truncate text-xs text-[#7a8380]">{detail}</p></div>{active&&<span className="size-2 rounded-full bg-[#df764a]"/>}</div>}
function CheckCard({icon:Icon,title,value}:{icon:React.ElementType;title:string;value:string}){return <div className="rounded-2xl border border-[#1e2928]/10 bg-white p-3"><Icon className="size-4 text-[#1f4b46]"/><p className="mt-3 text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-4 text-[#77807e]">{value}</p></div>}
function SettingSwitch({label,description,checked,onCheckedChange}:{label:string;description:string;checked:boolean;onCheckedChange:(v:boolean)=>void}){return <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#1e2928]/10 bg-white p-4"><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-[#77807e]">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange}/></div>}
function ScorePart({label,value}:{label:string;value:number}){return <div className="text-center"><p className="text-[10px] text-[#7b8381]">{label}</p><p className="mt-1 text-sm font-bold text-[#1f4b46]">{value}</p></div>}
function escapeIcs(value:string){return value.replace(/\\/g,"\\\\").replace(/,/g,"\\,").replace(/;/g,"\\;").replace(/\n/g,"\\n")}
