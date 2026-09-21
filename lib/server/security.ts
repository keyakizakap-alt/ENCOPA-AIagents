import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { database } from './db';
export class HttpError extends Error { constructor(public status:number,message:string){super(message)} }
export const token=()=>randomBytes(32).toString('base64url');
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export const equal=(a:string,b:string)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
export const cookieName=(id:string)=>`encopa_${id}`;
export const traceId=()=>randomUUID();
/** Structured, user-data-free log line. Correlates a response with server logs through traceId. */
export function log(event:string,fields:Record<string,string|number|boolean|null>){
 try{console.log(JSON.stringify({level:'info',app:'encopa',event,at:new Date().toISOString(),...fields}))}catch{}
}
export function logError(event:string,fields:Record<string,string|number|boolean|null>){
 try{console.error(JSON.stringify({level:'error',app:'encopa',event,at:new Date().toISOString(),...fields}))}catch{}
}
export function result(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})}
export function sessionResponse(data:unknown,id:string,secret:string){const r=result(data);r.cookies.set(cookieName(id),secret,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:30*86400});return r}
export function checkOrigin(req:NextRequest){const origin=req.headers.get('origin'); const expected=process.env.APP_ORIGIN||req.nextUrl.origin;if(!origin||origin!==new URL(expected).origin)throw new HttpError(403,'この操作はアプリの画面から行ってください。')}
export async function readBody(req:NextRequest){
 checkOrigin(req); if(!req.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'JSON形式で送信してください。');
 const reader=req.body?.getReader(); if(!reader)throw new HttpError(400,'入力がありません。');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();throw new HttpError(413,'入力が長すぎます。')}chunks.push(part.value)}
 try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw 0;return v as Record<string,unknown>}catch{throw new HttpError(400,'入力を確認してください。')}
}
export async function limit(key:string,max:number,seconds=60){
 const db=await database(); const bucket=Math.floor(Date.now()/(seconds*1000));
 const r=await db.execute({sql:'INSERT INTO encopa_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',args:[hash(`${key}:${bucket}`),Date.now()+seconds*2000]});
 const count=Number(r.rows[0].count);
 if(count>max)throw new HttpError(429,'操作が続いています。少し待ってから再度お試しください。');
 return count;
}
export async function failure(run:()=>Promise<NextResponse>){try{return await run()}catch(e){if(e instanceof HttpError)return result({error:e.message},e.status);if(e instanceof Error&&e.message==='DB_NOT_CONFIGURED')return result({error:'共有機能の接続設定が必要です。管理者にお問い合わせください。'},503);if(e instanceof Error&&['DATA_KEY_NOT_CONFIGURED','DATA_KEY_INVALID','SENSITIVE_DATA_INVALID'].includes(e.message))return result({error:'保護されたデータの設定を確認してください。管理者にお問い合わせください。'},503);const trace=traceId();logError('request_failed',{traceId:trace,error:e instanceof Error?e.name:'unknown'});return result({error:'保存できませんでした。少し待って再度お試しください。',traceId:trace},503)}}
export function short(value:unknown,max:number,label:string,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new HttpError(400,`${label}を確認してください。`);return value.trim()}
