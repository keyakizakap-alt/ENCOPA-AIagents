import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://localhost:3010';
const createKey=process.env.TEST_CREATE_KEY||'local-integration-test-only';
const booking={venueName:'テスト会場（架空）',address:'東京都千代田区丸の内1丁目',date:'2026-12-18',time:'19:00',people:8,price:5000,status:'planning',bookingReference:'',note:'テスト用の予約情報',website:'https://example.com'};
async function call(path,body,cookie,origin=base){const r=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','Origin':origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
test('venue search validates input and keeps the provider key server-side',async()=>{
 const invalid=await call('/api/venues',{purpose:'会食',area:'長崎駅',budget:999,people:4,priority:'balance',privateRoom:false,dietary:false});assert.equal(invalid.status,400);
 const unavailable=await call('/api/venues',{purpose:'会食',area:'長崎駅',budget:5000,people:4,priority:'balance',privateRoom:false,dietary:false});assert.equal(unavailable.status,503);assert.match(unavailable.body.error,/設定/);
});
test('group membership, allergies, chat, reservation sharing and revocation',async t=>{
 const bad=await call('/api/groups',{title:'test',name:'test',reservation:booking,createKey:'bad'});assert.equal(bad.status,403);
 const created=await call('/api/groups',{title:'統合テスト用グループ',name:'幹事テスト',reservation:booking,createKey});assert.equal(created.status,200,JSON.stringify(created.body));const {id,invite}=created.body;const owner=created.cookie,path=`/api/groups/${id}`;
 try {
  await t.test('anonymous cannot read reservation',async()=>{assert.equal((await call(path)).status,401)});
  const a=await call(path,{action:'join',invite,name:'参加者A'});assert.equal(a.status,200,JSON.stringify(a.body));const alice=a.cookie;
  const b=await call(path,{action:'join',invite,name:'参加者B'});assert.equal(b.status,200);const bob=b.cookie;
  await t.test('participant views persisted reservation',async()=>{const r=await call(path,undefined,alice);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.reservation.address,booking.address);assert.equal(r.body.members.length,3)});
  await t.test('allergy consent required and private to self and owner',async()=>{
   const profile={status:'selected',items:['卵','乳'],note:'テスト回答',consent:false};assert.equal((await call(path,{action:'profile',name:'参加者A',allergy:profile},alice)).status,400);
   assert.equal((await call(path,{action:'profile',name:'参加者A',allergy:{...profile,consent:true}},alice)).status,200);
   const self=await call(path,undefined,alice),other=await call(path,undefined,bob),org=await call(path,undefined,owner);
   assert.deepEqual(self.body.me.allergy.items,['卵','乳']);assert.ok(other.body.members.every(m=>!Object.hasOwn(m,'allergy')));assert.deepEqual(org.body.members.find(m=>m.name==='参加者A').allergy.items,['卵','乳']);
  });
  await t.test('non-owner cannot edit or share reservation',async()=>{assert.equal((await call(path,{action:'reservation',reservation:booking,version:1},alice)).status,403);assert.equal((await call(path,{action:'share',version:1},alice)).status,403)});
  await t.test('message visible to second member and retries do not duplicate',async()=>{const payload={action:'message',text:'<script>not executable</script> テスト連絡',requestKey:'test-send-1'};assert.equal((await call(path,payload,alice)).status,200);assert.equal((await call(path,payload,alice)).status,200);const r=await call(path,undefined,bob);assert.equal(r.body.messages.length,1);assert.equal(r.body.messages[0].text,payload.text)});
  await t.test('reservation snapshot posts once per version',async()=>{assert.equal((await call(path,{action:'share',version:1},owner)).status,200);assert.equal((await call(path,{action:'share',version:1},owner)).status,200);let r=await call(path,undefined,bob);assert.equal(r.body.messages.filter(m=>m.kind==='reservation').length,1);assert.equal(r.body.messages[1].reservation.status,'planning');
   assert.equal((await call(path,{action:'reservation',reservation:{...booking,status:'confirmed'},version:1},owner)).status,200);
   assert.equal((await call(path,{action:'reservation',reservation:booking,version:1},owner)).status,409);assert.equal((await call(path,{action:'share',version:1},owner)).status,409);
   assert.equal((await call(path,{action:'share',version:2},owner)).status,200);r=await call(path,undefined,alice);assert.equal(r.body.reservation.status,'confirmed');assert.equal(r.body.messages.at(-1).reservation.status,'confirmed');assert.equal(r.body.messages[1].reservation.status,'planning');
  });
  await t.test('CSRF, unsafe URLs, and invalid calendar dates rejected',async()=>{assert.equal((await call(path,{action:'message',text:'bad',requestKey:'bad'},alice,'https://evil.example')).status,403);assert.equal((await call(path,{action:'reservation',reservation:{...booking,website:'javascript:alert(1)'},version:2},owner)).status,400);assert.equal((await call(path,{action:'reservation',reservation:{...booking,date:'2026-02-30'},version:2},owner)).status,400)});
  await t.test('group isolation',async()=>{const second=await call('/api/groups',{title:'別の会',name:'別幹事',reservation:booking,createKey});try{assert.equal((await call(`/api/groups/${second.body.id}`,undefined,alice)).status,401)}finally{await call(`/api/groups/${second.body.id}`,{action:'delete'},second.cookie)}});
  await t.test('rotated link fails and removal revokes session',async()=>{const v=await call(path,{action:'invite'},owner);assert.equal(v.status,200);assert.equal((await call(path,{action:'join',invite,name:'旧リンク'})).status,403);const members=await call(path,undefined,owner);const mid=members.body.members.find(m=>m.name==='参加者B').id;assert.equal((await call(path,{action:'remove',memberId:mid},owner)).status,200);assert.equal((await call(path,undefined,bob)).status,401);assert.equal((await call(path,{action:'join',invite:v.body.invite,name:'旧リンク2'})).status,403)});
  await t.test('unanswered removes allergy details',async()=>{assert.equal((await call(path,{action:'profile',name:'参加者A',allergy:{status:'unanswered'}},alice)).status,200);const r=await call(path,undefined,owner);assert.deepEqual(r.body.members.find(m=>m.name==='参加者A').allergy.items,[])});
 } finally {assert.equal((await call(path,{action:'delete'},owner)).status,200);assert.equal((await call(path,undefined,owner)).status,404)}
});
