import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { ALLERGENS,EMPTY_ALLERGY,type AllergyProfile,type Reservation } from '../group-types';
import { database } from './db';
import { openJson } from './crypto';
import { cookieName,hash,HttpError,short } from './security';
export function reservation(value:unknown):Reservation {
 if(!value||typeof value!=='object')throw new HttpError(400,'予約内容を入力してください。');
 const v=value as Record<string,unknown>;
 const date=short(v.date,10,'開催日'),time=short(v.time,5,'開催時刻');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isFinite(Date.parse(`${date}T${time}:00+09:00`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)throw new HttpError(400,'有効な日時を入力してください。');
 if(!Number.isInteger(v.people)||Number(v.people)<2||Number(v.people)>200||!Number.isInteger(v.price)||Number(v.price)<0||Number(v.price)>100000)throw new HttpError(400,'人数は2〜200名、1人分の費用は0〜100000円で入力してください。');
 if(!['planning','confirmed','cancelled'].includes(String(v.status)))throw new HttpError(400,'予約状況を選択してください。');
 const website=short(v.website??'',500,'店舗URL',false);if(website){try{const u=new URL(website);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw 0}catch{throw new HttpError(400,'店舗URLはhttpsまたはhttpで入力してください。')}}
 return {venueName:short(v.venueName,100,'店名'),address:short(v.address,200,'住所'),date,time,people:Number(v.people),price:Number(v.price),status:v.status as Reservation['status'],bookingReference:short(v.bookingReference??'',100,'予約番号',false),note:short(v.note??'',1000,'連絡事項',false),website};
}
export function allergy(value:unknown):AllergyProfile {
 if(!value||typeof value!=='object')throw new HttpError(400,'アレルギーの入力を確認してください。');const v=value as Record<string,unknown>;
 if(!['unanswered','none','selected'].includes(String(v.status)))throw new HttpError(400,'回答方法を選択してください。');
 if(v.status!=='selected')return {...EMPTY_ALLERGY,status:v.status as 'none'|'unanswered'};
 if(v.consent!==true||!Array.isArray(v.items)||!v.items.length||v.items.some(x=>!(ALLERGENS as readonly unknown[]).includes(x)))throw new HttpError(400,'対象を選び、幹事との共有に同意してください。');
 return {status:'selected',items:[...new Set(v.items as string[])],note:short(v.note??'',400,'補足',false),consent:true};
}
export async function group(id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(404,'グループが見つかりません。');const db=await database();const r=await db.execute({sql:'SELECT * FROM encopa_groups WHERE id=? AND expires_at>?',args:[id,Date.now()]});if(!r.rows.length)throw new HttpError(404,'グループが見つからないか、有効期限が切れています。');return r.rows[0]}
export async function member(req:NextRequest,id:string,owner=false,known?:Awaited<ReturnType<typeof group>>){if(!known)await group(id);const raw=req.cookies.get(cookieName(id))?.value;if(!raw)throw new HttpError(401,'招待リンクから参加してください。');const db=await database();const r=await db.execute({sql:'SELECT * FROM encopa_members WHERE group_id=? AND session_hash=? AND expires_at>?',args:[id,hash(raw),Date.now()]});if(!r.rows.length)throw new HttpError(401,'参加情報の有効期限が切れました。招待リンクから参加してください。');if(owner&&r.rows[0].role!=='owner')throw new HttpError(403,'この操作は幹事のみ行えます。');return r.rows[0]}
export async function snapshot(req:NextRequest,id:string){
 // The group row is read once and handed to member(), instead of each helper re-reading it:
 // the room polls this endpoint every 15 seconds per participant.
 const g=await group(id);const me=await member(req,id,false,g);const db=await database();
 const [members,messages]=await Promise.all([db.execute({sql:'SELECT id,name,role,allergy FROM encopa_members WHERE group_id=? ORDER BY created_at',args:[id]}),db.execute({sql:'SELECT * FROM (SELECT rowid AS seq,* FROM encopa_messages WHERE group_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at,seq',args:[id]})]);
 return {id,title:g.title,reservation:openJson(String(g.reservation)),version:Number(g.version),expiresAt:Number(g.expires_at),me:{id:me.id,name:me.name,role:me.role,allergy:openJson(String(me.allergy))},members:members.rows.map(m=>({id:m.id,name:m.name,role:m.role,...(me.role==='owner'?{allergy:openJson(String(m.allergy))}:{})})),messages:messages.rows.map(m=>({id:m.id,authorId:m.author_id,author:m.author,kind:m.kind,text:m.text,reservation:m.reservation?openJson(String(m.reservation)):null,createdAt:Number(m.created_at)}))};
}
export const newId=()=>randomUUID();
