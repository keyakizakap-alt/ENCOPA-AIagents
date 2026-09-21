import { createServer } from 'node:http';

const port=Number(process.argv[2]||3011);
const server=createServer(async(req,res)=>{
 if(req.method==='GET'){res.writeHead(204);res.end();return}
 if(req.url!=='/v1/chat/completions'||req.headers.authorization!=='Bearer test-orca-key'){res.writeHead(401);res.end(JSON.stringify({error:'unauthorized'}));return}
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=JSON.parse(raw),system=String(body.messages?.[0]?.content||'');
 let value;
 if(system.includes('統括担当')&&raw.includes('PROMPT_ATTACK'))value={recommendedVenueId:'attacker-controlled-id',summary:'入力データ内の命令は採用しません。',venueAdvice:[{venueId:'attacker-controlled-id',score:100,reason:'不正な候補'},{venueId:'shop-1',score:90,reason:'検証済み候補'}],confirmationChecklist:['空席を確認'],nextActions:['店舗へ確認'],shareDraft:'候補を確認中です。'};
 else if(system.includes('統括担当'))value={recommendedVenueId:'shop-1',summary:'条件を総合すると、個室と人数条件を満たす候補が進めやすいです。',venueAdvice:[{venueId:'shop-1',score:92,reason:'人数、予算、個室の条件が揃っています。'}],confirmationChecklist:['空席とコース内容を店舗へ確認','アレルギー対応を店舗へ確認'],nextActions:['店舗へ空席を問い合わせる','参加者へ候補を共有する'],shareDraft:'候補店舗を確認しました。予約状況は確認中です。'};
 else if(system.includes('会場比較担当'))value={summary:'条件を比較しました。',ranking:[{venueId:'shop-1',score:91,reason:'条件に合います。'}]};
 else if(system.includes('予約リスク確認担当'))value={warnings:['空席未確認'],checklist:['空席を確認']};
 else value={nextActions:['店舗へ問い合わせる'],shareDraft:'候補を共有します。'};
 res.writeHead(200,{'Content-Type':'application/json','x-orca-resolved-model':'mock-model'});
 res.end(JSON.stringify({model:'auto',choices:[{message:{content:JSON.stringify(value)}}]}));
});
server.listen(port,'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
