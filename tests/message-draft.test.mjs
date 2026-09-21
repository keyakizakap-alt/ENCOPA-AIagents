import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_KINDS, composeMessage, formatEventDate } from '../lib/message-draft.ts';

const reservation={venueName:'個室居酒屋 長崎 花あかり',address:'長崎県長崎市大黒町1-1',date:'2026-12-18',time:'19:00',people:18,price:5500,status:'planning',bookingReference:'タナカ',note:'19時に店前集合',website:'https://example.com/shop'};
const context={title:'忘年会2026',reservation,attending:3,pending:1};

test('the event date is read as a Japan-time calendar day', () => {
 assert.equal(formatEventDate('2026-12-18','19:00'),'12月18日(金) 19:00');
 // A date that cannot be parsed is passed through rather than rendering "Invalid Date".
 assert.equal(formatEventDate('2026-02-30','19:00').startsWith('2026-02-30')||formatEventDate('2026-02-30','19:00').includes('3月'),true);
});

test('each kind carries the facts that kind is for', () => {
 const announce=composeMessage('announce',context);
 assert.match(announce,/忘年会2026のお知らせ/);
 assert.match(announce,/12月18日\(金\) 19:00/);
 assert.match(announce,/個室居酒屋 長崎 花あかり/);
 assert.match(announce,/5,500円/);
 assert.match(announce,/https:\/\/example\.com\/shop/);

 const rsvp=composeMessage('rsvp',context);
 assert.match(rsvp,/参加 3名 \/ 未回答 1名/);

 const remind=composeMessage('remind',context);
 assert.match(remind,/長崎県長崎市大黒町1-1/);
 assert.match(remind,/タナカ/);
});

test('counts are left out when they are not known', () => {
 const rsvp=composeMessage('rsvp',{title:'忘年会2026',reservation});
 assert.ok(!rsvp.includes('現在の回答'));
});

test('optional reservation fields never leave a dangling label', () => {
 const bare={...reservation,address:'',bookingReference:'',note:'',website:'',venueName:''};
 for (const kind of MESSAGE_KINDS) {
  const text=composeMessage(kind,{title:'会',reservation:bare});
  assert.ok(!/：\s*$/m.test(text),`${kind} left an empty label`);
  assert.ok(text.trim().length>0);
  assert.ok(text.length<=2000);
 }
});

test('the draft stays within the message limit', () => {
 const long={...reservation,note:'あ'.repeat(1000),address:'い'.repeat(200),venueName:'う'.repeat(100)};
 for (const kind of MESSAGE_KINDS) assert.ok(composeMessage(kind,{title:'え'.repeat(80),reservation:long}).length<=2000);
});
