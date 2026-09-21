"use client";
import { useState } from "react";
import type { AgentPlan } from "@/lib/agent-types";
import { CircleCheck, Compass, Copy, ListChecks, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";

export function AgentInsight({ status, plan, error }: { status: "idle" | "running" | "ready" | "error"; plan: AgentPlan | null; error: string }) {
  if (status === "idle") return null;
  if (status === "running") return <section aria-live="polite" className="mt-5 rounded-[24px] border border-[#211f1d]/10 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#fdeae5] text-[#d03e28]"><RefreshCw className="size-5 animate-spin"/></span><div><p className="font-semibold">候補を詳しく比較しています</p><p className="mt-1 text-sm text-[#6b635c]">会場条件、予約前の注意点、共有内容をそれぞれ確認中です。</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><AgentStep icon={Compass} text="会場の相性を比較"/><AgentStep icon={ShieldCheck} text="確認漏れを点検"/><AgentStep icon={MessageSquareText} text="共有内容を整理"/></div>
  </section>;
  if (status === "error") return <div role="status" className="mt-5 rounded-2xl border border-[#f0c48a] bg-[#fbf0dc] p-4 text-sm text-[#8a6a2f]"><p className="font-semibold">店舗候補は表示できました</p><p className="mt-1 leading-6">{error} 候補の選択や店舗ページの確認はそのまま利用できます。</p></div>;
  if (!plan) return null;
  return <section aria-label="候補分析結果" className="mt-5 overflow-hidden rounded-[24px] border border-[#211f1d]/10 bg-white shadow-sm">
    <div className="border-b border-[#211f1d]/10 bg-[#d03e28] p-5 text-white sm:p-6"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0c48a]"><Compass className="size-4"/>プランアシスタント</div><p className="mt-3 max-w-3xl text-base leading-7 text-white/85">{plan.summary}</p></div>
    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
      <div><div className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-[#d03e28]"/>予約前に確認すること</div><ul className="mt-4 space-y-3">{plan.confirmationChecklist.map((item)=><li key={item} className="flex gap-2 text-sm leading-6 text-[#6b635c]"><CircleCheck className="mt-1 size-4 shrink-0 text-[#2f7d55]"/>{item}</li>)}</ul></div>
      <div><div className="flex items-center gap-2 font-semibold"><Compass className="size-4 text-[#d03e28]"/>次に進めること</div><ol className="mt-4 space-y-3">{plan.nextActions.map((item,index)=><li key={item} className="flex gap-3 text-sm leading-6 text-[#6b635c]"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f6ece1] text-xs font-semibold text-[#d03e28]">{index+1}</span>{item}</li>)}</ol></div>
    </div>
    {plan.shareDraft&&<ShareDraft text={plan.shareDraft}/>}
  </section>;
}

/**
 * The model already writes a message for the group; until now nothing displayed it. It is
 * shown as editable text rather than sent anywhere - the only way it reaches people is a
 * person copying it, or posting it from the group room.
 */
function ShareDraft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="border-t border-[#211f1d]/10 bg-[#fdf6ef] p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 font-semibold"><MessageSquareText className="size-4 text-[#d03e28]"/>参加者へのお知らせ文（下書き）</div>
      <button type="button" onClick={()=>{navigator.clipboard.writeText(text).then(()=>setCopied(true),()=>setCopied(false))}} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#211f1d]/15 bg-white px-3 text-sm font-semibold transition hover:bg-[#fdeae5]"><Copy className="size-4"/>コピー</button>
    </div>
    <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-7 text-[#3a342f]">{text}</p>
    <p role="status" className="mt-2 text-xs text-[#6b635c]">{copied?"コピーしました。":"グループを作ると、この文面をそのまま投稿できます。"}</p>
  </div>;
}

function AgentStep({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex items-center gap-2 rounded-xl bg-[#fdf6ef] px-3 py-3 text-sm text-[#6b635c]"><Icon className="size-4 text-[#d03e28]"/>{text}</div>;
}
