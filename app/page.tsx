"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CreateGroup } from "@/components/encopa/create-group";
import { AllergyPicker } from "@/components/encopa/allergy-picker";
import { AgentInsight } from "@/components/encopa/agent-insight";
import { MapLinks, VenueMap } from "@/components/encopa/maps";
import { ALLERGENS, EMPTY_ALLERGY, type AllergyProfile } from "@/lib/group-types";
import { composeMessage } from "@/lib/message-draft";
import type { AgentPlan, AgentPlanResponse } from "@/lib/agent-types";
import type { VenueSearchResponse, VenueSearchResult } from "@/lib/venue-types";
import { PREFECTURE_REGIONS, prefectureByCode, prefectureFromLabel } from "@/lib/prefectures";
import {
  ArrowRight, CalendarDays, Check, ChevronRight, CircleCheck, Clock3, Copy, Download, ExternalLink,
  History, Home as HomeIcon, Lightbulb, MapPin, MessageCircle, RefreshCw, Search, Settings2, Share2, ShieldCheck,
  Sparkles, Users, UtensilsCrossed, WalletCards,
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
type Query = { purpose:string; area:string; prefectureCode:string; budget:number; people:number; priority:Priority; privateRoom:boolean; dietary:boolean };
type Stage = "draft" | "ranked" | "collecting" | "awaiting_approval" | "scheduled";
type View = "home" | "venues" | "participants" | "suggestions" | "history";
const STAGES: readonly string[] = ["draft","ranked","collecting","awaiting_approval","scheduled"];
type AuditEvent = { id:string; label:string; detail:string; at:number };

const steps = [["条件","完了"],["候補比較","いまここ"],["みんなに確認","次"],["幹事が承認",""],["予約・予定確保",""]];
const stageCopy: Record<Stage,string> = { draft:"条件を入力中", ranked:"候補を比較中", collecting:"回答を受付中", awaiting_approval:"最終確認待ち", scheduled:"予定を作成済み" };
const priorityLabels: Record<Priority,string> = { balance:"バランス", conversation:"会話しやすさ", cost:"予算", access:"移動しやすさ" };
const navItems: {view:View;label:string;icon:React.ElementType}[] = [
  {view:"home",label:"ホーム",icon:HomeIcon},
  {view:"venues",label:"会場候補",icon:Search},
  {view:"participants",label:"参加者",icon:Users},
  {view:"suggestions",label:"提案",icon:Lightbulb},
  {view:"history",label:"履歴",icon:History},
];

export default function Home() {
  const [allergy,setAllergy]=useState<AllergyProfile>(EMPTY_ALLERGY);
  const [searchError,setSearchError]=useState("");
  const [purpose,setPurpose]=useState("忘年会");
  const [area,setArea]=useState("長崎県");
  const [prefectureCode,setPrefectureCode]=useState("Z093");
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
  const [query,setQuery]=useState<Query>({purpose:"忘年会",area:"長崎県",prefectureCode:"Z093",budget:5500,people:18,priority:"balance",privateRoom:true,dietary:true});
  const [searched,setSearched]=useState(false);
  const [searching,setSearching]=useState(false);
  const [venues,setVenues]=useState<VenueSearchResult[]>([]);
  const [agentStatus,setAgentStatus]=useState<"idle"|"running"|"ready"|"error">("idle");
  const [agentPlan,setAgentPlan]=useState<AgentPlan|null>(null);
  const [agentError,setAgentError]=useState("");
  const [providerTotal,setProviderTotal]=useState(0);
  const [fetchedAt,setFetchedAt]=useState(0);
  const [stale,setStale]=useState(false);
  const [selected,setSelected]=useState(0);
  const [picked,setPicked]=useState(false);
  const [approvalOpen,setApprovalOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [allergyOpen,setAllergyOpen]=useState(false);
  const [locationOpen,setLocationOpen]=useState(false);
  const [shareStatus,setShareStatus]=useState("");
  const [completed,setCompleted]=useState(false);
  const [failover,setFailover]=useState(false);
  const [stage,setStage]=useState<Stage>("draft");
  const [activeView,setActiveView]=useState<View>("home");
  const [audit,setAudit]=useState<AuditEvent[]>([{id:"init",label:"会を作成",detail:"外部操作はまだ行っていません",at:0}]);
  const [restored,setRestored]=useState(false);

  const total=Number(budget||0)*Number(people||0);
  const hasAllergy=allergy.status==="selected"&&allergy.items.length>0;
  const candidates=useMemo(()=>failover&&venues.length>1?[...venues.slice(1),venues[0]]:venues,[venues,failover]);
  const chosen=candidates[Math.min(selected,candidates.length-1)] ?? candidates[0];
  const stageIndex={draft:0,ranked:1,collecting:2,awaiting_approval:3,scheduled:4}[stage];
  const progress=[15,40,62,82,100][stageIndex];
  const addAudit=(label:string,detail:string)=>setAudit(current=>[{id:crypto.randomUUID(),label,detail,at:Date.now()},...current].slice(0,8));
  const navigate=(view:View,replace=false)=>{
    setActiveView(view);
    const url=view==="home"?window.location.pathname:`${window.location.pathname}?view=${view}`;
    window.history[replace?"replaceState":"pushState"]({},"",url);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const search = async (override?:Partial<Query>) => {
    const next:Query={
      purpose, area, prefectureCode, budget:Math.max(1000,Number(budget)||5500),
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
      setVenues(nextVenues);setProviderTotal(Number(data.total||nextVenues.length));setFetchedAt(Number(data.fetchedAt||Date.now()));setStale(data.stale===true);
      if(!nextVenues.length)setSearchError("条件に合う店舗が見つかりませんでした。人数や予算、個室条件を変えてお試しください。");
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
      setSearching(false); setSearched(true); setStage("ranked"); setPicked(false);
      navigate("venues");
    }
  };

  const applySettings=()=>{
    setPriority(draftPriority); setPrivateRoom(draftPrivateRoom); setDietary(draftDietary); setEventDate(draftEventDate); setEventTime(draftEventTime);
    setSettingsOpen(false);
    void search({priority:draftPriority,privateRoom:draftPrivateRoom,dietary:draftDietary});
  };

  const downloadCalendar=()=>{
    const start=new Date(`${eventDate}T${eventTime}:00+09:00`);
    if(Number.isNaN(start.getTime())){
      setSearchError("開催日と開始時刻を入力すると、予定ファイルを作成できます。");
      return false;
    }
    const end=new Date(start.getTime()+2*60*60*1000);
    const stamp=(date:Date)=>date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
    const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ENCOPA//JA","BEGIN:VEVENT",`UID:${crypto.randomUUID()}@encopa`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${escapeIcs(query.purpose)}｜${escapeIcs(chosen?.name??"会場未定")}`,`LOCATION:${escapeIcs(chosen?.address??query.area)}`,`URL:${escapeIcs(chosen?.url??"")}`,`DESCRIPTION:${escapeIcs(`ENCOPAで調整。参加予定 ${query.people}名。予約状況は主催者に確認してください。`)}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    const url=URL.createObjectURL(new Blob([ics],{type:"text/calendar;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="encopa-event.ics";link.click();URL.revokeObjectURL(url);
    return true;
  };

  const announcement=useMemo(()=>composeMessage("announce",{
    title:`${query.purpose} ${eventDate.slice(0,4)}`,
    reservation:{venueName:chosen?.name??"",address:chosen?.address??"",date:eventDate,time:eventTime,people:query.people,price:chosen?.estimatedPrice||query.budget,status:"planning",bookingReference:"",note:"",website:chosen?.url??""},
  }),[query.purpose,query.people,query.budget,eventDate,eventTime,chosen]);
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

  const copyText=async(text:string,done:string)=>{
    try{await navigator.clipboard.writeText(text);setShareStatus(done)}
    catch{setShareStatus("コピーできませんでした。文面を選択してコピーしてください。")}
  };
  const copyPlan=async()=>{
    try{await navigator.clipboard.writeText(`${planText()}\n${location.href}`);setShareStatus("共有用テキストをコピーしました");}
    catch{setShareStatus("コピーできませんでした。ブラウザの権限をご確認ください。");}
  };

  const advanceWorkflow=()=>{
    if(stage==="scheduled"){downloadCalendar();return}
    if(stage==="collecting"){setStage("awaiting_approval");addAudit("参加者の回答を確認","出欠と希望条件をまとめました");return}
    if(stage==="awaiting_approval"){if(!downloadCalendar())return;setStage("scheduled");addAudit("幹事が最終承認","予定ファイルを作成。外部予約は未実行");return}
    setCompleted(true);setStage("collecting");addAudit("参加者確認を開始","共有リンクから回答を受け付けます");
  };

  useEffect(()=>{
    const syncView=()=>{
      const value=new URLSearchParams(window.location.search).get("view");
      const next=navItems.some(item=>item.view===value)?value as View:"home";
      setActiveView(next);
    };
    syncView();
    window.addEventListener("popstate",syncView);
    return()=>window.removeEventListener("popstate",syncView);
  },[]);

  useEffect(()=>{
    try {
      const saved=localStorage.getItem("encopa-session-v2");
      if(saved){
        const value=JSON.parse(saved);
        // Restore the browser-owned draft once after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if(value.query){const restoredPrefecture=prefectureByCode(value.query.prefectureCode)||prefectureFromLabel(value.query.area)||prefectureByCode("Z093")!;const restoredQuery={...value.query,area:restoredPrefecture.name,prefectureCode:restoredPrefecture.code};setQuery(restoredQuery);setPurpose(restoredQuery.purpose);setArea(restoredPrefecture.name);setPrefectureCode(restoredPrefecture.code);setBudget(String(restoredQuery.budget));setPeople(String(restoredQuery.people));setPriority(restoredQuery.priority);setPrivateRoom(restoredQuery.privateRoom);setDietary(restoredQuery.dietary)}
        if(Array.isArray(value.venues)&&Date.now()-Number(value.fetchedAt)<23*60*60*1000){setVenues(value.venues);setFetchedAt(Number(value.fetchedAt));setProviderTotal(Number(value.providerTotal||value.venues.length));setSearched(true)}
        if(STAGES.includes(value.stage)){setStage(value.stage);setCompleted(value.stage==="collecting"||value.stage==="awaiting_approval"||value.stage==="scheduled")}
        const audit=Array.isArray(value.audit)?value.audit.filter((e:unknown)=>!!e&&typeof e==="object"&&["id","label","detail"].every(k=>typeof (e as Record<string,unknown>)[k]==="string")).map((e:Record<string,unknown>)=>({...e,at:Number.isFinite(e.at)?Number(e.at):0})).slice(0,8):[];
        if(audit.length)setAudit(audit as AuditEvent[]);
        if(isCalendarDate(value.eventDate))setEventDate(value.eventDate);
        if(typeof value.eventTime==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value.eventTime))setEventTime(value.eventTime);
        const allergy=restoredAllergy(value.allergy);
        if(allergy)setAllergy(allergy);
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
        execute:async(input:unknown)=>{const v=input as {purpose:string;area:string;budget:number;people:number};const nextPrefecture=prefectureFromLabel(v.area);if(!nextPrefecture)throw new Error("47都道府県のいずれかを指定してください。");setPurpose(v.purpose);setArea(nextPrefecture.name);setPrefectureCode(nextPrefecture.code);setBudget(String(v.budget));setPeople(String(v.people));await search({...v,area:nextPrefecture.name,prefectureCode:nextPrefecture.code});return{status:"ranked",reservation_created:false}}
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

  return <main className="min-h-screen bg-[#f7f5ef] text-[#182523]">

    <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-white/10 bg-[#202322] px-4 py-5 text-white lg:flex lg:flex-col">
        <button type="button" onClick={()=>navigate("home")} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left"><span className="grid size-10 place-items-center rounded-[14px] bg-[#df7549] text-white"><UtensilsCrossed className="size-[18px]"/></span><div><p className="text-lg font-black tracking-[.12em]">ENCOPA</p><p className="text-[11px] text-white/55">集まるって、楽しい。</p></div></button>
        <nav className="mt-8 space-y-1" aria-label="メインナビゲーション">{navItems.map(item=>{const Icon=item.icon;const active=activeView===item.view;return <button key={item.view} type="button" aria-current={active?"page":undefined} onClick={()=>navigate(item.view)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active?"bg-[#df5542] text-white shadow-lg":"text-white/70 hover:bg-white/8 hover:text-white"}`}><Icon className="size-[18px]"/>{item.label}</button>})}</nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="jp-text text-sm font-semibold text-[#f3c765]">いい宴を、いいチームで。</p><p className="jp-text mt-2 text-xs leading-5 text-white/55">候補比較から参加者への共有まで、ひとつの流れで進められます。</p></div>
      </aside>
      <div className="min-w-0 pb-24 lg:pb-0">
    <section className={`mx-auto grid max-w-[1400px] gap-6 px-4 py-5 sm:px-7 lg:px-8 lg:py-7 ${(activeView==="home"||activeView==="venues")?"lg:grid-cols-[minmax(0,1fr)_320px]":""}`}>
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 lg:hidden"><span className="grid size-9 place-items-center rounded-[12px] bg-[#173f3a] text-[#fffdf7]"><UtensilsCrossed className="size-4"/></span><span className="text-[17px] font-black tracking-[.1em]">ENCOPA</span></div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={()=>{setDraftPriority(priority);setDraftPrivateRoom(privateRoom);setDraftDietary(dietary);setDraftEventDate(eventDate);setDraftEventTime(eventTime);setSettingsOpen(true)}} variant="outline" className="h-9 rounded-full border-[#1e2928]/15 bg-white px-4"><Settings2 className="mr-2 size-4"/>詳細設定</Button>
          </div>
        </div>
        {(activeView==="home"||activeView==="venues")&&<div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" aria-label="プラン作成の進行状況">
          {steps.map(([label],i)=><div key={label} className="flex shrink-0 items-center gap-1.5"><div className={`flex min-h-9 items-center gap-2 rounded-full px-3 text-[13px] font-semibold ${i===stageIndex?"bg-[#173f3a] text-white shadow-sm":i<stageIndex?"bg-[#e4eee9] text-[#24564d]":"bg-white text-[#77807e] ring-1 ring-[#182523]/8"}`}>{i<stageIndex?<Check className="size-3.5"/>:<span className="grid size-5 place-items-center rounded-full bg-current/10 text-[11px]">{i+1}</span>}{label}</div>{i<steps.length-1&&<ChevronRight className="size-3.5 text-[#adb1ac]"/>}</div>)}
        </div>}

        {(activeView==="home"||activeView==="venues")&&<div className="overflow-hidden rounded-[26px] border border-[#182523]/9 bg-white shadow-[0_14px_40px_rgba(24,37,35,.07)]">
          <div className="grid gap-6 bg-[radial-gradient(circle_at_88%_0%,rgba(225,122,78,.13),transparent_20rem)] p-5 sm:p-7 2xl:grid-cols-[minmax(0,1fr)_270px] 2xl:p-8">
            <div className="self-center"><div className="mb-3 flex items-center gap-2 text-[#b55c38]"><Sparkles className="size-4"/><span className="text-[13px] font-semibold tracking-[.08em]">集まる日の準備を、ひとつに</span></div><h1 className="jp-text max-w-[700px] font-serif text-[clamp(1.6rem,2.4vw,3rem)] leading-[1.15] tracking-[-.04em] text-[#182523]">みんなが集まりやすい店を、<br className="hidden xl:block"/>迷わず決める。</h1><p className="jp-text mt-3 max-w-2xl text-base leading-7 text-[#65716e]">条件に合う実店舗を比べて、予約内容やアレルギー確認までひとつのプランにまとめます。</p></div>
            <div className="rounded-[22px] border border-[#182523]/8 bg-[#f7f5ef] p-5 text-[#182523]"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-medium text-[#65716e]">今回の予算目安</p><p className="mt-1 text-3xl font-semibold tracking-tight">{total.toLocaleString()}<span className="ml-1 text-base font-medium text-[#65716e]">円</span></p></div><WalletCards className="size-5 text-[#b55c38]"/></div><div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,88px),1fr))] gap-2 border-t border-[#182523]/8 pt-4 text-center"><LightPlanFact label="開催" value={`${eventDate.slice(5).replace("-","/")} ${eventTime}`}/><LightPlanFact label="優先" value={priorityLabels[priority]}/><LightPlanFact label="食事" value={hasAllergy?`${allergy.items.length}項目`:allergy.status==="none"?"指定なし":"未設定"}/></div></div>
          </div>
          <div id="conditions" data-row="conditions" className="grid scroll-mt-24 items-end gap-3 border-t border-[#182523]/8 bg-white p-4 sm:p-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
            <Field label="目的"><Select value={purpose} onValueChange={setPurpose}><SelectTrigger className="h-12 w-full rounded-[14px] border-[#173f3a]/12 bg-white text-[#182523] shadow-sm data-[size=default]:h-12"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="忘年会">忘年会</SelectItem><SelectItem value="新年会">新年会</SelectItem><SelectItem value="歓迎会">歓迎会</SelectItem><SelectItem value="送別会">送別会</SelectItem><SelectItem value="懇親会">懇親会</SelectItem><SelectItem value="打ち上げ">打ち上げ</SelectItem></SelectContent></Select></Field>
            <Field label="場所"><button type="button" onClick={()=>setLocationOpen(true)} className="flex h-12 w-full items-center justify-between rounded-[14px] border border-[#173f3a]/12 bg-white px-3 text-left text-[#182523] shadow-sm transition hover:border-[#47766f]/50 hover:bg-[#fafbf8]"><span className="flex min-w-0 items-center gap-2"><MapPin className="size-4 shrink-0 text-[#47766f]"/><span className="truncate text-base font-semibold" title={area}>{area}</span></span><ChevronRight className="size-4 shrink-0 text-[#7d8986]"/></button></Field>
            <Field label="予算 / 人"><div className="relative"><Input aria-label="1人あたりの予算" autoComplete="off" inputMode="numeric" value={budget} onChange={e=>setBudget(e.target.value.replace(/\D/g,""))} className="h-12 rounded-[14px] border-[#173f3a]/12 bg-white pr-9 text-base shadow-sm"/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#65716e]">円</span></div></Field>
            <Field label="人数"><div className="relative"><Input aria-label="参加人数" autoComplete="off" inputMode="numeric" value={people} onChange={e=>setPeople(e.target.value.replace(/\D/g,""))} className="h-12 rounded-[14px] border-[#173f3a]/12 bg-white pr-9 text-base shadow-sm"/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#65716e]">名</span></div></Field>
            <Field label="アレルギー"><button type="button" onClick={()=>setAllergyOpen(true)} className="flex h-12 w-full items-center justify-between rounded-[14px] border border-[#173f3a]/12 bg-white px-3 text-left text-sm font-semibold text-[#182523] shadow-sm transition hover:border-[#47766f]/50 hover:bg-[#fafbf8]"><span className="truncate">{hasAllergy?`${allergy.items.length}項目を設定`:allergy.status==="none"?"指定なし":"設定する"}</span><ChevronRight className="size-4 text-[#7d8986]"/></button></Field>
            <div className="flex items-end"><Button disabled={searching} onClick={()=>void search()} className="h-12 w-full rounded-[14px] bg-[#df7549] px-6 text-base font-bold text-white shadow-[0_10px_22px_rgba(197,89,48,.24)] hover:bg-[#c96139]">{searching?<RefreshCw className="mr-2 size-4 animate-spin"/>:<Search className="mr-2 size-4"/>}{searching?"検索中":"お店を探す"}</Button></div>
          </div>
        </div>}

        {activeView==="venues"&&<section id="results" className="scroll-mt-24 pt-9">
          {searchError&&<p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700 shadow-sm">{searchError}</p>}
          {allergy.status==='selected'&&<p className="mb-4 rounded-2xl border border-[#d9cdb5] bg-[#f2eadb] p-4 text-sm leading-6"><span className="font-semibold">店舗へ確認する食材：</span>{allergy.items.join('、')||'選択してください'}。予約前に、調理時の混入を含めて店舗へご確認ください。</p>}
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div className="min-w-0 shrink-0"><p className="text-[12px] font-semibold tracking-[.12em] text-[#aa5a3d]">RESTAURANTS · {query.area}</p><h2 className="jp-text mt-1 font-serif text-[clamp(1.4rem,2vw,1.9rem)] font-semibold tracking-tight">{searched?candidates.length?`${query.purpose}に合う実店舗 ${candidates.length}件`:"検索結果":"条件を入力して実店舗を検索"}</h2></div><p className="jp-text min-w-0 max-w-md text-sm leading-6 text-[#6e7774]">予算、人数、個室などの条件から実在する店舗を比較します。空席とアレルギー対応は予約前に店舗へ確認してください。</p></div>
          {!searched&&<div className="grid min-h-56 place-items-center rounded-[26px] border border-[#182523]/8 bg-white px-6 text-center shadow-[0_12px_36px_rgba(24,37,35,.05)]"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e6efea] text-[#173f3a]"><Search className="size-5"/></span><p className="mt-4 text-lg font-semibold">条件を選ぶと、お店を比較できます</p><p className="mt-2 text-sm leading-6 text-[#65716e]">全国47都道府県の実店舗から、予算や人数に合う候補を探します</p></div></div>}
          {failover&&candidates.length>1&&<div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#d78a66]/30 bg-[#fff3eb] p-4 text-sm text-[#7c4631]"><RefreshCw className="mt-0.5 size-4 shrink-0"/><div><p className="font-semibold">次の候補を先頭に表示しました</p><p className="mt-1 text-xs">検索条件は変えずに、別の店舗を比較できます。</p></div></div>}
          {candidates.length>0&&<div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
            {candidates.map((v,i)=><button key={v.id} aria-pressed={selected===i} onClick={()=>{setSelected(i);setPicked(true);setCompleted(false);setStage("ranked")}} className={`group overflow-hidden rounded-[24px] border bg-white text-left transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(24,37,35,.11)] ${selected===i?"border-[#173f3a] shadow-[0_16px_40px_rgba(23,63,58,.12)] ring-2 ring-[#173f3a]/10":"border-[#182523]/8 shadow-[0_8px_24px_rgba(24,37,35,.05)]"}`}>
              <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#436d72] to-[#264f57] text-white">{v.photoUrl&&<Image src={v.photoUrl} alt="" fill sizes="(min-width:1536px) 25vw, (min-width:768px) 40vw, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.04]"/>}<div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-black/10"/><div className="absolute inset-x-0 top-0 flex items-start justify-between p-4"><Badge className={`${i===0?"bg-[#df7549]":"bg-black/40"} border-white/15 text-white shadow-sm`}>{i===0?"おすすめ":`候補 ${i+1}`}</Badge><div className="rounded-full bg-white px-3 py-1.5 text-[#173f3a] shadow-lg"><span className="text-base font-black">{v.score}</span><span className="ml-0.5 text-[10px] font-semibold text-[#65716e]">/100</span></div></div>{selected===i&&<span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#173f3a] shadow-lg"><Check className="size-3.5"/>選択中</span>}</div>
              <div className="p-5"><p className="text-xs font-bold tracking-wide text-[#b55c38]">{v.genre}</p><h3 className="mt-1 line-clamp-2 min-h-[56px] text-xl font-bold tracking-tight">{v.name}</h3><div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><span className="whitespace-nowrap font-bold text-[#173f3a]">{v.budgetLabel}</span><span className="jp-text line-clamp-2 min-w-0 text-xs leading-5 text-[#65716e]">{v.access}</span></div><p className="mt-4 min-h-[72px] text-sm leading-6 text-[#65716e]">{v.reason}</p><div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#f5f3ed] p-3"><ScorePart label="条件" value={v.breakdown.fit}/><ScorePart label="予算" value={v.breakdown.budget}/><ScorePart label="利便" value={v.breakdown.convenience}/></div><div className="mt-4 flex flex-wrap gap-2">{[v.privateRoom&&"個室あり",v.freeDrink&&"飲み放題",v.course&&"コースあり",v.partyCapacity&&`最大${v.partyCapacity}名`].filter(Boolean).map(tag=><span key={String(tag)} className="rounded-full border border-[#173f3a]/8 bg-[#edf3ef] px-2.5 py-1 text-xs font-medium text-[#3f5f58]">{tag}</span>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#182523]/8 pt-4"><span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[#2f6b57]"><CircleCheck className="size-4 shrink-0"/>空席は店舗へ確認</span><span className="whitespace-nowrap text-xs font-semibold text-[#77807e]">詳細を見る</span></div></div>
            </button>)}
          </div>}
          <AgentInsight status={agentStatus} plan={agentPlan} error={agentError}/>
          {stale&&<div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-[#d9cdb5] bg-[#f2eadb] p-4 text-sm leading-6 text-[#6b5433]"><Clock3 className="mt-0.5 size-4 shrink-0"/><div><p className="font-semibold">保存済みの検索結果を表示しています</p><p className="jp-text mt-1 text-xs leading-5">店舗検索サービスに接続できなかったため、{new Date(fetchedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}時点の内容です。営業状況と空席は、予約前に店舗へご確認ください。</p></div></div>}
          {searched&&<div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#687370]"><span>{providerTotal.toLocaleString()}件から条件の近い店舗を表示</span><a href="https://www.hotpepper.jp/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1f4b46] underline-offset-4 hover:underline">店舗情報提供：ホットペッパー グルメ</a></div>}
          {chosen&&<><div className="mt-5 grid gap-5 rounded-[26px] border border-[#182523]/8 bg-white p-5 shadow-[0_12px_36px_rgba(24,37,35,.06)] sm:p-6 lg:grid-cols-[.9fr_1.1fr]"><div><div className="flex items-center gap-2 text-xs font-bold tracking-[.1em] text-[#b55c38]"><MapPin className="size-4"/>選択中の店舗</div><h3 className="mt-2 text-2xl font-bold">{chosen.name}</h3><div className="mt-4 rounded-2xl border border-[#182523]/6 bg-[#f7f5ef] p-4"><p className="text-xs font-bold text-[#65716e]">住所</p><p className="mt-1 text-sm leading-6 text-[#34413e]">{chosen.address}</p><p className="mt-3 text-xs font-bold text-[#65716e]">アクセス</p><p className="mt-1 text-sm leading-6 text-[#34413e]">{chosen.access}</p></div><div className="mt-4"><MapLinks address={chosen.address}/></div><a href={chosen.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#173f3a] underline-offset-4 hover:underline">店舗ページで詳細・空席を確認<ExternalLink className="size-4"/></a></div><VenueMap address={chosen.address} label={chosen.name}/></div>
          <div className="mt-5 grid gap-4 rounded-[26px] border border-[#173f3a]/12 bg-[#e8f0ec] p-5 sm:p-6 xl:grid-cols-[minmax(240px,1fr)_auto_auto] xl:items-center"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-white text-[#173f3a] shadow-sm"><Users className="size-4"/></span><div><p className="font-bold">このプランで参加者に確認する</p><p className="mt-1 text-sm text-[#65716e]">日時・候補店・予算をまとめて共有できます</p></div></div><div className="flex flex-wrap gap-x-6 gap-y-2"><MiniStat label="参加予定" value={`${query.people}名`}/><MiniStat label="予算目安" value={chosen.budgetLabel}/><MiniStat label="候補順位" value={`${selected+1}位`}/></div><Button onClick={()=>setApprovalOpen(true)} className="h-12 rounded-[14px] bg-[#173f3a] px-6 font-bold text-white shadow-lg hover:bg-[#0e332f]">内容を確認<ArrowRight className="ml-2 size-4"/></Button></div></>}
        </section>}

        {activeView==="home"&&<section className="pt-6"><div className="grid gap-5">
          <div className="rounded-[26px] border border-[#182523]/8 bg-white p-5 shadow-[0_12px_34px_rgba(24,37,35,.05)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-[.12em] text-[#b55c38]">CURRENT PLAN</p><h2 className="mt-1 text-2xl font-bold">{query.purpose} {eventDate.slice(0,4)}</h2></div><Badge className="bg-[#e8f0ec] text-[#2f6b57]">{stageCopy[stage]}</Badge></div>
            {/* auto-fit means a column is never narrower than the value it holds, which is how
                the fixed three-column grid ended up showing "20…" and "5,…". */}
            <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-x-5 gap-y-4">
              <SummaryFact icon={CalendarDays} label="開催" value={`${eventDate.slice(5).replace("-","/")} ${eventTime}`}/>
              <SummaryFact icon={Users} label="人数" value={`${query.people}名`}/>
              <SummaryFact icon={WalletCards} label="予算 / 人" value={`${query.budget.toLocaleString()}円`}/>
              <SummaryFact icon={MapPin} label="場所" value={query.area}/>
              <SummaryFact icon={Search} label="候補" value={candidates.length?`${candidates.length}件`:"未検索"}/>
              <SummaryFact icon={UtensilsCrossed} label="食事の配慮" value={hasAllergy?`${allergy.items.length}項目`:allergy.status==="none"?"なし":"未設定"}/>
            </div>
            <Button onClick={()=>navigate("venues")} className="mt-6 h-11 rounded-xl bg-[#df5542] px-5 text-white hover:bg-[#c84636]">会場候補を確認<ArrowRight className="ml-2 size-4"/></Button>
          </div>
          <div className="rounded-[26px] border border-[#182523]/8 bg-white p-5 shadow-[0_12px_34px_rgba(24,37,35,.05)] sm:p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">やることリスト</h2><button type="button" onClick={()=>navigate("history")} className="text-sm font-semibold text-[#b55c38]">履歴を見る</button></div>
            <div className="mt-5 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))]">
              <TodoRow done={searched} label="条件を決めて候補を出す" onClick={()=>navigate("home")}/>
              <TodoRow done={candidates.length>0&&picked} label="会場候補を確認する" onClick={()=>navigate("venues")}/>
              <TodoRow done={stageIndex>2} label="参加者に連絡する" onClick={()=>navigate("participants")}/>
              <TodoRow done={stage==="scheduled"} label="予約内容を確定する" onClick={()=>setApprovalOpen(true)}/>
            </div>
          </div>
        </div></section>}

        {activeView==="participants"&&<section><ScreenHeading eyebrow="PARTICIPANTS" title="参加者と連絡" description="予約内容、出欠、アレルギー確認、グループチャットをまとめて管理します。"/>{chosen?<><div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><div className="rounded-[24px] border border-[#182523]/8 bg-white p-5"><p className="text-xs font-bold text-[#b55c38]">共有する予約内容</p><h2 className="mt-2 break-keep text-xl font-bold">{chosen.name}</h2><p className="mt-2 text-sm leading-6 text-[#65716e]">{chosen.address}</p><div className="mt-4"><MapLinks address={chosen.address}/></div><div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4"><MiniStat label="日時" value={`${eventDate.slice(5).replace("-","/")} ${eventTime}`}/><MiniStat label="人数" value={`${query.people}名`}/><MiniStat label="予算目安" value={chosen.budgetLabel}/><MiniStat label="候補順位" value={`${selected+1}位`}/><MiniStat label="アクセス" value={chosen.access||"—"}/><MiniStat label="食事の配慮" value={hasAllergy?`${allergy.items.length}項目`:allergy.status==="none"?"なし":"未設定"}/></div><p className="jp-text mt-5 text-xs leading-5 text-[#77807e]">空席とアレルギー対応は、予約前に店舗へ直接ご確認ください。</p></div><div className="flex flex-col rounded-[24px] border border-[#182523]/8 bg-[#fff8f2] p-5"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#df5542] text-white"><MessageCircle className="size-5"/></span><div><h2 className="text-xl font-bold">グループを作成して共有</h2><p className="jp-text mt-2 text-sm leading-6 text-[#65716e]">作成後は専用画面へ移動し、参加者ごとの予約確認とグループチャットを利用できます。</p></div></div>
              <p className="mt-5 text-xs font-bold tracking-[.12em] text-[#b55c38]">グループを作る前に送れるもの</p>
              <p className="jp-text mt-3 max-h-64 flex-1 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[#182523]/8 bg-white p-4 text-sm leading-7 text-[#293432]">{announcement}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Button onClick={()=>void copyText(announcement,"お知らせ文をコピーしました")} className="h-11 rounded-xl bg-[#173f3a] text-white hover:bg-[#0e332f]"><Copy className="mr-2 size-4"/>お知らせ文</Button>
                <Button onClick={()=>void sharePlan()} variant="outline" className="h-11 rounded-xl border-[#182523]/15 bg-white"><Share2 className="mr-2 size-4"/>共有</Button>
                <Button onClick={()=>void copyPlan()} variant="outline" className="h-11 rounded-xl border-[#182523]/15 bg-white"><Copy className="mr-2 size-4"/>プラン</Button>
              </div>
              {shareStatus&&<p role="status" className="mt-2 text-xs leading-5 text-[#65716e]">{shareStatus}</p>}
              </div></div><CreateGroup title={`${query.purpose}のグループ`} initial={{venueName:chosen.name,address:chosen.address,date:eventDate,time:eventTime,people:query.people,price:chosen.estimatedPrice||query.budget,status:"planning",bookingReference:"",note:"",website:chosen.url}}/></>:<EmptyScreen icon={Users} title="先に会場候補を選んでください" description="参加者へ共有する店舗を選ぶと、グループを作成できます。" action="会場候補へ" onClick={()=>navigate("venues")}/>}</section>}

        {activeView==="suggestions"&&<section><ScreenHeading eyebrow="ENCOPA SUGGESTION" title="プランへの提案" description="検索条件と候補店を整理し、次に確認すべき内容を表示します。"/>{searched?<><AgentInsight status={agentStatus} plan={agentPlan} error={agentError}/><div className="mt-5 rounded-[24px] border border-[#182523]/8 bg-white p-5"><h2 className="text-lg font-bold">次のアクション</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><CheckCard icon={Search} title="候補を比較" value={`${candidates.length}件から会に合う店舗を確認`}/><CheckCard icon={Users} title="参加者へ共有" value="出欠と食事の配慮をグループで確認"/><CheckCard icon={CalendarDays} title="予約を確定" value="店舗へ連絡後、予定をカレンダーへ追加"/></div></div></>:<EmptyScreen icon={Lightbulb} title="店舗検索後に提案を表示します" description="条件を入力して実店舗を検索すると、候補比較と次の確認事項を整理します。" action="店舗を検索" onClick={()=>navigate("home")}/>}</section>}

        {activeView==="history"&&<section><ScreenHeading eyebrow="HISTORY" title="プランの履歴" description="この端末で行った変更と進行状況を確認できます。"/><div className="rounded-[24px] border border-[#182523]/8 bg-white p-5 sm:p-6"><div className="space-y-1">{audit.map((item,index)=><div key={item.id} className="flex gap-4 border-b border-[#182523]/7 py-4 last:border-0"><span className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full ${index===0?"bg-[#fde8df] text-[#c75534]":"bg-[#edf0ec] text-[#65716e]"}`}>{index===0?<Sparkles className="size-4"/>:<Clock3 className="size-4"/>}</span><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3"><p className="font-semibold">{item.label}</p>{item.at>0&&<time dateTime={new Date(item.at).toISOString()} className="text-xs tabular-nums text-[#87908d]">{new Date(item.at).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time>}</div><p className="mt-1 text-sm leading-6 text-[#65716e]">{item.detail}</p></div></div>)}</div></div></section>}
      </div>

      {(activeView==="home"||activeView==="venues")&&<aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-4 overflow-hidden rounded-[24px] border border-[#1e2928]/10 bg-[#1f4b46] p-5 text-white shadow-[0_16px_40px_rgba(30,41,40,.12)]">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#e9d8b9]">プラン共有</p><h2 className="mt-1 text-xl font-bold">みんなに知らせる</h2></div><span className="grid size-10 place-items-center rounded-2xl bg-white/10"><Share2 className="size-5"/></span></div>
          <div className="mt-4 rounded-2xl bg-white/[.08] p-4"><p className="text-xs text-white/55">選択中のプラン</p><p className="mt-1 text-lg font-semibold">{chosen?.name||"店舗を検索してください"}</p><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-4"><span className="shrink-0 whitespace-nowrap text-white/55">日時</span><span className="text-right">{eventDate.slice(5).replace("-","/")} {eventTime}</span></div><div className="flex justify-between gap-4"><span className="shrink-0 whitespace-nowrap text-white/55">人数</span><span>{query.people}名</span></div><div className="flex justify-between gap-4"><span className="shrink-0 whitespace-nowrap text-white/55">予算</span><span className="jp-text min-w-0 text-right">{chosen?.budgetLabel||`${query.budget.toLocaleString()}円 / 人`}</span></div><div className="flex justify-between gap-4"><span className="shrink-0 whitespace-nowrap text-white/55">場所</span><span className="jp-text min-w-0 text-right">{chosen?.address||query.area}</span></div></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><Button disabled={!chosen} onClick={()=>void sharePlan()} className="rounded-xl bg-[#e17a4e] text-white hover:bg-[#ee8a5e]"><Share2 className="mr-2 size-4"/>共有する</Button><Button disabled={!chosen} onClick={()=>void copyPlan()} variant="outline" className="rounded-xl border-white/15 bg-white/[.06] text-white hover:bg-white/15 hover:text-white"><Copy className="mr-2 size-4"/>コピー</Button></div>
          <Button disabled={!chosen} onClick={()=>void copyText(announcement,"お知らせ文をコピーしました")} variant="outline" className="mt-2 w-full rounded-xl border-white/15 bg-white/[.06] text-white hover:bg-white/15 hover:text-white"><MessageCircle className="mr-2 size-4"/>お知らせ文をコピー</Button>
          {shareStatus&&<p role="status" className="mt-3 text-xs leading-5 text-white/70">{shareStatus}</p>}
          <Button disabled={candidates.length<2} onClick={()=>{setFailover(true);setSelected(0);setStage("ranked");addAudit("次の候補へ変更","現在の条件を保ったまま候補を切り替えました")}} variant="ghost" className="mt-3 w-full rounded-xl text-white/75 hover:bg-white/10 hover:text-white"><RefreshCw className="mr-2 size-4"/>満席なら次の候補へ</Button>
        </div>
        <div className="rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-[0_16px_40px_rgba(30,41,40,.07)]"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#a85b40]">進行状況</p><h2 className="mt-1 text-xl font-semibold">この会の準備</h2></div><span className="text-2xl font-semibold text-[#1f4b46]">{progress}%</span></div><Progress value={progress} className="mt-4 h-2 bg-[#e9e8e1] [&>div]:bg-[#df764a]"/><div className="mt-6 space-y-1"><StatusRow icon={WalletCards} title="目的・予算" detail={`${query.purpose}・${query.budget.toLocaleString()}円`} done/><StatusRow icon={MapPin} title="会場候補" detail={candidates.length?`${query.area}・${candidates.length}件`:"店舗を検索してください"} done={stageIndex>1&&candidates.length>0} active={stageIndex===1}/><StatusRow icon={Users} title="参加者確認" detail={stageIndex<2?"リンク未送信":stageIndex===2?"回答を収集中":"回答完了"} done={stageIndex>2} active={stageIndex===2}/><StatusRow icon={CalendarDays} title="予約と予定" detail={stage==="scheduled"?"カレンダーへ追加済み":"内容を確認して確定"} done={stage==="scheduled"} active={stage==="awaiting_approval"}/></div><div className="mt-6 rounded-2xl bg-[#f3f0e8] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-[#2f6b57]"/>プライバシー</div><p className="mt-2 text-xs leading-5 text-[#6d7572]">アレルギーの詳細は本人と幹事だけが確認できます。参加者全員には表示されません。</p></div></div>
        <div className="mt-4 rounded-[24px] border border-[#1e2928]/10 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.09em] text-[#a85b40]">最近の更新</p><h2 className="mt-1 text-lg font-semibold">プランの履歴</h2></div><Badge variant="outline" className="bg-[#f7f5ef]">この端末</Badge></div><div className="mt-4 space-y-3">{audit.slice(0,4).map((item,index)=><div key={item.id} className="flex gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${index===0?"bg-[#e17a4e]":"bg-[#c7cbc7]"}`}/><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold">{item.label}</p>{item.at>0&&<time dateTime={new Date(item.at).toISOString()} className="shrink-0 text-[11px] tabular-nums text-[#87908d]">{new Date(item.at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</time>}</div><p className="mt-0.5 text-xs leading-5 text-[#77807e]">{item.detail}</p></div></div>)}</div></div>
      </aside>}
    </section>
      </div>
    </div>

    <nav className="fixed inset-x-2 bottom-2 z-50 grid grid-cols-5 rounded-[22px] border border-[#182523]/10 bg-white/95 p-1.5 shadow-[0_14px_40px_rgba(24,37,35,.18)] backdrop-blur-xl lg:hidden" aria-label="モバイルナビゲーション">{navItems.map(item=>{const Icon=item.icon;const active=activeView===item.view;return <button key={item.view} type="button" aria-current={active?"page":undefined} onClick={()=>navigate(item.view)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[16px] px-1 text-[11px] font-semibold transition ${active?"bg-[#fff0e9] text-[#d94f3b]":"text-[#687370]"}`}><Icon className="size-5"/>{item.label}</button>})}</nav>

    <Dialog open={locationOpen} onOpenChange={setLocationOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[26px] border-[#182523]/8 bg-[#faf9f5] p-0 sm:max-w-[760px]"><DialogHeader className="sticky top-0 z-10 border-b border-[#182523]/8 bg-[#faf9f5]/95 p-6 text-left backdrop-blur"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[#e5eee9] text-[#173f3a]"><MapPin className="size-5"/></span><div><DialogTitle className="text-2xl font-bold">場所を選ぶ</DialogTitle><DialogDescription className="mt-1">現在の選択：{area}。全国47都道府県から選べます。</DialogDescription></div></div></DialogHeader><div className="space-y-6 p-6">{PREFECTURE_REGIONS.map(region=><section key={region.name} aria-labelledby={`region-${region.name}`}><h3 id={`region-${region.name}`} className="mb-2 text-sm font-bold text-[#4e5b57]">{region.name}</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{region.prefectures.map(prefecture=>{const active=prefecture.code===prefectureCode;return <button key={prefecture.code} type="button" aria-pressed={active} onClick={()=>{setPrefectureCode(prefecture.code);setArea(prefecture.name);setLocationOpen(false)}} className={`flex min-h-12 items-center justify-between rounded-[14px] border px-3 text-left text-sm font-semibold transition ${active?"border-[#173f3a] bg-[#173f3a] text-white shadow-md":"border-[#182523]/10 bg-white text-[#283330] hover:border-[#47766f]/50 hover:bg-[#edf3ef]"}`}><span>{prefecture.name}</span>{active&&<Check className="size-4"/>}</button>})}</div></section>)}</div><DialogFooter className="border-t border-[#182523]/8 bg-white p-4"><Button variant="outline" onClick={()=>setLocationOpen(false)}>閉じる</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] bg-[#fbfaf6] sm:max-w-[560px]"><DialogHeader><DialogTitle className="font-serif text-2xl">プランの詳細設定</DialogTitle><DialogDescription>日時や候補選びの優先条件を変更できます。</DialogDescription></DialogHeader><div className="space-y-5 py-2"><div className="grid grid-cols-2 gap-3"><div><Label className="mb-2 block">開催日</Label><Input type="date" value={draftEventDate} onChange={e=>setDraftEventDate(e.target.value)} className="h-11 bg-white"/></div><div><Label className="mb-2 block">開始時刻</Label><Input type="time" value={draftEventTime} onChange={e=>setDraftEventTime(e.target.value)} className="h-11 bg-white"/></div></div><div><Label className="mb-2 block">候補選びで優先すること</Label><Select value={draftPriority} onValueChange={v=>setDraftPriority(v as Priority)}><SelectTrigger className="h-11 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="balance">バランス</SelectItem><SelectItem value="conversation">会話しやすさ</SelectItem><SelectItem value="cost">予算の収まり</SelectItem><SelectItem value="access">アクセス情報</SelectItem></SelectContent></Select></div><SettingSwitch label="個室・半個室を優先" description="会話のしやすさを候補選びに加えます" checked={draftPrivateRoom} onCheckedChange={setDraftPrivateRoom}/><SettingSwitch label="食事制限の確認を追加" description="候補ごとに、予約前の店舗確認を案内します" checked={draftDietary} onCheckedChange={setDraftDietary}/><button type="button" onClick={()=>{setSettingsOpen(false);setAllergyOpen(true)}} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-[#1e2928]/10 bg-white px-4 text-left"><div><p className="text-sm font-semibold">食物アレルギー</p><p className="mt-1 text-xs text-[#77807e]">{hasAllergy?`${allergy.items.join("、")}を確認`:allergy.status==="none"?"なし":"未設定"}</p></div><ChevronRight className="size-4 text-[#77807e]"/></button></div><DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>変更しない</Button><Button onClick={applySettings} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">保存して候補を更新</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={allergyOpen} onOpenChange={setAllergyOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] bg-[#fbfaf6] sm:max-w-[680px]"><DialogHeader><DialogTitle className="font-serif text-2xl">アレルギーを設定</DialogTitle><DialogDescription>確認が必要な食材を選ぶと、プランと店舗への確認事項に反映されます。</DialogDescription></DialogHeader><div className="py-2"><AllergyPicker value={allergy} onChange={setAllergy} privateSharing={false}/></div><DialogFooter><Button onClick={()=>{setAllergyOpen(false);if(allergy.status==="selected")setDietary(true)}} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">設定を保存</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[24px] border-0 bg-[#fbfaf6] p-0 sm:max-w-[600px]"><DialogHeader className="border-b border-[#1e2928]/10 p-6 text-left"><DialogTitle className="font-serif text-2xl">プランの最終確認</DialogTitle><DialogDescription>参加者へ共有する前に、日時・費用・確認事項をご確認ください。</DialogDescription></DialogHeader><div className="space-y-4 px-6"><div className="rounded-2xl border border-[#1e2928]/10 bg-white p-4"><p className="text-xs text-[#7a8380]">選択中の会場</p><p className="mt-1 text-lg font-semibold">{chosen?.name}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><span className="text-[#68716f]">開催予定</span><span className="text-right font-medium">{eventDate} {eventTime}</span><span className="text-[#68716f]">予算目安</span><span className="text-right font-medium">{chosen?.budgetLabel||"店舗へ確認"}</span><span className="text-[#68716f]">定休日</span><span className="text-right font-medium">{chosen?.closed||"店舗ページで確認"}</span></div></div><div className="grid gap-3 sm:grid-cols-3"><CheckCard icon={Clock3} title="日程" value="開催日時を確認"/><CheckCard icon={UtensilsCrossed} title="食事" value={hasAllergy?`${allergy.items.length}項目を店舗へ確認`:"特記事項なし"}/><CheckCard icon={Users} title="参加者" value={`${query.people}名で共有`}/></div>{stage==="scheduled"?<div className="rounded-2xl bg-[#e8f0ea] p-4 text-sm text-[#24533f]"><div className="flex items-center gap-2 font-semibold"><CircleCheck className="size-5"/>カレンダー用ファイルを作成しました</div><p className="mt-1 pl-7 text-xs leading-5">端末のカレンダーへ追加できます。店舗への予約状況はグループで共有してください。</p></div>:completed?<div className="rounded-2xl bg-[#e8f0ea] p-4 text-sm text-[#24533f]"><div className="flex items-center gap-2 font-semibold"><CircleCheck className="size-5"/>{stage==="awaiting_approval"?"回答が揃い、最終確認待ちです":"参加者へ確認中です"}</div><p className="mt-1 pl-7 text-xs leading-5">出欠と希望条件をまとめて確認できます。</p></div>:<div className="rounded-2xl bg-[#f4eee2] p-4 text-xs leading-5 text-[#75643f]">確定前に参加者へプランを共有し、出欠と食事に関する希望を確認しましょう。</div>}</div><DialogFooter className="p-6 pt-2 sm:justify-between"><Button variant="outline" onClick={()=>setApprovalOpen(false)}>候補を見直す</Button><Button onClick={advanceWorkflow} className="bg-[#1f4b46] text-white hover:bg-[#163d39]">{stage==="scheduled"?<><Download className="mr-2 size-4"/>予定を再取得</>:stage==="awaiting_approval"?"プランを確定して予定作成":stage==="collecting"?"回答内容を確認":"参加者へ確認する"}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="flex min-w-0 flex-col justify-end"><Label className="mb-2 block whitespace-nowrap text-[13px] font-bold text-[#4e5b57]">{label}</Label>{children}</div>}
function LightPlanFact({label,value}:{label:string;value:string}){return <div className="min-w-0"><p className="text-[11px] font-medium text-[#7b8582]">{label}</p><p className="jp-text mt-1 text-xs font-bold text-[#263532]">{value}</p></div>}
function MiniStat({label,value}:{label:string;value:string}){return <div className="min-w-0"><p className="whitespace-nowrap text-xs text-[#73807c]">{label}</p><p className="mt-1 whitespace-nowrap text-[13px] font-bold sm:text-sm">{value}</p></div>}
function SummaryFact({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:string}){return <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f3f0e8] text-[#1f4b46]"><Icon className="size-5"/></span><div className="min-w-0"><p className="whitespace-nowrap text-xs font-semibold text-[#87908d]">{label}</p><p className="jp-text mt-1 font-bold">{value}</p></div></div>}
function TodoRow({done,label,onClick}:{done:boolean;label:string;onClick:()=>void}){return <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#182523]/8 px-3 text-left transition hover:border-[#b55c38]/40 hover:bg-[#f7f5ef]"><span className={`grid size-6 shrink-0 place-items-center rounded-full ${done?"bg-[#3f8a70] text-white":"border-2 border-[#ccd1cd] text-transparent"}`}><Check className="size-3.5"/></span><span className={`jp-text flex-1 text-sm font-semibold ${done?"text-[#52605c]":"text-[#182523]"}`}>{label}</span><ChevronRight className="size-4 text-[#9ca4a1]"/></button>}
function ScreenHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){return <div className="mb-6"><p className="text-xs font-bold tracking-[.14em] text-[#b55c38]">{eyebrow}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#65716e] sm:text-base">{description}</p></div>}
function EmptyScreen({icon:Icon,title,description,action,onClick}:{icon:React.ElementType;title:string;description:string;action:string;onClick:()=>void}){return <div className="grid min-h-[420px] place-items-center rounded-[26px] border border-[#182523]/8 bg-white px-6 text-center shadow-[0_12px_34px_rgba(24,37,35,.05)]"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#fff0e9] text-[#d45b3f]"><Icon className="size-6"/></span><h2 className="mt-5 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#65716e]">{description}</p><Button onClick={onClick} className="mt-6 rounded-xl bg-[#173f3a] px-5 text-white hover:bg-[#0e332f]">{action}<ArrowRight className="ml-2 size-4"/></Button></div></div>}
function StatusRow({icon:Icon,title,detail,done,active}:{icon:React.ElementType;title:string;detail:string;done?:boolean;active?:boolean}){return <div className={`flex items-center gap-3 rounded-xl p-3 ${active?"bg-[#eef2ed]":""}`}><span className={`grid size-9 place-items-center rounded-xl ${done?"bg-[#dfeae2] text-[#2f6b57]":active?"bg-[#1f4b46] text-white":"bg-[#f1f0eb] text-[#8a918f]"}`}>{done?<Check className="size-4"/>:<Icon className="size-4"/>}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="truncate text-xs text-[#7a8380]">{detail}</p></div>{active&&<span className="size-2 rounded-full bg-[#df764a]"/>}</div>}
function CheckCard({icon:Icon,title,value}:{icon:React.ElementType;title:string;value:string}){return <div className="rounded-2xl border border-[#1e2928]/10 bg-white p-3"><Icon className="size-4 text-[#1f4b46]"/><p className="mt-3 text-xs font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#77807e]">{value}</p></div>}
function SettingSwitch({label,description,checked,onCheckedChange}:{label:string;description:string;checked:boolean;onCheckedChange:(v:boolean)=>void}){return <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#1e2928]/10 bg-white p-4"><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-[#77807e]">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange}/></div>}
function ScorePart({label,value}:{label:string;value:number}){return <div className="text-center"><p className="whitespace-nowrap text-xs text-[#73807c]">{label}</p><p className="mt-1 text-base font-black text-[#173f3a]">{value}</p></div>}
function isCalendarDate(value:unknown):value is string {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function restoredAllergy(value:unknown):AllergyProfile|null {
  if(!value||typeof value!=="object")return null;
  const v=value as Record<string,unknown>;
  if(!["unanswered","none","selected"].includes(String(v.status)))return null;
  if(v.status!=="selected")return {...EMPTY_ALLERGY,status:v.status as "none"|"unanswered"};
  if(!Array.isArray(v.items))return null;
  const items=[...new Set(v.items.filter((item):item is string=>(ALLERGENS as readonly unknown[]).includes(item)))];
  if(!items.length)return null;
  return {status:"selected",items,note:typeof v.note==="string"?v.note.slice(0,400):"",consent:v.consent===true};
}
function escapeIcs(value:string){return value.replace(/\\/g,"\\\\").replace(/,/g,"\\,").replace(/;/g,"\\;").replace(/\n/g,"\\n")}
