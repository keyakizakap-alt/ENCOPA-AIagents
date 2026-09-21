import type { AgentPlan } from "@/lib/agent-types";
import { CircleCheck, Compass, ListChecks, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";

export function AgentInsight({ status, plan, error }: { status: "idle" | "running" | "ready" | "error"; plan: AgentPlan | null; error: string }) {
  if (status === "idle") return null;
  if (status === "running") return <section aria-live="polite" className="mt-5 rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e8eee9] text-[#1f4b46]"><RefreshCw className="size-5 animate-spin"/></span><div><p className="font-semibold">候補を詳しく比較しています</p><p className="mt-1 text-sm text-[#687370]">会場条件、予約前の注意点、共有内容をそれぞれ確認中です。</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><AgentStep icon={Compass} text="会場の相性を比較"/><AgentStep icon={ShieldCheck} text="確認漏れを点検"/><AgentStep icon={MessageSquareText} text="共有内容を整理"/></div>
  </section>;
  if (status === "error") return <div role="status" className="mt-5 rounded-2xl border border-[#d9c9a7] bg-[#f7f1e5] p-4 text-sm text-[#685b3e]"><p className="font-semibold">店舗候補は表示できました</p><p className="mt-1 leading-6">{error} 候補の選択や店舗ページの確認はそのまま利用できます。</p></div>;
  if (!plan) return null;
  return <section aria-label="候補分析結果" className="mt-5 overflow-hidden rounded-[24px] border border-[#1e2928]/10 bg-white shadow-sm">
    <div className="border-b border-[#1e2928]/10 bg-[#1f4b46] p-5 text-white sm:p-6"><div className="flex items-center gap-2 text-sm font-semibold text-[#d9c9a7]"><Compass className="size-4"/>プランアシスタント</div><p className="mt-3 max-w-3xl text-base leading-7 text-white/85">{plan.summary}</p></div>
    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
      <div><div className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-[#1f4b46]"/>予約前に確認すること</div><ul className="mt-4 space-y-3">{plan.confirmationChecklist.map((item)=><li key={item} className="flex gap-2 text-sm leading-6 text-[#65706d]"><CircleCheck className="mt-1 size-4 shrink-0 text-[#2f6b57]"/>{item}</li>)}</ul></div>
      <div><div className="flex items-center gap-2 font-semibold"><Compass className="size-4 text-[#1f4b46]"/>次に進めること</div><ol className="mt-4 space-y-3">{plan.nextActions.map((item,index)=><li key={item} className="flex gap-3 text-sm leading-6 text-[#65706d]"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f0ece2] text-xs font-semibold text-[#1f4b46]">{index+1}</span>{item}</li>)}</ol></div>
    </div>
  </section>;
}

function AgentStep({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex items-center gap-2 rounded-xl bg-[#f7f5ef] px-3 py-3 text-sm text-[#55615e]"><Icon className="size-4 text-[#1f4b46]"/>{text}</div>;
}
