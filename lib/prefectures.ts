export type Prefecture = { code: string; name: string };

export const PREFECTURE_REGIONS: ReadonlyArray<{ name: string; prefectures: ReadonlyArray<Prefecture> }> = [
  { name: "北海道", prefectures: [{ code: "Z041", name: "北海道" }] },
  { name: "東北", prefectures: [
    { code: "Z051", name: "青森県" }, { code: "Z052", name: "岩手県" }, { code: "Z053", name: "宮城県" },
    { code: "Z054", name: "秋田県" }, { code: "Z055", name: "山形県" }, { code: "Z056", name: "福島県" },
  ] },
  { name: "関東", prefectures: [
    { code: "Z015", name: "茨城県" }, { code: "Z016", name: "栃木県" }, { code: "Z017", name: "群馬県" },
    { code: "Z013", name: "埼玉県" }, { code: "Z014", name: "千葉県" }, { code: "Z011", name: "東京都" }, { code: "Z012", name: "神奈川県" },
  ] },
  { name: "北陸・甲信越", prefectures: [
    { code: "Z061", name: "新潟県" }, { code: "Z062", name: "富山県" }, { code: "Z063", name: "石川県" },
    { code: "Z064", name: "福井県" }, { code: "Z065", name: "山梨県" }, { code: "Z066", name: "長野県" },
  ] },
  { name: "東海", prefectures: [
    { code: "Z031", name: "岐阜県" }, { code: "Z032", name: "静岡県" }, { code: "Z033", name: "愛知県" }, { code: "Z034", name: "三重県" },
  ] },
  { name: "関西", prefectures: [
    { code: "Z021", name: "滋賀県" }, { code: "Z022", name: "京都府" }, { code: "Z023", name: "大阪府" },
    { code: "Z024", name: "兵庫県" }, { code: "Z025", name: "奈良県" }, { code: "Z026", name: "和歌山県" },
  ] },
  { name: "中国", prefectures: [
    { code: "Z071", name: "鳥取県" }, { code: "Z072", name: "島根県" }, { code: "Z073", name: "岡山県" },
    { code: "Z074", name: "広島県" }, { code: "Z075", name: "山口県" },
  ] },
  { name: "四国", prefectures: [
    { code: "Z081", name: "徳島県" }, { code: "Z082", name: "香川県" }, { code: "Z083", name: "愛媛県" }, { code: "Z084", name: "高知県" },
  ] },
  { name: "九州・沖縄", prefectures: [
    { code: "Z091", name: "福岡県" }, { code: "Z092", name: "佐賀県" }, { code: "Z093", name: "長崎県" },
    { code: "Z094", name: "熊本県" }, { code: "Z095", name: "大分県" }, { code: "Z096", name: "宮崎県" },
    { code: "Z097", name: "鹿児島県" }, { code: "Z098", name: "沖縄県" },
  ] },
];

export const PREFECTURES = PREFECTURE_REGIONS.flatMap((region) => region.prefectures);

export function prefectureByCode(value: unknown) {
  return typeof value === "string" ? PREFECTURES.find((prefecture) => prefecture.code === value) : undefined;
}

export function prefectureFromLabel(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return PREFECTURES.find((prefecture) => normalized.includes(prefecture.name) || normalized.includes(prefecture.name.replace(/[都道府県]$/, "")));
}
