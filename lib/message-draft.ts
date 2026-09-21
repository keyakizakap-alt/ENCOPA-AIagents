import type { Reservation } from './group-types';

/**
 * 参加者へ送る文面を、保存済みのデータだけから組み立てます。
 *
 * 生成にモデルを使わないのは、文面の材料が予約内容と出欠の集計というすでに検証済みの
 * 値だけで足りるからです。表示名・所属・補足のような参加者が書いた文字列は混ぜません。
 * 混ぜればその文字列がそのままプロンプトになり、出力がグループへ投稿される経路になります。
 * APIキーが無い状態でも、モデルが落ちている間も、同じ文面が出ます。
 */
export const MESSAGE_KINDS = ['announce', 'rsvp', 'remind'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  announce: '開催のお知らせ',
  rsvp: '出欠のお願い',
  remind: '当日のご案内',
};

export type DraftContext = { title: string; reservation: Reservation; attending?: number; pending?: number };

/** 日本時間の暦日として読み、曜日まで添えます。 */
export function formatEventDate(date: string, time: string): string {
  const parsed = new Date(`${date}T12:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return `${date} ${time}`;
  const day = parsed.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' });
  return `${day} ${time}`;
}

export function composeMessage(kind: MessageKind, { title, reservation, attending, pending }: DraftContext): string {
  const when = formatEventDate(reservation.date, reservation.time);
  const price = `${reservation.price.toLocaleString('ja-JP')}円`;
  const lines: string[] = [];
  if (kind === 'announce') {
    lines.push(`【${title}のお知らせ】`, '');
    lines.push(`日時：${when}`);
    if (reservation.venueName) lines.push(`お店：${reservation.venueName}`);
    if (reservation.address) lines.push(`住所：${reservation.address}`);
    lines.push(`会費：お一人 ${price}（予定）`);
    if (reservation.note) lines.push('', reservation.note);
    lines.push('', 'グループの「出欠の回答」から、参加・不参加を選んでください。');
    if (reservation.website) lines.push('', `お店のページ：${reservation.website}`);
  } else if (kind === 'rsvp') {
    lines.push('【出欠のご回答をお願いします】', '');
    lines.push(`${when}${reservation.venueName ? ` / ${reservation.venueName}` : ''}`);
    if (typeof attending === 'number' && typeof pending === 'number') {
      lines.push('', `現在の回答：参加 ${attending}名 / 未回答 ${pending}名`);
    }
    lines.push('', 'まだの方は、グループの「出欠の回答」から選んでください。', 'お店への人数連絡があるため、早めに回答いただけると助かります。');
  } else {
    lines.push('【当日のご案内】', '');
    lines.push(`${when} に${reservation.venueName ? `「${reservation.venueName}」` : 'お店'}へお集まりください。`);
    if (reservation.address) lines.push(`住所：${reservation.address}`);
    if (reservation.bookingReference) lines.push(`予約名：${reservation.bookingReference}`);
    if (reservation.note) lines.push('', reservation.note);
    lines.push('', '遅れそうなときは、このグループにひとことお願いします。');
  }
  // 投稿先の上限に合わせて切り詰めます。組み立て側で長さが決まるので通常は届きません。
  return lines.join('\n').slice(0, 2000);
}
