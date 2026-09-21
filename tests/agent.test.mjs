import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';

const base=process.env.TEST_BASE_URL||'http://localhost:3010';
const mock=process.env.TEST_MOCK_BASE_URL||'http://127.0.0.1:3011';

const candidate={id:'shop-1',name:'テスト居酒屋',genre:'和食',address:'長崎県長崎市1-1',access:'長崎駅 徒歩3分',budgetLabel:'5000円',estimatedPrice:5000,partyCapacity:40,privateRoom:true,freeDrink:true,course:true,nonSmoking:'禁煙',openingHours:'17:00-23:00',closed:'日曜',score:88};
const plan=(overrides={})=>({purpose:'懇親会',area:'長崎県',budget:5500,people:4,priority:'balance',privateRoom:false,dietary:false,candidates:[candidate],...overrides});

// These tests present their own forwarded address so they consume their own per-client
// bucket instead of the one the rest of the suite shares.
const CLIENT='203.0.113.9';
async function post(body,{origin=base,client=CLIENT}={}){
 const r=await fetch(`${base}/api/agent`,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{}),...(client?{'X-Forwarded-For':client}:{})},body:JSON.stringify(body)});
 return {status:r.status,body:await r.json().catch(()=>null),cacheControl:r.headers.get('cache-control')};
}
/** Scripts the mock router and clears what it recorded. */
const control=script=>fetch(`${mock}/control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(script)}).then(r=>r.json());
const observed=()=>fetch(`${mock}/count`).then(r=>r.json());

test('an identical plan request is answered from cache without calling the router',async()=>{
 await control({mode:'ok'});
 const body=plan({purpose:'キャッシュ検証会'});
 const first=await post(body);
 assert.equal(first.status,200,JSON.stringify(first.body));
 assert.equal(first.body.available,true);
 assert.equal(first.body.recommendedVenueId,'shop-1');
 const afterFirst=(await observed()).count;
 assert.ok(afterFirst>0,'the first request reached the router');

 const second=await post(body);
 assert.equal(second.status,200);
 assert.equal(second.body.recommendedVenueId,first.body.recommendedVenueId);
 assert.equal(second.body.summary,first.body.summary);
 assert.equal((await observed()).count,afterFirst,'the router was not called again');
 assert.notEqual(second.body.traceId,first.body.traceId,'each response still carries its own trace id');
});

test('a plan written by another instance is served without calling the router',async()=>{
 // Nothing has ever requested this context, so no memory entry exists on this instance:
 // only the shared table can answer, and the mock is set to fail if it is reached.
 const body=plan({purpose:'別インスタンス検証会'});
 const fingerprint=`${candidate.id}:${candidate.score}`;
 const key=createHash('sha256').update(['v1',body.purpose,body.area,body.budget,body.people,body.priority,body.privateRoom,body.dietary,fingerprint].join('|')).digest('hex');
 const stored={available:true,traceId:'seeded',analysisDepth:'standard',recommendedVenueId:'shop-1',summary:'別インスタンスが生成した計画。',venueAdvice:[{venueId:'shop-1',score:80,reason:'保存済み'}],confirmationChecklist:['空席を確認'],nextActions:['店舗へ連絡'],shareDraft:'共有文',resolvedModels:['seeded-model']};
 const db=createClient({url:process.env.TURSO_DATABASE_URL||'file:data/encopa.db'});
 try {
  await db.execute({sql:'INSERT INTO encopa_agent_cache(key,plan,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET plan=excluded.plan,expires_at=excluded.expires_at',args:[key,JSON.stringify(stored),Date.now(),Date.now()+600000]});
 } finally { db.close() }

 await control({mode:'always_500'});
 const r=await post(body);
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.summary,'別インスタンスが生成した計画。');
 assert.equal(r.body.resolvedModels[0],'seeded-model');
 assert.equal((await observed()).count,0,'the router was never contacted');
});

test('a transient failure is retried rather than surfaced',async()=>{
 await control({mode:'http_500',remaining:1});
 const r=await post(plan({purpose:'再試行検証会'}));
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.available,true);
 assert.equal((await observed()).count,2,'one failure plus one retry');
});

test('a rejected request shape is retried with a minimal body',async()=>{
 // Reasoning-tier models refuse a non-default temperature and response_format, and want
 // max_completion_tokens. Without this retry, first contact fails permanently.
 await control({mode:'http_400',remaining:1});
 const r=await post(plan({purpose:'互換検証会'}));
 assert.equal(r.status,200,JSON.stringify(r.body));
 const {requests}=await observed();
 assert.equal(requests.length,2);
 assert.equal(requests[0].temperature,0.15);
 assert.equal(requests[0].responseFormat,'json_object');
 assert.equal(requests[1].temperature,null,'the retry drops temperature');
 assert.equal(requests[1].responseFormat,null,'the retry drops response_format');
 assert.equal(requests[1].maxTokens,null);
 assert.ok(requests[1].maxCompletionTokens>0,'the retry uses the newer token field');
});

test('a completion returned as content parts or in a code fence is still read',async()=>{
 await control({mode:'content_parts'});
 const parts=await post(plan({purpose:'パーツ検証会'}));
 assert.equal(parts.status,200,JSON.stringify(parts.body));
 assert.equal(parts.body.recommendedVenueId,'shop-1');

 await control({mode:'fenced'});
 const fenced=await post(plan({purpose:'フェンス検証会'}));
 assert.equal(fenced.status,200,JSON.stringify(fenced.body));
 assert.equal(fenced.body.recommendedVenueId,'shop-1');
});

test('the breaker stops calling the router after repeated failures',async()=>{
 await control({mode:'always_500'});
 for(let i=0;i<3;i+=1){
  const r=await post(plan({purpose:`ブレーカ検証会${i}`}));
  assert.equal(r.body.available,false);
 }
 const before=(await observed()).count;
 const blocked=await post(plan({purpose:'ブレーカ検証会オープン'}));
 assert.equal(blocked.body.available,false);
 assert.equal((await observed()).count,before,'no further request reached the router');

 // And it closes again, so one bad stretch does not disable planning for good.
 await control({mode:'ok'});
 await new Promise(resolve=>setTimeout(resolve,Number(process.env.TEST_BREAKER_COOLDOWN_MS||1500)+400));
 const recovered=await post(plan({purpose:'ブレーカ復旧検証会'}));
 assert.equal(recovered.status,200,JSON.stringify(recovered.body));
 assert.equal(recovered.body.available,true,'the breaker closed after its cooldown');
});

test('response headers carry the hardened policy',async()=>{
 const r=await fetch(base);
 assert.equal(r.status,200);
 const csp=r.headers.get('content-security-policy');
 assert.ok(csp,'Content-Security-Policy is set');
 for(const directive of ["default-src 'self'","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'"]) {
  assert.ok(csp.includes(directive),`CSP contains ${directive}`);
 }
 assert.ok(csp.includes("'strict-dynamic'"),'scripts are governed by strict-dynamic');
 assert.ok(!csp.includes("'unsafe-eval'"),'no unsafe-eval in a production build');
 assert.ok(csp.includes('https://imgfp.hotp.jp'),'venue photography is allowed to load');
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 assert.equal(r.headers.get('x-frame-options'),'DENY');
 assert.equal(r.headers.get('cross-origin-opener-policy'),'same-origin');
 assert.match(String(r.headers.get('strict-transport-security')),/^max-age=\d+$/,'HSTS without includeSubDomains');
 const room=await fetch(`${base}/groups/00000000-0000-4000-8000-000000000000`);
 assert.equal(room.headers.get('x-robots-tag'),'noindex, nofollow');
});

test('every script carries the nonce from this response, and it is never reused',async()=>{
 // A prerendered page cannot carry a per-request nonce, so its scripts would all be
 // blocked by the strict policy. This is the assertion that catches that regression.
 const nonceOf=headers=>/'nonce-([A-Za-z0-9+/=]+)'/.exec(headers.get('content-security-policy')??'')?.[1];
 const first=await fetch(base);
 const html=await first.text();
 const nonce=nonceOf(first.headers);
 assert.ok(nonce,'the policy carries a nonce');
 const tags=html.match(/<script[^>]*>/g)??[];
 assert.ok(tags.length>0,'the page ships scripts');
 for(const tag of tags) assert.ok(tag.includes(`nonce="${nonce}"`),`script is stamped with this response's nonce: ${tag.slice(0,80)}`);

 const second=await fetch(base);
 await second.text();
 assert.notEqual(nonceOf(second.headers),nonce,'a nonce is never reused across responses');
});
