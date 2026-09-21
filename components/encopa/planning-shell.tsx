import {
  CalendarDays,
  Check,
  Clock3,
  History,
  Home,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";

type Stage = "draft" | "ranked" | "collecting" | "awaiting_approval" | "scheduled";

const stageCopy: Record<Stage, { label: string; description: string }> = {
  draft: { label: "条件を入力中", description: "日時や人数を決めて、会場候補を探しましょう。" },
  ranked: { label: "候補を比較中", description: "店舗を比べて、みんなに見せる候補を選びましょう。" },
  collecting: { label: "回答を受付中", description: "参加者の出欠と食事の希望を確認しています。" },
  awaiting_approval: { label: "最終確認待ち", description: "回答内容を確認して、プランを確定できます。" },
  scheduled: { label: "予定を作成済み", description: "予約状況と当日の連絡はグループで共有できます。" },
};

const navItems = [
  { key: "home", href: "#home", label: "ホーム", icon: Home },
  { key: "results", href: "#results", label: "会場候補", icon: Search },
  { key: "participants", href: "#participants", label: "参加者・連絡", icon: Users },
  { key: "assistant", href: "#assistant", label: "プラン提案", icon: Sparkles },
  { key: "activity", href: "#activity", label: "履歴", icon: History },
] as const;

function activeNavigation(stage: Stage) {
  if (stage === "ranked") return "results";
  if (stage === "collecting" || stage === "awaiting_approval") return "participants";
  return "home";
}

export function DesktopNavigation({
  stage,
  candidateCount,
}: {
  stage: Stage;
  candidateCount: number;
}) {
  const active = activeNavigation(stage);

  return (
    <nav
      aria-label="プラン内ナビゲーション"
      className="hidden self-start rounded-[24px] bg-[#171d1c] p-3 text-white shadow-[0_18px_48px_rgba(20,28,27,.16)] xl:sticky xl:top-24 xl:block"
    >
      <a
        href="#home"
        className="flex min-h-12 items-center gap-3 rounded-2xl bg-[#d94f36] px-4 text-sm font-semibold text-white transition hover:bg-[#e35e45]"
      >
        <span className="grid size-7 place-items-center rounded-full bg-white/15 text-lg leading-none">＋</span>
        新しいプラン
      </a>
      <div className="mt-4 space-y-1">
        {navItems.map(({ key, href, label, icon: Icon }) => {
          const current = key === active;
          return (
            <a
              key={key}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition ${current ? "bg-white/12 font-semibold text-white" : "text-white/68 hover:bg-white/8 hover:text-white"}`}
            >
              <Icon className="size-4.5" />
              <span className="flex-1">{label}</span>
              {key === "results" && candidateCount > 0 ? (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{candidateCount}</span>
              ) : null}
            </a>
          );
        })}
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.04] p-4">
        <p className="text-xs font-semibold text-[#efb34b]">いい宴を、いいチームで。</p>
        <p className="mt-2 text-xs leading-5 text-white/55">
          会場探しから参加者への連絡、予約内容の共有まで、このプランでまとめられます。
        </p>
      </div>
    </nav>
  );
}

export function MobileNavigation({ stage }: { stage: Stage }) {
  const active = activeNavigation(stage);
  return (
    <nav
      aria-label="モバイルナビゲーション"
      className="fixed inset-x-3 bottom-3 z-50 rounded-[22px] border border-black/10 bg-white/92 p-1.5 shadow-[0_18px_50px_rgba(21,29,28,.2)] backdrop-blur-xl xl:hidden"
    >
      <div className="grid grid-cols-5">
        {navItems.map(({ key, href, label, icon: Icon }) => {
          const current = key === active;
          return (
            <a
              key={key}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-medium transition ${current ? "bg-[#f8ebe5] text-[#c94831]" : "text-[#687370] hover:bg-[#f3f1eb] hover:text-[#1e2928]"}`}
            >
              <Icon className="size-4.5" />
              <span>{label === "参加者・連絡" ? "参加者" : label === "プラン提案" ? "提案" : label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export function PlanOverview({
  title,
  eventDate,
  eventTime,
  people,
  budget,
  area,
  stage,
  candidateCount,
  hasAllergy,
}: {
  title: string;
  eventDate: string;
  eventTime: string;
  people: number;
  budget: number;
  area: string;
  stage: Stage;
  candidateCount: number;
  hasAllergy: boolean;
}) {
  const status = stageCopy[stage];
  const dateLabel = eventDate ? eventDate.replaceAll("-", "/") : "日程未設定";

  return (
    <section
      aria-labelledby="plan-overview-title"
      className="relative mb-5 overflow-hidden rounded-[24px] border border-[#1e2928]/10 bg-white p-5 shadow-[0_12px_36px_rgba(30,41,40,.06)] sm:p-6"
    >
      <div aria-hidden className="absolute -right-16 -top-20 size-52 rounded-full bg-[#f7d8c8]/45" />
      <div aria-hidden className="absolute -right-4 top-8 size-24 rounded-full bg-[#efb34b]/15" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold tracking-[.14em] text-[#b94a36]">CURRENT PLAN</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f0ea] px-2.5 py-1 text-[11px] font-semibold text-[#2c644e]">
              <span className="size-1.5 rounded-full bg-[#3f8b68]" />
              {status.label}
            </span>
          </div>
          <h1 id="plan-overview-title" className="mt-2 font-serif text-2xl font-semibold tracking-tight text-[#1e2928] sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#687370]">{status.description}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3 lg:min-w-[520px]">
          <Fact icon={CalendarDays} label="開催" value={`${dateLabel} ${eventTime}`} />
          <Fact icon={Users} label="人数" value={`${people}名`} />
          <Fact icon={WalletCards} label="予算 / 人" value={`${budget.toLocaleString()}円`} />
          <Fact icon={MapPin} label="場所" value={area} />
          <Fact icon={Search} label="候補" value={candidateCount ? `${candidateCount}件` : "未検索"} />
          <Fact icon={UtensilsCrossed} label="食事の配慮" value={hasAllergy ? "確認あり" : "未設定"} />
        </dl>
      </div>
    </section>
  );
}

export function CoordinationPreview({
  people,
  stage,
  hasAllergy,
}: {
  people: number;
  stage: Stage;
  hasAllergy: boolean;
}) {
  const confirmationStarted = stage === "collecting" || stage === "awaiting_approval" || stage === "scheduled";

  return (
    <div className="mb-4 overflow-hidden rounded-[24px] border border-[#1e2928]/10 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[#1e2928]/8 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-[11px] font-bold tracking-[.14em] text-[#b94a36]">PARTICIPANTS & CHAT</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight">参加者と連絡を、ひとつのグループに</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#687370]">
          グループを作成すると、各自が予約内容を確認でき、同じ場所でメッセージを共有できます。
        </p>
      </div>
      <div className="grid gap-px bg-[#1e2928]/8 sm:grid-cols-3">
        <CoordinationItem
          icon={Users}
          title="出欠・参加者"
          value={confirmationStarted ? `${people}名へ確認中` : "グループ作成後に確認"}
          description="回答状況と参加者の更新を一覧で確認"
        />
        <CoordinationItem
          icon={ShieldCheck}
          title="アレルギー"
          value={hasAllergy ? "店舗確認あり" : "個別に設定可能"}
          description="詳細は本人と幹事だけに限定して共有"
        />
        <CoordinationItem
          icon={MessageCircle}
          title="グループチャット"
          value="予約内容を送信可能"
          description="住所・日時・店舗情報を同じ会話で共有"
        />
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#f3f0e8] text-[#1f4b46]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold text-[#858c89]">{label}</dt>
        <dd className="mt-0.5 truncate font-semibold text-[#293432]">{value}</dd>
      </div>
    </div>
  );
}

function CoordinationItem({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="bg-[#fbfaf6] p-5">
      <span className="grid size-10 place-items-center rounded-2xl bg-[#e9efe9] text-[#1f4b46]">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-xs font-semibold text-[#737c79]">{title}</p>
      <p className="mt-1 font-semibold text-[#1e2928]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[#77807e]">{description}</p>
    </div>
  );
}
