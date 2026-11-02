import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {accessFromPath,workspacePath,authErrorMessage} from '../src/portal/login-view.mjs';

test('entry URL chooses presentation while verified account data alone chooses its workspace',()=>{
  assert.equal(accessFromPath('/portal/admin/'),'admin');assert.equal(accessFromPath('/portal/admin'),'admin');
  for(const path of ['/portal/','/portal/client/','/portal/?role=admin','/portal/administrator/'])assert.equal(accessFromPath(path),'client');
  assert.equal(workspacePath({admin:true}),'/portal/admin/');
  for(const account of [null,{}, {admin:false},{admin:'true'},{userMetadata:{roles:['admin']}},{roles:['admin']}])assert.equal(workspacePath(account),'/portal/client/');
});
test('credential rejection is clear and generic without repeating a server account identifier',()=>{
  const text=authErrorMessage({message:'invalid_grant: No user found with private@example.test, or password invalid.'});
  assert.match(text,/invited email address/);assert.doesNotMatch(text,/private@example|invalid_grant/);
  assert.match(authErrorMessage({message:'429 Too many requests'}),/wait a few minutes/);
  assert.equal(authErrorMessage({message:'Confirm your email before viewing projects.'}),'Confirm your email before viewing projects.');
});
for(const access of ['admin','client'])test(access+' entry is a real page with complete auth controls and no preset password',async()=>{
  const page=await readFile('SKTS-netlify/portal/'+access+'/index.html','utf8');
  for(const id of ['auth-screen','auth-form','email-label','password-label','password-confirm-label','auth-submit','auth-status','recovery-mode','login-mode','dashboard'])assert.match(page,new RegExp('id="'+id+'"'));
  assert.match(page,new RegExp('data-access="'+access+'"'));
  assert.match(page,new RegExp('href="/portal/'+access+'/" aria-current="page"'));
  assert.match(page,/src="\/portal\/assets\/app.js/);
  for(const input of page.match(/<input[^>]*type="password"[^>]*>/g))assert.doesNotMatch(input,/\bvalue=/);
  if(access==='admin')assert.match(page,/name="email"[^>]*value="skwebstudio18@gmail.com"/);
});
test('the legacy portal address remains a working client entry with invitation guidance',async()=>{
  const page=await readFile('SKTS-netlify/portal/index.html','utf8');assert.match(page,/data-access="client"/);assert.match(page,/received your SKTS invitation/);assert.match(page,/href="\/portal\/admin\/"/);
});
