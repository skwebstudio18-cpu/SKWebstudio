import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {verifyRequestOrigin} from '@netlify/identity';
import {DocumentRepository} from '../server/documents/repository.mjs';
import {localDocumentStore} from '../server/documents/local-store.mjs';
import {readUpload,reviewInput,MAX_FILE_BYTES} from '../server/documents/files.mjs';
import {createHandler} from '../server/portal/api.mjs';
import {PortalRepository} from '../server/portal/repository.mjs';
import {documentsSection} from '../src/portal/documents-view.mjs';
import {cloudDocumentStore} from '../server/documents/cloud-store.mjs';
const origin='https://example.netlify.app',reference='SKTS-20261102-0000000000000021',otherReference='SKTS-20261102-0000000000000022';
const client={id:'client',email:'client@example.test',admin:false},owner={id:'owner',email:'owner@example.test',admin:true},outsider={id:'outsider',email:'outsider@example.test',admin:false};
const user=actor=>actor&&({id:actor.id,email:actor.email,roles:actor.admin?['admin']:[],confirmedAt:'2026-11-02'});
let database,pool,docs,files=new Map(),writes=0,reads=0,failWrites=false,documentId,firstVersion;
const store={async put(key,bytes){writes++;if(failWrites)throw Error('isolated storage failure');if(files.has(key))assert.deepEqual(files.get(key),bytes);files.set(key,Buffer.from(bytes));},async get(key){reads++;return files.get(key)??null;}};
const handler=actor=>createHandler({getUser:async()=>user(actor),getSettings:async()=>({autoconfirm:false}),verifyRequestOrigin,repository:()=>new PortalRepository(pool),documents:()=>docs});
const uploadRequest=({ref=reference,id=randomUUID(),document='',title='Requirements',bytes='Project requirements',filename='requirements.txt',requestOrigin=origin}={})=>{
  const body=new FormData();body.set('uploadId',id);body.set('documentId',document);body.set('title',title);body.set('file',new File([bytes],filename));
  return new Request(origin+'/api/portal/requests/'+ref+'/documents',{method:'POST',headers:requestOrigin?{origin:requestOrigin}:{},body});
};
const get=(path,actor=client)=>handler(actor)(new Request(origin+'/api/portal/requests/'+path));
const review=(id,body,actor=owner)=>handler(actor)(new Request(origin+'/api/portal/admin/requests/'+reference+'/documents/'+id+'/review',{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
before(async()=>{
  database=new NetlifyDB({logger:()=>{}});const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;docs=new DocumentRepository(pool,store);
  for(const [ref,email]of [[reference,client.email],[otherReference,outsider.email]])await pool.query("INSERT INTO skts_requests(reference,kind,customer_email,customer_name) VALUES ($1,'enquiry',$2,'Test client')",[ref,email]);
});
after(async()=>{await pool?.end();await database?.stop();});
test('document endpoints deny anonymous, unconfirmed and unrelated customers before storage access',async()=>{
  const beforeReads=reads,beforeWrites=writes;
  assert.equal((await get(reference+'/documents',null)).status,401);
  for(const path of [reference+'/documents',reference+'/documents/'+randomUUID()+'/download'])assert.equal((await get(path,outsider)).status,404);
  assert.equal((await handler(outsider)(uploadRequest())).status,404);assert.equal(reads,beforeReads);assert.equal(writes,beforeWrites);
});
test('uploads enforce origin checks before accepting any file',async()=>{
  for(const requestOrigin of [undefined,'https://evil.example']){
    const request=uploadRequest({requestOrigin:requestOrigin??null});assert.equal((await handler(client)(request)).status,403);
  }assert.equal(writes,0);
});
test('invalid, empty, disguised, unsafe and oversized files fail without storage writes',async()=>{
  for(const input of [{filename:'payload.html',bytes:'<script>bad</script>'},{filename:'fake.pdf',bytes:'not a pdf'},{filename:'empty.txt',bytes:''},{filename:'null.txt',bytes:Buffer.from([0,1])},{filename:'large.txt',bytes:Buffer.alloc(MAX_FILE_BYTES+1,65)}]){
    const response=await handler(client)(uploadRequest(input));assert.ok([400,413,415].includes(response.status),await response.text());
  }
  const request=uploadRequest();const form=await request.formData();form.set('file',new File(['ok'],'bad\r\n.txt'));assert.equal((await handler(client)(new Request(origin+'/api/portal/requests/'+reference+'/documents',{method:'POST',headers:{origin},body:form}))).status,400);
  assert.equal(writes,0);
});
test('a client upload stores private metadata and repeated requests create one version and timeline event',async()=>{
  firstVersion=randomUUID();const response=await handler(client)(uploadRequest({id:firstVersion}));assert.equal(response.status,201,await response.clone().text());documentId=(await response.json()).documentId;
  assert.equal((await handler(client)(uploadRequest({id:firstVersion}))).status,201);assert.equal(writes,1);
  const data=await(await get(reference+'/documents')).json();assert.equal(data.items.length,1);assert.equal(data.items[0].versions.length,1);assert.equal(data.items[0].versions[0].status,'received');
  assert.doesNotMatch(JSON.stringify(data),/storage_key|sha256|projects\//);assert.equal((await pool.query('SELECT count(*)::int AS n FROM skts_request_events WHERE request_reference=$1',[reference])).rows[0].n,1);
  assert.equal((await handler(client)(uploadRequest({id:firstVersion,bytes:'changed bytes'}))).status,409);
});
test('downloads require project ownership, preserve bytes, and force non-cacheable attachment responses',async()=>{
  const response=await get(reference+'/documents/'+firstVersion+'/download');assert.equal(response.status,200);assert.equal(await response.text(),'Project requirements');
  assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy'),/sandbox/);
  assert.equal((await get(otherReference+'/documents/'+firstVersion+'/download',outsider)).status,404);
});
test('only admins review documents, stale reviews fail and comments remain in review history',async()=>{
  const input={status:'approved',note:'Requirements approved for development.',revision:1};
  assert.equal((await review(firstVersion,input,client)).status,403);assert.equal((await review(firstVersion,input)).status,200);
  assert.equal((await review(firstVersion,input)).status,409);const data=await(await get(reference+'/documents')).json();assert.equal(data.items[0].versions[0].status,'approved');assert.equal(data.items[0].versions[0].reviews.length,1);
  assert.throws(()=>reviewInput({...input,note:''}));assert.throws(()=>reviewInput({...input,status:'received'}));
});
test('new versions preserve the approved original and start a separate received review',async()=>{
  const response=await handler(client)(uploadRequest({document:documentId,bytes:'Revised requirements',filename:'revision.txt'}));assert.equal(response.status,201);
  const data=await(await get(reference+'/documents')).json();const versions=data.items[0].versions;assert.deepEqual(versions.map(v=>v.version),[2,1]);assert.equal(versions[0].status,'received');assert.equal(versions[1].status,'approved');assert.equal(versions[1].reviews.length,1);
  assert.equal(await(await get(reference+'/documents/'+firstVersion+'/download')).text(),'Project requirements');
});
test('forged document IDs cannot attach a file or review to another project',async()=>{
  const previous=writes;assert.equal((await handler(outsider)(uploadRequest({ref:otherReference,document:documentId}))).status,404);assert.equal(writes,previous);
  const request=new Request(origin+'/api/portal/admin/requests/'+otherReference+'/documents/'+firstVersion+'/review',{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify({status:'approved',note:'Forged scope',revision:2})});assert.equal((await handler(owner)(request)).status,404);
});
test('concurrent version uploads serialize per project without overwriting files',async()=>{
  const responses=await Promise.all([handler(client)(uploadRequest({document:documentId,bytes:'Concurrent A'})),handler(client)(uploadRequest({document:documentId,bytes:'Concurrent B'}))]);assert.ok(responses.every(r=>r.status===201));
  const data=await(await get(reference+'/documents')).json();assert.deepEqual(data.items[0].versions.map(v=>v.version),[4,3,2,1]);
});
test('storage failure rolls back metadata and can be retried with the same upload ID',async()=>{
  const id=randomUUID(),previous=(await docs.list(client,reference)).items.length;failWrites=true;
  await assert.rejects(()=>docs.upload(client,reference,{id,documentId:null,title:'Failure fixture',filename:'test.txt',mediaType:'text/plain',bytes:Buffer.from('retry bytes')}));failWrites=false;
  assert.equal((await docs.list(client,reference)).items.length,previous);
  const response=await handler(client)(uploadRequest({id,title:'Failure fixture',bytes:'retry bytes'}));assert.equal(response.status,201);
});
test('file integrity mismatches fail closed instead of returning corrupted bytes',async()=>{
  const key='projects/'+reference+'/'+firstVersion,original=files.get(key);files.set(key,Buffer.from('corrupt'));
  assert.equal((await get(reference+'/documents/'+firstVersion+'/download')).status,503);files.set(key,original);
});
test('local private file storage survives adapter restart and rejects path traversal',async()=>{
  await mkdir('.tools/document-tests',{recursive:true});const directory=await mkdtemp(resolve('.tools/document-tests/files-'));
  try{const key='projects/'+reference+'/'+randomUUID(),bytes=Buffer.from('Persistent private document');await localDocumentStore(directory).put(key,bytes);assert.deepEqual(await localDocumentStore(directory).get(key),bytes);await assert.rejects(()=>localDocumentStore(directory).put('../escape',bytes));await assert.rejects(()=>localDocumentStore(directory).put(key,Buffer.from('overwrite')));}
  finally{await rm(directory,{recursive:true,force:true});}
});
test('document UI escapes names and review text and hides admin review controls for clients',async()=>{
  const data=await docs.list(client,reference);data.items[0].title='<img src=x onerror=alert(1)>';
  const clientHtml=documentsSection(data,false,reference),adminHtml=documentsSection(data,true,reference);
  assert.ok(clientHtml.includes('&lt;img'));assert.ok(!clientHtml.includes('<img'));assert.ok(!clientHtml.includes('<form class="document-review '));assert.ok(adminHtml.includes('<form class="document-review '));assert.ok(clientHtml.includes('Versions &amp; review history'));
});
test('preview document storage never opens the production site-wide store',()=>{
  for(const context of ['deploy-preview','branch-deploy','dev','production']){
    let site=0,deploy=0;
    cloudDocumentStore({context:{deploy:{context}},siteStore:options=>{site++;assert.equal(options.name,'skts-project-files-production');assert.equal(options.consistency,'strong');return {};},deployStore:options=>{deploy++;assert.equal(options.name,'skts-project-files-preview');return {};}});
    assert.equal(site,context==='production'?1:0);assert.equal(deploy,context==='production'?0:1);
  }
});
