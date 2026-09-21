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
 // Venue rows outlive expires_at so an expired one can still answer while the provider
 // is down; they are dropped once they are too old to be worth showing at all.
 {sql:'DELETE FROM encopa_venue_cache WHERE created_at<=?',args:[now-24*60*60*1000]},
],'write');
db.close();console.log('Expired group data, rate-limit records and cached model output removed.');
