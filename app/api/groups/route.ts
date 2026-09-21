import type { NextRequest } from 'next/server';
import { database } from '@/lib/server/db';
import { EMPTY_ALLERGY } from '@/lib/group-types';
import { newId,reservation } from '@/lib/server/groups';
import { equal,failure,hash,HttpError,limit,readBody,sessionResponse,short,token } from '@/lib/server/security';
export const runtime='nodejs';
export async function POST(req:NextRequest){return failure(async()=>{
 const body=await readBody(req);
 const key=process.env.ENCOPA_CREATE_KEY;
 if(process.env.NODE_ENV==='production'&&!key)throw new HttpError(503,'グループ作成の設定が必要です。管理者にお問い合わせください。');
 await limit('group-create-global',30,3600);
 if(key&&!equal(String(body.createKey??''),key))throw new HttpError(403,'グループ作成コードが違います。');
 const title=short(body.title,80,'会の名前'),name=short(body.name,30,'表示名'),booking=reservation(body.reservation);
 const id=newId(),mid=newId(),session=token(),invite=token(),now=Date.now();
 const db=await database();
 await db.batch([
 {sql:'INSERT INTO encopa_groups(id,title,invite_hash,invite_expires,reservation,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',args:[id,title,hash(invite),now+7*86400000,JSON.stringify(booking),now,now+90*86400000]},
 {sql:'INSERT INTO encopa_members(id,group_id,name,role,session_hash,expires_at,allergy,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[mid,id,name,'owner',hash(session),now+30*86400000,JSON.stringify(EMPTY_ALLERGY),now]},
 ],'write');
 return sessionResponse({id,invite,inviteExpiresAt:now+7*86400000},id,session);
})}
