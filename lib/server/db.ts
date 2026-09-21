import { createClient, type Client } from '@libsql/client';
import { mkdirSync } from 'node:fs';
let client:Client|undefined;
let initialized:Promise<void>|undefined;
export async function database() {
  if (!client) {
    const url=process.env.TURSO_DATABASE_URL;
    if (process.env.VERCEL && (!url || url.startsWith('file:'))) throw new Error('DB_NOT_CONFIGURED');
    if (!url) mkdirSync('data',{recursive:true});
    client=createClient({url:url||'file:data/encopa.db',authToken:process.env.TURSO_AUTH_TOKEN});
  }
  initialized ??= client.batch([
    `CREATE TABLE IF NOT EXISTS encopa_groups(id TEXT PRIMARY KEY,title TEXT NOT NULL,invite_hash TEXT NOT NULL,invite_expires INTEGER NOT NULL,reservation TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS encopa_members(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES encopa_groups(id) ON DELETE CASCADE,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','member')),session_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,allergy TEXT NOT NULL,created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS encopa_members_group ON encopa_members(group_id)`,
    `CREATE TABLE IF NOT EXISTS encopa_messages(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES encopa_groups(id) ON DELETE CASCADE,author_id TEXT NOT NULL,author TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,reservation TEXT,created_at INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(group_id,author_id,request_key))`,
    `CREATE INDEX IF NOT EXISTS encopa_messages_group ON encopa_messages(group_id,created_at)`,
    `CREATE TABLE IF NOT EXISTS encopa_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    // Shared across every serverless instance, so a warm instance's answer is reusable by the rest.
    // Holds only generated ranking commentary keyed by a hash of the search criteria - no member data.
    `CREATE TABLE IF NOT EXISTS encopa_ai_cache(key TEXT PRIMARY KEY,summary TEXT NOT NULL,model TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS encopa_ai_cache_expiry ON encopa_ai_cache(expires_at)`,
  ],'write').then(()=>{}).catch(e=>{initialized=undefined;throw e});
  await initialized;
  return client;
}
