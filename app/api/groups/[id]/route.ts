import type { NextRequest } from 'next/server';
import { database } from '@/lib/server/db';
import { allergy,group,member,newId,reservation,snapshot } from '@/lib/server/groups';
import { cookieName,equal,failure,hash,HttpError,limit,readBody,result,sessionResponse,short,token } from '@/lib/server/security';
import { EMPTY_ALLERGY } from '@/lib/group-types';
import { sealJson } from '@/lib/server/crypto';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,ctx:Context){return failure(async()=>{const {id}=await ctx.params;return result(await snapshot(req,id))})}
export async function POST(req:NextRequest,ctx:Context){return failure(async()=>{
 const {id}=await ctx.params;const body=await readBody(req);const db=await database();const g=await group(id);
 if(body.action==='join'){
  await limit(`join:${id}`,60,3600);
  const invite=short(body.invite,100,'招待リンク');
  if(Number(g.invite_expires)<Date.now()||!equal(hash(invite),String(g.invite_hash)))throw new HttpError(403,'招待リンクが無効か期限切れです。幹事に再発行を依頼してください。');
  try{await member(req,id,false,g);return result({joined:true})}catch(e){if(!(e instanceof HttpError&&e.status===401))throw e}
  const name=short(body.name,30,'表示名'),session=token(),mid=newId(),now=Date.now();
  const inserted=await db.execute({sql:`INSERT INTO encopa_members(id,group_id,name,role,session_hash,expires_at,allergy,created_at) SELECT ?,?,?,'member',?,?,?,? WHERE (SELECT COUNT(*) FROM encopa_members WHERE group_id=?)<200`,args:[mid,id,name,hash(session),now+30*86400000,sealJson(EMPTY_ALLERGY),now,id]});
  if(!inserted.rowsAffected)throw new HttpError(409,'このグループは参加人数の上限に達しています。');
  return sessionResponse({joined:true},id,session);
 }
 const me=await member(req,id,false,g);await limit(`write:${me.id}`,30);
 if(body.action==='message'){
  const text=short(body.text,2000,'メッセージ'),requestKey=short(body.requestKey,80,'送信ID');
  await db.execute({sql:"INSERT OR IGNORE INTO encopa_messages(id,group_id,author_id,author,kind,text,created_at,request_key) VALUES(?,?,?,?,'text',?,?,?)",args:[newId(),id,String(me.id),String(me.name),text,Date.now(),requestKey]});return result({ok:true});
 }
 if(body.action==='profile'){
  const profile=allergy(body.allergy),name=short(body.name,30,'表示名');
  await db.execute({sql:'UPDATE encopa_members SET name=?,allergy=? WHERE id=? AND group_id=?',args:[name,sealJson(profile),String(me.id),id]});return result({ok:true});
 }
 if(body.action==='leave'){
  if(me.role==='owner')throw new HttpError(409,'幹事はグループ終了から削除できます。');
  await db.batch([{sql:'DELETE FROM encopa_members WHERE id=? AND group_id=?',args:[String(me.id),id]},{sql:"UPDATE encopa_messages SET author='退会した参加者' WHERE author_id=? AND group_id=?",args:[String(me.id),id]}],'write');const r=result({ok:true});r.cookies.delete(cookieName(id));return r;
 }
 if(me.role!=='owner')throw new HttpError(403,'この操作は幹事のみ行えます。');
 if(body.action==='reservation'){
  const booking=reservation(body.reservation);
  if(!Number.isInteger(body.version))throw new HttpError(400,'更新情報を確認してください。');
  const updated=await db.execute({sql:'UPDATE encopa_groups SET reservation=?,version=version+1 WHERE id=? AND version=?',args:[sealJson(booking),id,Number(body.version)]});
  if(!updated.rowsAffected)throw new HttpError(409,'別の画面で内容が更新されました。再読み込みして確認してください。');return result({ok:true});
 }
 if(body.action==='share'){
  if(body.version!==Number(g.version))throw new HttpError(409,'予約内容が更新されています。最新内容を確認してください。');
  // Atomic version check prevents posting a stale snapshot after another tab edits it.
  const r=await db.execute({sql:`INSERT OR IGNORE INTO encopa_messages(id,group_id,author_id,author,kind,text,reservation,created_at,request_key) SELECT ?,?,?,?,'reservation','予約内容を共有しました',reservation,?,? FROM encopa_groups WHERE id=? AND version=?`,args:[newId(),id,String(me.id),String(me.name),Date.now(),`reservation-v${g.version}`,id,Number(g.version)]});
  if(!r.rowsAffected){const current=await group(id);if(current.version!==g.version)throw new HttpError(409,'予約内容が更新されています。再読み込みしてください。')}
  return result({ok:true});
 }
 if(body.action==='invite'){
  const invite=token(),expiresAt=Date.now()+7*86400000;await db.execute({sql:'UPDATE encopa_groups SET invite_hash=?,invite_expires=? WHERE id=?',args:[hash(invite),expiresAt,id]});return result({invite,inviteExpiresAt:expiresAt});
 }
 if(body.action==='remove'){
  const mid=short(body.memberId,36,'参加者');if(mid===me.id)throw new HttpError(400,'自分は削除できません。');
  await db.batch([{sql:"DELETE FROM encopa_members WHERE id=? AND group_id=? AND role='member'",args:[mid,id]},{sql:"UPDATE encopa_messages SET author='退会した参加者' WHERE author_id=? AND group_id=?",args:[mid,id]}],'write');
  // Existing invitation also expires; removed members cannot reuse it.
  await db.execute({sql:'UPDATE encopa_groups SET invite_hash=?,invite_expires=0 WHERE id=?',args:[hash(token()),id]});return result({ok:true});
 }
 if(body.action==='delete'){
  await db.batch([{sql:'DELETE FROM encopa_messages WHERE group_id=?',args:[id]},{sql:'DELETE FROM encopa_members WHERE group_id=?',args:[id]},{sql:'DELETE FROM encopa_groups WHERE id=?',args:[id]}],'write');const r=result({ok:true});r.cookies.delete(cookieName(id));return r;
 }
 throw new HttpError(400,'操作を確認してください。');
})}
