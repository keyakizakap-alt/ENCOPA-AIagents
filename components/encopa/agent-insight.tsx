"use client";
import { useState } from "react";
import type { AgentFailureReason, AgentPlan } from "@/lib/agent-types";
import { CircleCheck, Compass, Copy, ListChecks, MessageSquareText, RefreshCw, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";

export function AgentInsight({ status, plan, error, failure }: { status: "idle" | "running" | "ready" | "error"; plan: AgentPlan | null; error: string; failure?: { reason?: AgentFailureReason | string; traceId?: string } | null }) {
  if (status === "idle") return null;
  if (status === "running") return <section aria-live="polite" className="mt-5 rounded-[24px] border border-[#211f1d]/10 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#fdeae5] text-[#d03e28]"><RefreshCw className="size-5 animate-spin"/></span><div><p className="font-semibold">候補を詳しく比較しています</p><p className="mt-1 text-sm text-[#6b635c]">会場条件、予約前の注意点、共有内容をそれぞれ確認中です。</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><AgentStep icon={Compass} text="会場の相性を比較"/><AgentStep icon={ShieldCheck} text="確認漏れを点検"/><AgentStep icon={MessageSquareText} text="共有内容を整理"/></div>
  </section>;
  if (status === "error") {
    // 原因の種別と追跡IDは画面に出しません。利用者には関係のない情報で、
    // 出せば読む人を選ばず不安にさせるだけです。応答の reason と
    // サーバーの agent_workflow_failed には残してあるので、運用者は追えます。
    if (failure?.reason) console.info("[encopa] agent unavailable", { reason: failure.reason, traceId: failure.traceId });
    return <div role="status" className="mt-5 rounded-2xl border border-[#f0c48a] bg-[#fbf0dc] p-4 text-sm text-[#8a6a2f]">
      <p className="font-semibold">店舗候補は表示できました</p>
      <p className="jp-text mt-1 leading-6">{error} 候補の選択や店舗ページの確認はそのまま利用できます。</p>
    </div>;
  }
  if (!plan) return null;
  return <section aria-label="候補分析結果" className="mt-5 overflow-hidden rounded-[24px] border border-[#211f1d]/10 bg-white shadow-sm">
    <div className="border-b border-[#211f1d]/10 bg-[#d03e28] p-5 text-white sm:p-6"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0c48a]"><Compass className="size-4"/>プランアシスタント</div><p className="mt-3 max-w-3xl text-base leading-7 text-white/85">{plan.summary}</p></div>
    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
      <div><div className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-[#d03e28]"/>予約前に確認すること</div><ul className="mt-4 space-y-3">{plan.confirmationChecklist.map((item)=><li key={item} className="flex gap-2 text-sm leading-6 text-[#6b635c]"><CircleCheck className="mt-1 size-4 shrink-0 text-[#2f7d55]"/>{item}</li>)}</ul></div>
      <div><div className="flex items-center gap-2 font-semibold"><Compass className="size-4 text-[#d03e28]"/>次に進めること</div><ol className="mt-4 space-y-3">{plan.nextActions.map((item,index)=><li key={item} className="flex gap-3 text-sm leading-6 text-[#6b635c]"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f6ece1] text-xs font-semibold text-[#d03e28]">{index+1}</span>{item}</li>)}</ol></div>
    </div>
    <AgentRun plan={plan}/>
    {plan.shareDraft&&<ShareDraft text={plan.shareDraft}/>}
  </section>;
}

/**
 * What the agent actually did, and how sure it is. These are facts about the run recorded
 * by the server, not the model describing itself — a model asked to narrate its own
 * reasoning will write a plausible story whether or not it matches what happened.
 */
function AgentRun({ plan }: { plan: AgentPlan }) {
  const low = plan.confidence === "low";
  return <div className="border-t border-[#182523]/10 p-5 sm:p-6">
    <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
      <div>
        <div className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-[#b55c38]"/>エージェントの進行</div>
        <ol className="mt-4">{plan.decisions.map((item,index)=><li key={`${item.step}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
          {index<plan.decisions.length-1&&<span aria-hidden className="absolute left-[3px] top-4 h-full w-px bg-[#e3e0d6]"/>}
          <span className={`relative mt-1.5 size-[7px] shrink-0 rounded-full ${index===plan.decisions.length-1?"bg-[#df7549]":"bg-[#c7cbc7]"}`}/>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.step}</p>
            <p className="jp-text mt-0.5 text-xs leading-5 text-[#65716e]">{item.detail}</p>
          </div>
        </li>)}</ol>
      </div>
      <div className="flex flex-col gap-4">
        {plan.constraints.length>0&&<div>
          <div className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-[#b55c38]"/>条件を満たす候補</div>
          <dl className="mt-3 space-y-2">{plan.constraints.map((item)=><div key={item.label} className="flex items-baseline justify-between gap-3 rounded-xl bg-[#f7f5ef] px-3 py-2">
            <dt className="jp-text min-w-0 text-xs text-[#65716e]">{item.label}</dt>
            <dd className="shrink-0 text-sm font-bold tabular-nums"><span className={item.met===0?"text-[#b43a32]":"text-[#173f3a]"}>{item.met}</span><span className="text-[#87908d]"> / {item.total}件</span></dd>
          </div>)}</dl>
          {plan.constraints.some((item)=>item.met===0&&item.relaxable)&&<p className="jp-text mt-2 text-xs leading-5 text-[#8a5a3a]">満たす候補が0件の条件があります。その条件を外すか、値を緩めて再検索してください。</p>}
        </div>}
        <div className={`rounded-2xl p-4 ${low?"bg-[#fbf0dc]":"bg-[#e8f0ec]"}`}>
          <div className="flex items-center gap-2 text-sm font-semibold">{low?<ShieldAlert className="size-4 text-[#8a6a2f]"/>:<ShieldCheck className="size-4 text-[#2f6b57]"/>}自己検証</div>
          <p className="jp-text mt-1 text-xs leading-5 text-[#4a5350]">
            {low
              ? `候補データと突き合わせて${plan.selfCheck.issues}件の不備が残りました。${plan.selfCheck.revised?"1回修正しましたが解消していません。":""}確認事項に「要確認」として出しています。`
              : plan.selfCheck.revised?"不備を見つけ、自分で1回修正して解消しました。":"候補データと突き合わせ、不備がないことを確認しました。"}
          </p>
        </div>
      </div>
    </div>
  </div>;
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
