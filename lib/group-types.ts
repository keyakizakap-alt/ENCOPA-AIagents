export const ALLERGENS = ['えび','かに','くるみ','小麦','そば','卵','乳','落花生','アーモンド','あわび','いか','いくら','オレンジ','カシューナッツ','キウイフルーツ','牛肉','ごま','さけ','さば','大豆','鶏肉','バナナ','豚肉','マカダミアナッツ','もも','やまいも','りんご','ゼラチン','その他'] as const;
export type AllergyProfile = { status:'unanswered'|'none'|'selected'; items:string[]; note:string; consent:boolean };
export const EMPTY_ALLERGY: AllergyProfile = {status:'unanswered',items:[],note:'',consent:false};
export type Reservation = { venueName:string; address:string; date:string; time:string; people:number; price:number; status:'planning'|'confirmed'|'cancelled'; bookingReference:string; shareBookingReference?:boolean; note:string; website:string };
/** 出欠。未回答が既定で、答えるまで人数に数えない（fail-closed）。 */
export type Rsvp = 'pending'|'yes'|'no';
export const RSVP_ORDER: readonly Rsvp[] = ['yes','no','pending'];
export const RSVP_LABELS: Record<Rsvp,string> = {yes:'参加',no:'不参加',pending:'未回答'};
export type Attendance = { rsvp:Rsvp; affiliation:string; answeredAt:number };
export const EMPTY_ATTENDANCE: Attendance = {rsvp:'pending',affiliation:'',answeredAt:0};
export type GroupMessage = { id:string; authorId:string; author:string; kind:'text'|'reservation'; text:string; reservation:Reservation|null; createdAt:number };
export type GroupView = { id:string; title:string; reservation:Reservation; version:number; me:{id:string;name:string;role:'owner'|'member';allergy:AllergyProfile}&Attendance; members:({id:string;name:string;role:string;allergy?:AllergyProfile}&Attendance)[]; messages:GroupMessage[]; expiresAt:number };
export const STATUS_LABELS = {planning:'調整中・予約未確定',confirmed:'予約済み（幹事が確認）',cancelled:'中止'} as const;
