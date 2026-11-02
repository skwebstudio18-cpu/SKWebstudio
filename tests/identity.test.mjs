import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifiedUserReader} from '../server/identity/verified-user.mjs';
import {identity} from '../server/portal/model.mjs';
import {createHandler} from '../server/portal/api.mjs';
const claims={id:'verified-session-id',email:'client@example.test',roles:[]};
test('JWT-only users load confirmation from the matching Identity account without acquiring new roles',async()=>{
  const reader=verifiedUserReader({getUser:async()=>claims,readUser:async id=>{assert.equal(id,claims.id);return {...claims,confirmedAt:'2026-11-02',roles:['admin']};}});
  const user=await reader();assert.equal(user.confirmedAt,'2026-11-02');assert.equal(identity(user).admin,false);
});
test('anonymous and already confirmed SDK users do not trigger an operator lookup',async()=>{
  let reads=0;for(const user of [null,{...claims,confirmedAt:'2026-11-02'}]){
    assert.equal(await verifiedUserReader({getUser:async()=>user,readUser:async()=>{reads++;}})(),user);
  }assert.equal(reads,0);
});
test('unconfirmed accounts still cannot reach private records after authoritative lookup',async()=>{
  let queries=0;
  const fn=createHandler({getUser:verifiedUserReader({getUser:async()=>claims,readUser:async()=>({...claims,userMetadata:{confirmedAt:'forged'}})}),repository:()=>{queries++;}});
  assert.equal((await fn(new Request('https://example.netlify.app/api/portal/requests'))).status,403);assert.equal(queries,0);
});
test('a stale email or mismatched account ID cannot reuse the authenticated session',async()=>{
  for(const account of [{...claims,id:'other',confirmedAt:'2026-11-02'},{...claims,email:'other@example.test',confirmedAt:'2026-11-02'}]){
    await assert.rejects(verifiedUserReader({getUser:async()=>claims,readUser:async()=>account}),error=>error.status===403);
  }
});
test('Identity account lookup failures fail closed without touching records or leaking details',async()=>{
  let queries=0;
  const fn=createHandler({getUser:verifiedUserReader({getUser:async()=>claims,readUser:async()=>{throw Error('private upstream response');}}),repository:()=>{queries++;}});
  const response=await fn(new Request('https://example.netlify.app/api/portal/requests'));
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private upstream/);assert.equal(queries,0);
});
