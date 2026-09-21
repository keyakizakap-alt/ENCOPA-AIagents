import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';

const base=process.env.TEST_BASE_URL||'http://localhost:3010';
const mock=process.env.TEST_HOTPEPPER_MOCK_URL||'http://127.0.0.1:3012';
const cooldown=Number(process.env.ENCOPA_VENUE_BREAKER_COOLDOWN_MS||1500);

const search=async(overrides={},origin=base)=>{
 const body={purpose:'懇親会',area:'東京都',prefectureCode:'Z011',budget:5500,people:10,priority:'balance',privateRoom:true,dietary:false,...overrides};
 const r=await fetch(`${base}/api/venues`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
};
const script=async(value)=>{await fetch(`${mock}/control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})};
const calls=async()=>(await (await fetch(`${mock}/count`)).json()).count;
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
// Each test needs its own cache entry; the key is the area and the party size.
let party=20;
const freshParty=()=>({people:party++});

test('a stored response answers every search of the same area and party size',async()=>{
 await script({mode:'ok'});
 const p=freshParty();
 const first=await search(p);
 assert.equal(first.status,200,JSON.stringify(first.body));
 assert.equal(first.body.venues.length,3);
 assert.equal(first.body.total,128);
 assert.equal(first.body.stale,undefined);
 assert.equal(await calls(),1);

 // Budget, priority and purpose change the ranking, not the request to the provider.
 const second=await search({...p,budget:12000,priority:'cost',purpose:'歓迎会'});
 assert.equal(second.status,200);
 assert.equal(second.body.venues.length,3);
 assert.equal(await calls(),1,'the second search must not reach the provider');

 // A different party size is a different request, so it does.
 assert.equal((await search(freshParty())).status,200);
 assert.equal(await calls(),2);
});

test('a 5xx is retried once, a rejected key is not',async()=>{
 await script({mode:'http_500',remaining:1});
 const ok=await search(freshParty());
 assert.equal(ok.status,200,JSON.stringify(ok.body));
 assert.equal(await calls(),2,'one failure plus one retry');

 await script({mode:'key_error'});
 const rejected=await search(freshParty());
 assert.equal(rejected.status,503);
 assert.match(rejected.body.error,/接続設定/);
 assert.equal(await calls(),1,'a rejected key must not be retried');
 assert.ok(!JSON.stringify(rejected.body).includes('test-hotpepper-key'));
});

test('a stored answer is served when the provider is down, and says so',async()=>{
 await script({mode:'ok'});
 const p=freshParty();
 assert.equal((await search(p)).status,200);

 // Age the row past its freshness so the next search goes to the provider. Within the
 // process there is no way to move the clock, and a fresh row would simply be reused.
 const db=createClient({url:process.env.TURSO_DATABASE_URL});
 try{await db.execute({sql:'UPDATE encopa_venue_cache SET created_at=?,expires_at=? WHERE key=(SELECT key FROM encopa_venue_cache ORDER BY created_at DESC LIMIT 1)',args:[Date.now()-60*60*1000,Date.now()-30*60*1000]})}finally{db.close()}

 await script({mode:'always_500'});
 // Same area and party size, so the aged response is there to fall back to.
 const stale=await search({...p,budget:7000});
 assert.equal(stale.status,200,JSON.stringify(stale.body));
 assert.equal(stale.body.stale,true,'a stored answer must declare itself');
 assert.equal(stale.body.venues.length,3);
 assert.ok(stale.body.fetchedAt>0);
 assert.ok(Date.now()-stale.body.fetchedAt>30*60*1000,'the response reports when it was taken, not now');
});

test('with nothing stored, a failing provider is an error and trips the breaker',async()=>{
 await script({mode:'always_500'});
 const first=await search(freshParty());
 assert.equal(first.status,502,JSON.stringify(first.body));

 // Three consecutive failures open the circuit; after that nothing reaches the provider.
 await search(freshParty());
 await search(freshParty());
 const before=await calls();
 const blocked=await search(freshParty());
 assert.equal(blocked.status,503);
 assert.match(blocked.body.error,/混み合って/);
 assert.equal(await calls(),before,'an open circuit must not spend a provider call');

 // It closes again on its own, without a deploy or a manual reset.
 await script({mode:'ok'});
 await wait(cooldown+300);
 const recovered=await search(freshParty());
 assert.equal(recovered.status,200,JSON.stringify(recovered.body));
});

test('the search is rejected from another origin',async()=>{
 await script({mode:'ok'});
 assert.equal((await search(freshParty(),'https://evil.example')).status,403);
});

// Last: it spends the day's remaining provider budget on purpose.
test('the daily ceiling stops spending rather than slowing it down',async()=>{
 await script({mode:'ok'});
 let capped=null;
 for (let i=0;i<40 && !capped;i+=1) {
  const r=await search(freshParty());
  if (r.status===429) capped=r;
 }
 assert.ok(capped,'the daily ceiling was never reached');
 assert.match(capped.body.error,/上限/);
 const before=await calls();
 assert.equal((await search(freshParty())).status,429,'the ceiling holds');
 assert.equal(await calls(),before,'no provider call is made past the ceiling');
});
