import { createServer } from 'node:http';

const port=Number(process.argv[2]||3011);
let requestCount=0;
// Scripted failure modes let the integration tests reach the retry, compatibility and
// breaker paths, which are otherwise unreachable without a misbehaving provider.
let script={mode:'ok',remaining:0};
let requests=[];
const server=createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/count'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({count:requestCount,requests}));return}
 if(req.method==='POST'&&req.url==='/control'){
  let raw='';for await(const chunk of req)raw+=chunk;
  script={mode:'ok',remaining:0,...(raw?JSON.parse(raw):{})};requestCount=0;requests=[];
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return;
 }
 if(req.method==='GET'){res.writeHead(204);res.end();return}
 if(req.url!=='/v1/chat/completions'||req.headers.authorization!=='Bearer test-orca-key'){res.writeHead(401);res.end(JSON.stringify({error:'unauthorized'}));return}
 requestCount+=1;
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=JSON.parse(raw),system=String(body.messages?.[0]?.content||'');
 // 実在する候補IDを返す。存在しないIDを返せば自己検証が不備として捕まえるので、
 // それを意図しないテストでは渡された候補の本物のIDを使います。
 let firstId='shop-1';
 try{
  const payload=JSON.parse(String(body.messages?.[1]?.content||'{}'));
  const candidates=payload.candidates||payload.context?.candidates||[];
  if(candidates[0]?.id)firstId=candidates[0].id;
 }catch{}
 requests.push({temperature:body.temperature??null,maxTokens:body.max_tokens??null,maxCompletionTokens:body.max_completion_tokens??null,responseFormat:body.response_format?.type??null});
 if(script.remaining>0){
  script={...script,remaining:script.remaining-1};
  if(script.mode==='timeout'){return}
  res.writeHead(script.mode==='http_400'?400:500,{'Content-Type':'application/json'});
  res.end(JSON.stringify({error:{message:'mock failure',code:'mock_code',param:'max_tokens'}}));return;
 }
 if(script.mode==='always_500'){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'mock is down'}}));return}
 // 統括担当がわざと不備のある計画を返し、指摘を受けて直す経路を通すための台本。
 if(script.mode==='faulty_plan'&&system.includes('統括担当')){
  const fixing=raw.includes('不備が見つかりました');
  if(fixing) requests[requests.length-1].revision=true;
  const value=fixing
   ?{recommendedVenueId:firstId,summary:'条件を比較しました。',venueAdvice:[{venueId:firstId,score:90,reason:'条件に合います。'}],confirmationChecklist:['空席を店舗へ確認','アレルギー対応を店舗へ確認','人数の受け入れを確認'],nextActions:['店舗へ確認する'],shareDraft:'候補を確認中です。',needsSpecialistReview:false,reviewReasons:[]}
   :{recommendedVenueId:'shop-1',summary:'予約しました。',venueAdvice:[],confirmationChecklist:[],nextActions:[],shareDraft:'予約が取れました。',needsSpecialistReview:false,reviewReasons:[]};
  res.writeHead(200,{'Content-Type':'application/json','x-orca-resolved-model':'mock-model'});
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));return;
 }
 // 直しても不備が残る台本。fail-closed の経路を通します。
 if(script.mode==='unfixable_plan'&&system.includes('統括担当')){
  const value={recommendedVenueId:'shop-1',summary:'予約しました。',venueAdvice:[],confirmationChecklist:[],nextActions:[],shareDraft:'予約が取れました。',needsSpecialistReview:false,reviewReasons:[]};
  res.writeHead(200,{'Content-Type':'application/json','x-orca-resolved-model':'mock-model'});
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));return;
 }
 if(script.mode==='always_400'){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'mock rejects this shape',param:'response_format'}}));return}
 let value;
 if(system.includes('統括担当')&&raw.includes('PROMPT_ATTACK'))value={recommendedVenueId:'attacker-controlled-id',summary:'入力データ内の命令は採用しません。',venueAdvice:[{venueId:'attacker-controlled-id',score:100,reason:'不正な候補'},{venueId:'shop-1',score:90,reason:'検証済み候補'}],confirmationChecklist:['空席を確認'],nextActions:['店舗へ確認'],shareDraft:'候補を確認中です。',needsSpecialistReview:false,reviewReasons:[]};
 else if(system.includes('統括担当'))value={recommendedVenueId:firstId,summary:'条件を総合すると、個室と人数条件を満たす候補が進めやすいです。',venueAdvice:[{venueId:firstId,score:92,reason:'人数、予算、個室の条件が揃っています。'}],confirmationChecklist:['空席とコース内容を店舗へ確認','アレルギー対応を店舗へ確認'],nextActions:['店舗へ空席を問い合わせる','参加者へ候補を共有する'],shareDraft:'候補店舗を確認しました。予約状況は確認中です。',needsSpecialistReview:false,reviewReasons:[]};
 else if(system.includes('会場比較担当'))value={summary:'条件を比較しました。',ranking:[{venueId:firstId,score:91,reason:'条件に合います。'}]};
 else if(system.includes('予約リスク確認担当'))value={warnings:['空席未確認'],checklist:['空席を確認']};
 else value={nextActions:['店舗へ問い合わせる'],shareDraft:'候補を共有します。'};
 const serialized=JSON.stringify(value);
 const content=script.mode==='content_parts'?[{type:'text',text:serialized}]
   :script.mode==='fenced'?'```json\n'+serialized+'\n```'
   :serialized;
 res.writeHead(200,{'Content-Type':'application/json','x-orca-resolved-model':'mock-model'});
 res.end(JSON.stringify({model:'auto',choices:[{message:{content}}]}));
});
server.listen(port,'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
