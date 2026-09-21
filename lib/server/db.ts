import { createClient, type Client } from '@libsql/client';
import { mkdirSync } from 'node:fs';
let client:Client|undefined;
let initialized:Promise<void>|undefined;
// Columns added after the first release. The CREATE TABLE below carries them so a fresh
// database is correct in one statement; these ALTERs bring an existing one forward without
// touching a single stored row. SQLite has no ADD COLUMN IF NOT EXISTS, so a second run is
// recognised by the error it raises rather than by reading the schema back.
const ADDED_COLUMNS = [
  `ALTER TABLE encopa_members ADD COLUMN rsvp TEXT NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE encopa_members ADD COLUMN affiliation TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE encopa_members ADD COLUMN answered_at INTEGER NOT NULL DEFAULT 0`,
];
async function added(db:Client) {
  for (const sql of ADDED_COLUMNS) {
    try { await db.execute(sql) } catch (e) {
      if (!/duplicate column name/i.test(e instanceof Error?e.message:String(e))) throw e;
    }
  }
}
export async function database() {
  if (!client) {
    const url=process.env.TURSO_DATABASE_URL;
    if (process.env.VERCEL && (!url || url.startsWith('file:'))) throw new Error('DB_NOT_CONFIGURED');
    if (!url) mkdirSync('data',{recursive:true});
    client=createClient({url:url||'file:data/encopa.db',authToken:process.env.TURSO_AUTH_TOKEN});
  }
  initialized ??= client.batch([
    `CREATE TABLE IF NOT EXISTS encopa_groups(id TEXT PRIMARY KEY,title TEXT NOT NULL,invite_hash TEXT NOT NULL,invite_expires INTEGER NOT NULL,reservation TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS encopa_members(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES encopa_groups(id) ON DELETE CASCADE,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','member')),session_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,allergy TEXT NOT NULL,created_at INTEGER NOT NULL,rsvp TEXT NOT NULL DEFAULT 'pending',affiliation TEXT NOT NULL DEFAULT '',answered_at INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS encopa_members_group ON encopa_members(group_id)`,
    `CREATE TABLE IF NOT EXISTS encopa_messages(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES encopa_groups(id) ON DELETE CASCADE,author_id TEXT NOT NULL,author TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,reservation TEXT,created_at INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(group_id,author_id,request_key))`,
    `CREATE INDEX IF NOT EXISTS encopa_messages_group ON encopa_messages(group_id,created_at)`,
    `CREATE TABLE IF NOT EXISTS encopa_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    // Shared across every serverless instance, so a plan one instance paid up to four
    // routed calls for is reusable by the rest. Keyed by a hash of the search context
    // and the candidate ids - no member data, no criteria in clear text.
    `CREATE TABLE IF NOT EXISTS encopa_agent_cache(key TEXT PRIMARY KEY,plan TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS encopa_agent_cache_expiry ON encopa_agent_cache(expires_at)`,
    // Shared across every serverless instance, so a warm instance's answer is reusable by the rest.
    // Holds only generated ranking commentary keyed by a hash of the search criteria - no member data.
    `CREATE TABLE IF NOT EXISTS encopa_ai_cache(key TEXT PRIMARY KEY,summary TEXT NOT NULL,model TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS encopa_ai_cache_expiry ON encopa_ai_cache(expires_at)`,
    // The provider call depends only on the prefecture and the party size, so one stored
    // response serves every budget, priority and purpose asked about the same area. Rows
    // are kept past expires_at on purpose: an expired row is what the route serves when the
    // provider is down, rather than failing the search outright.
    `CREATE TABLE IF NOT EXISTS encopa_venue_cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS encopa_venue_cache_created ON encopa_venue_cache(created_at)`,
  ],'write').then(()=>added(client!)).catch(e=>{initialized=undefined;throw e});
  await initialized;
  return client;
}
