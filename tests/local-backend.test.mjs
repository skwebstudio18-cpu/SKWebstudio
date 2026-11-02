import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openLocalDatabase} from '../server/local/database.mjs';
import {localApplication} from '../server/local/server.mjs';
const origin='http://localhost:8080', ownerEmail='skwebstudio18@gmail.com';
test('local owner login, record storage, access controls, backup and restart persistence',async()=>{
  await mkdir('.tools/local-tests',{recursive:true});
  const directory=await mkdtemp(resolve('.tools/local-tests/db-'));
  let local=await openLocalDatabase(directory),app=localApplication({pool:local.pool});
  const cookies=new Map();let csrf;
  const call=async(path,body,{method=body?'POST':'GET',requestOrigin=origin,token=csrf,withCookies=true,host=origin,form=false}={})=>{
    const request=new Request(host+path,{method,headers:{...(withCookies?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(body?{'content-type':form?'application/x-www-form-urlencoded':'application/json',...(requestOrigin?{origin:requestOrigin}:{}),...(token?{'x-skts-csrf':token}:{})}:{})},...(body?{body:form?new URLSearchParams(body).toString():JSON.stringify(body)}:{})});
    const response=await app(request),set=response.headers.get('set-cookie');
    if(set){const [key,value]=set.split(';')[0].split('=');cookies.set(key,value);}
    return response;
  };
  try{
    let config=await call('/api/local/config');assert.equal(config.status,200);assert.match(config.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);config=await config.json();csrf=config.csrf;assert.equal(config.setupNeeded,true);
    assert.equal((await call('/api/portal/admin/requests')).status,401);
    assert.equal((await call('/api/local/backup')).status,401);
    assert.equal((await call('/api/local/setup',{email:ownerEmail,password:'LocalTestPassword123!'},{requestOrigin:'http://evil.example'})).status,403);
    assert.equal((await call('/api/local/setup',{email:ownerEmail,password:'LocalTestPassword123!'},{token:'wrong'})).status,403);
    assert.equal((await call('/api/local/config',undefined,{host:'http://evil.example'})).status,403);
    assert.equal((await call('/api/local/setup',{email:'other@example.com',password:'LocalTestPassword123!'})).status,400);
    assert.equal((await call('/api/local/setup',{email:ownerEmail,password:'short'})).status,400);
    const created=await call('/api/local/setup',{email:ownerEmail,password:'LocalTestPassword123!',name:'Local test owner'});assert.equal(created.status,200);
    assert.match(created.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    assert.equal((await call('/api/local/setup',{email:ownerEmail,password:'AnotherTestPassword123!'})).status,409);
    assert.equal((await(await call('/api/portal/me')).json()).admin,true);
    const savedPassword=(await local.pool.query('SELECT password_hash FROM skts_local_owner')).rows[0].password_hash;assert.ok(savedPassword.startsWith('scrypt:'));assert.ok(!savedPassword.includes('LocalTestPassword'));
    const rawToken=cookies.get('skts_local_session');assert.notEqual((await local.pool.query('SELECT token_hash FROM skts_local_sessions LIMIT 1')).rows[0].token_hash,rawToken);
    const reference='SKTS-20261101-ABCDEF0000000001';
    const fields={'record-kind':'enquiry','request-reference':reference,email:'client@example.com',name:'Persistence test client',brief:'Local test only',consent:'Agreed'};
    assert.equal((await call('/api/local/intake',fields,{form:true})).status,201);
    assert.equal((await call('/api/local/intake',fields,{form:true})).status,201);
    let list=await(await call('/api/portal/admin/requests')).json();assert.equal(list.items.length,1);assert.equal(list.items[0].reference,reference);
    const update=await call('/api/portal/admin/requests/'+reference,{version:1,status:'in_progress',quote:'14999',message:'Local work started',internalNote:'Private note'},{method:'PATCH'});assert.equal(update.status,200);
    const backup=await(await call('/api/local/backup')).json();assert.equal(backup.skts_requests.length,1);assert.equal(backup.skts_request_events.length,4);assert.ok(!JSON.stringify(backup).includes('password_hash'));assert.ok(!JSON.stringify(backup).includes(rawToken));
    assert.equal((await call('/.data/skts-postgres')).status,404);
    await local.close();local=await openLocalDatabase(directory);app=localApplication({pool:local.pool});
    config=await(await call('/api/local/config')).json();csrf=config.csrf;assert.equal(config.setupNeeded,false);assert.equal(config.signedIn,true);
    list=await(await call('/api/portal/admin/requests')).json();assert.equal(list.items[0].status,'in_progress');
    assert.equal((await call('/api/local/logout',{})).status,200);
    assert.equal((await call('/api/portal/admin/requests')).status,401);
    assert.equal((await call('/api/local/login',{email:ownerEmail,password:'WrongPassword123!'})).status,401);
    assert.equal((await call('/api/local/login',{email:ownerEmail,password:'LocalTestPassword123!'})).status,200);
    await local.pool.query("UPDATE skts_local_sessions SET expires_at=now()-interval '1 minute'");
    assert.equal((await call('/api/portal/admin/requests')).status,401);
  }finally{await local.close();assert.ok(directory.startsWith(resolve('.tools/local-tests')+String.fromCharCode(92))||directory.startsWith(resolve('.tools/local-tests')+'/'));await rm(directory,{recursive:true,force:true});}
});
