import { createClient } from '@libsql/client';
const url=process.env.TURSO_DATABASE_URL||'file:data/encopa.db';
const db=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});
const now=Date.now();
await db.batch([
 {sql:'DELETE FROM encopa_messages WHERE group_id IN (SELECT id FROM encopa_groups WHERE expires_at<=?)',args:[now]},
 {sql:'DELETE FROM encopa_members WHERE group_id IN (SELECT id FROM encopa_groups WHERE expires_at<=?)',args:[now]},
 {sql:'DELETE FROM encopa_groups WHERE expires_at<=?',args:[now]},
 {sql:'DELETE FROM encopa_limits WHERE expires_at<=?',args:[now]},
 {sql:'DELETE FROM encopa_agent_cache WHERE expires_at<=?',args:[now]},
 {sql:'DELETE FROM encopa_ai_cache WHERE expires_at<=?',args:[now]},
],'write');
db.close();console.log('Expired group data, rate-limit records and cached model output removed.');
