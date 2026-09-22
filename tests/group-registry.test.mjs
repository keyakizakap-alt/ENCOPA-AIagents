import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetGroup,knownGroups,rememberGroup } from '../lib/group-registry.ts';

class MemoryStorage {
  values=new Map();
  getItem(key){return this.values.get(key)??null}
  setItem(key,value){this.values.set(key,String(value))}
}

test('the browser group registry stores ids only and keeps the latest first',()=>{
 const localStorage=new MemoryStorage();let events=0;
 global.window={localStorage,dispatchEvent(){events+=1}};
 const first='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002';
 rememberGroup(first);rememberGroup(second);rememberGroup(first);
 assert.deepEqual(knownGroups().map(item=>item.id),[first,second]);
 const raw=localStorage.getItem('encopa-known-groups-v1');
 assert.ok(raw.includes(first));assert.ok(!raw.includes('invite'));assert.equal(events,3);
 forgetGroup(first,false);assert.deepEqual(knownGroups().map(item=>item.id),[second]);assert.equal(events,3);
 forgetGroup(second);assert.deepEqual(knownGroups(),[]);assert.equal(events,4);
 delete global.window;
});

test('invalid or tampered group records are ignored',()=>{
 const localStorage=new MemoryStorage();
 global.window={localStorage,dispatchEvent(){}};
 localStorage.setItem('encopa-known-groups-v1',JSON.stringify([{id:'not-a-group',lastOpenedAt:1},{id:'00000000-0000-4000-8000-000000000003',lastOpenedAt:'bad'}]));
 assert.deepEqual(knownGroups(),[]);
 delete global.window;
});
