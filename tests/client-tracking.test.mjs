import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {openLocalDatabase} from '../server/local/database.mjs';
import {LocalOwnerAuth,sessionCookie} from '../server/local/auth.mjs';
import {PortalRepository} from '../server/portal/repository.mjs';
import {createHandler} from '../server/portal/api.mjs';
import {billingUpdate,serviceUpdate,reminderStage,financials,indiaDay} from '../server/portal/tracking.mjs';
import {paymentUpdate} from '../server/portal/model.mjs';
import {runReminders} from '../server/reminders/delivery.mjs';
import {metaConfig,sendMetaTemplate} from '../server/reminders/meta.mjs';
import {createWhatsAppWebhook} from '../server/reminders/webhook.mjs';
import {localApplication} from '../server/local/server.mjs';
let local,repo,owner,customer,reference,otherReference,auth,root;
const now=new Date('2026-11-01T04:00:00Z');
const configuration=metaConfig(key=>({WHATSAPP_SEND_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:'test-only-token',WHATSAPP_PHONE_NUMBER_ID:'1234567890',WHATSAPP_GRAPH_VERSION:'v99.0',WHATSAPP_TEMPLATE_NAME:'test_payment_reminder',WHATSAPP_APP_SECRET:'test-only-secret',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'test-only-verify'})[key]);
const origin='http://localhost:8080';
const ownerRequest=token=>new Request(origin+'/api/portal/me',{headers:{cookie:sessionCookie+'='+token}});
const api=(actor,path,method='GET',body)=>createHandler({authenticate:async()=>actor,verifyRequestOrigin:()=>{},repository:()=>repo})(new Request(origin+'/api/portal'+path,{method,headers:{'content-type':'application/json',origin},...(body?{body:JSON.stringify(body)}:{})}));
const plan=(version,extra={})=>billingUpdate({version,agreed:true,dueDate:'2026-11-01',dueAmount:'5000',reminders:true,schedule:'due_and_overdue',phone:'+15555550123',optedIn:true,consentNote:'TEST ONLY: recorded consent in isolated database',...extra});
before(async()=>{await mkdir('.tools/client-tests',{recursive:true});root=await mkdtemp(resolve('.tools/client-tests/db-'));local=await openLocalDatabase(root);repo=new PortalRepository(local.pool);auth=new LocalOwnerAuth(local.pool,'skwebstudio18@gmail.com');const token=await auth.setup({email:'skwebstudio18@gmail.com',password:'TestOwnerPassword123!'});owner=await auth.actor(ownerRequest(token));});
after(async()=>{await local?.close();assert.ok(root.startsWith(resolve('.tools/client-tests')+sep));await rm(root,{recursive:true,force:true});});
test('admin creates client projects with separate service rows and no assumed budget agreement',async()=>{
  reference=(await repo.createProject(owner,{email:'client-a@example.com',name:'Test client A',business:'Test institution',services:'Website development\nMobile app development\nGoogle Business Profile',quote:'20000'})).reference;
  otherReference=(await repo.createProject(owner,{email:'client-b@example.com',name:'Test client B',services:'Digital branding',quote:'1000'})).reference;
  const data=await repo.request(owner,reference);assert.equal(data.services.length,3);assert.ok(data.services.every(s=>s.status==='pending'));assert.equal(data.project.budget_agreed,false);assert.equal(data.project.outstanding_paise,null);
});
test('private client invitations activate single-use, non-admin accounts limited to their own records',async()=>{
  const invite=await auth.invite(owner,{email:'client-a@example.com',name:'Test client A'});
  const token=await auth.acceptInvite({token:invite.token,password:'TestClientPassword123!',roles:['admin']});customer=await auth.actor(ownerRequest(token));assert.equal(customer.admin,false);assert.equal(customer.email,'client-a@example.com');
  assert.equal((await localApplication({pool:local.pool})(new Request(origin+'/api/local/backup',{headers:{cookie:sessionCookie+'='+token}}))).status,403);
  await assert.rejects(()=>auth.acceptInvite({token:invite.token,password:'NewClientPassword123!'}),/expired|used/);
  await assert.rejects(()=>auth.invite(customer,{email:'client-b@example.com'}),/Administrator/);
  await assert.rejects(()=>auth.invite(owner,{email:'skwebstudio18@gmail.com'}),/client email/);
  assert.equal((await api(customer,'/admin/requests')).status,403);assert.equal((await api(customer,'/requests/'+otherReference)).status,404);
  const projects=(await(await api(customer,'/requests')).json()).items;assert.equal(projects.length,1);assert.equal(projects[0].reference,reference);
});
test('expired invitations and disabled client accounts cannot authenticate',async()=>{
  const invite=await auth.invite(owner,{email:'client-b@example.com',name:'Test client B'});
  await local.pool.query("UPDATE skts_local_invites SET expires_at=now()-interval '1 minute' WHERE client_id=(SELECT id FROM skts_local_clients WHERE email='client-b@example.com')");
  await assert.rejects(()=>auth.acceptInvite({token:invite.token,password:'ExpiredTestPassword123!'}),/expired/);
  await local.pool.query("UPDATE skts_local_clients SET disabled=true WHERE email='client-a@example.com'");
  await assert.rejects(()=>auth.login({email:'client-a@example.com',password:'TestClientPassword123!'}),/incorrect/);
  await local.pool.query("UPDATE skts_local_clients SET disabled=false WHERE email='client-a@example.com'");
});
test('service states persist and a service from another project cannot be moved',async()=>{
  let data=await repo.request(owner,reference);
  const services=data.services.map((s,i)=>({...s,status:['completed','in_progress','pending'][i]}));
  await repo.updateServices(owner,reference,serviceUpdate({version:data.project.version,services}));
  data=await repo.request(customer,reference);assert.deepEqual(data.services.map(s=>s.status),['completed','in_progress','pending']);
  const foreign=(await repo.request(owner,otherReference)).services[0];
  await assert.rejects(()=>repo.updateServices(owner,reference,serviceUpdate({version:data.project.version,services:[foreign]})),/does not belong/);
  await assert.rejects(()=>repo.updateServices(customer,reference,serviceUpdate({version:data.project.version,services})),/Administrator/);
});
test('agreed budget and payment plan expose accurate customer balances while keeping consent notes private',async()=>{
  const data=await repo.request(owner,reference);await repo.updateBilling(owner,reference,plan(data.project.version));
  const own=(await repo.request(customer,reference)).project;assert.equal(own.outstanding_paise,2000000);assert.equal(own.due_paise,500000);assert.equal(own.verified_paid_paise,0);assert.equal(own.whatsapp_consent_note,undefined);
  assert.throws(()=>plan(own.version,{phone:'9840407296'}),/country code/);assert.throws(()=>plan(own.version,{optedIn:false}),/consent/);
  await assert.rejects(()=>repo.updateBilling(owner,reference,plan(own.version,{dueAmount:'25000'})),/cannot exceed/);
});
const payment=(ref,amount,utr)=>({reference:ref,kind:'payment',projectReference:reference,email:'client-a@example.com',name:'Test client A',amount,transactionReference:utr,date:'2026-11-01',brief:'TEST ONLY; no actual payment'});
test('unverified payments pause reminders; verified payments reduce due and total balance',async()=>{
  const ref='SKTS-PAY-20261101-1111111111111111';await repo.ingest(payment(ref,200000,'TEST-UTR-A'));
  let sends=0;await runReminders({pool:local.pool,config:configuration,now,send:async()=>{sends++;return {status:'accepted',messageId:'wamid.not-used'};}});assert.equal(sends,0);
  await repo.reviewPayment(owner,ref,paymentUpdate({version:1,status:'verified',amount:'2000',note:'Isolated test only',bankChecked:true}));
  const project=(await repo.request(customer,reference)).project;assert.equal(project.verified_paid_paise,200000);assert.equal(project.outstanding_paise,1800000);assert.equal(project.due_paise,300000);
  const draft=await api(owner,'/admin/requests/'+reference+'/reminder-preview');assert.equal(draft.status,200);const text=await draft.json();assert.match(text.text,/3,000.00/);assert.match(text.url,/https:\/\/wa.me\/15555550123/);assert.equal((await api(customer,'/admin/requests/'+reference+'/reminder-preview')).status,403);assert.equal((await local.pool.query('SELECT count(*) FROM skts_reminder_deliveries')).rows[0].count,'0');
});
test('concurrent reminder runs send at most once per project/date/stage',async()=>{
  assert.equal(configuration.configured,true);
  const eligible=await repo.reminderCandidates(indiaDay(now));
  assert.ok(eligible.some(p=>p.reference===reference),'Due project must be selected by the database query');
  assert.equal(reminderStage(eligible.find(p=>p.reference===reference),now),'due');
  let sends=0;const run=()=>runReminders({pool:local.pool,config:configuration,now,send:async()=>{sends++;return {status:'accepted',messageId:'wamid.test-due'};}});
  await Promise.all([run(),run()]);await run();assert.equal(sends,1);assert.equal((await repo.request(owner,reference)).reminders[0].status,'accepted');
});
function callback(status,id='wamid.test-due',timestamp='1793505600'){
  return JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:configuration.phoneId},statuses:[{id,status,timestamp}]}}]}]});
}
const hook=()=>createWhatsAppWebhook({pool:local.pool,config:configuration});
function signed(raw,signature){return new Request('https://example.test/api/whatsapp/webhook',{method:'POST',headers:{'x-hub-signature-256':signature??'sha256='+createHmac('sha256',configuration.appSecret).update(raw).digest('hex')},body:raw});}
test('Meta callbacks require a valid signature and cannot downgrade delivered/read statuses',async()=>{
  assert.equal((await hook()(signed(callback('delivered'),'invalid'))).status,403);
  assert.equal((await hook()(signed(callback('delivered')))).status,200);
  await hook()(signed(callback('sent')));await hook()(signed(callback('read')));await hook()(signed(callback('failed','wamid.test-due','1793505700')));
  assert.equal((await repo.request(owner,reference)).reminders[0].status,'read');
});
test('a delivery callback arriving before the send response is reconciled correctly',async()=>{
  let sends=0;
  await runReminders({pool:local.pool,config:configuration,now:new Date('2026-11-04T04:00:00Z'),send:async()=>{sends++;await hook()(signed(callback('delivered','wamid.test-overdue','1793764800')));return {status:'accepted',messageId:'wamid.test-overdue'};}});
  assert.equal(sends,1);assert.ok((await repo.request(owner,reference)).reminders.some(r=>r.stage==='overdue'&&r.status==='delivered'));
});
test('STOP messages withdraw consent, and fully paid or cancelled projects cannot generate reminders',async()=>{
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:configuration.phoneId},messages:[{id:'wamid.test-stop',type:'text',from:'15555550123',text:{body:'STOP'}}]}}]}]});await hook()(signed(raw));await hook()(signed(raw));
  const stopped=(await repo.request(owner,reference)).project;assert.equal(stopped.reminder_enabled,false);assert.equal(stopped.whatsapp_opted_in_at,null);assert.equal((await api(owner,'/admin/requests/'+reference+'/reminder-preview')).status,400);
  const ref='SKTS-PAY-20261101-2222222222222222';await repo.ingest(payment(ref,1800000,'TEST-UTR-B'));await repo.reviewPayment(owner,ref,paymentUpdate({version:1,status:'verified',amount:'18000',note:'Isolated test only',bankChecked:true}));
  const paid=(await repo.request(customer,reference)).project;assert.equal(paid.outstanding_paise,0);assert.equal(paid.due_paise,0);assert.equal(paid.verified_paid_paise,2000000);
  assert.equal(reminderStage({...paid,reminder_enabled:true,whatsapp_opted_in_at:now},now),null);
  assert.equal(reminderStage({...paid,status:'cancelled',due_paise:1,reminder_enabled:true,whatsapp_opted_in_at:now},now),null);
});
test('changing the quote pauses reminders and requires budget agreement again',async()=>{
  const prior=(await repo.request(owner,reference)).project;await repo.updateRequest(owner,reference,{version:prior.version,status:'completed',quote:2500000,message:'Revised scope',internalNote:''});
  const changed=(await repo.request(customer,reference)).project;assert.equal(changed.budget_agreed,false);assert.equal(changed.outstanding_paise,null);assert.equal(changed.verified_paid_paise,2000000);assert.equal(changed.reminder_enabled,false);
});
test('India-day scheduling and provider safety switches prevent overnight or disabled sends',async()=>{
  assert.equal(indiaDay(new Date('2026-10-31T20:00:00Z')),'2026-11-01');
  const record=financials({budget_agreed:true,quoted_amount_paise:10000,verified_paid_paise:0,payment_target_paise:10000,payment_due_date:'2026-11-01',reminder_enabled:true,whatsapp_opted_in_at:now,whatsapp_phone:'+15555550123',reminder_schedule:'before_due_overdue',status:'in_progress'});
  assert.equal(reminderStage(record,new Date('2026-10-29T04:00:00Z')),'before');assert.equal(reminderStage(record,now),'due');assert.equal(reminderStage(record,new Date('2026-11-04T04:00:00Z')),'overdue');
  assert.equal((await runReminders({pool:local.pool,config:configuration,now:new Date('2026-11-01T01:00:00Z')})).outsideHours,true);
  let calls=0;const outcome=await sendMetaTemplate({...configuration,enabled:false},record,async()=>{calls++;});assert.equal(outcome.status,'suppressed');assert.equal(calls,0);
  const unknown=await sendMetaTemplate(configuration,record,async()=>{throw new Error('network');});assert.equal(unknown.status,'unknown');
  const credit=financials({budget_agreed:true,quoted_amount_paise:10000,verified_paid_paise:20000,payment_target_paise:10000});assert.equal(credit.outstanding_paise,0);assert.equal(credit.credit_paise,10000);assert.equal(credit.due_paise,0);
  let payload;const sent=await sendMetaTemplate(configuration,{...record,customer_name:'Test client',reference:'TEST'},async(url,options)=>{assert.ok(url.startsWith('https://graph.facebook.com/'));payload=JSON.parse(options.body);return new Response(JSON.stringify({messages:[{id:'wamid.test'}]}));});assert.equal(sent.status,'accepted');assert.equal(payload.template.components[0].parameters.length,7);
});
test('an uncertain network outcome is not automatically resent',async()=>{
  const ref=(await repo.createProject(owner,{email:'client-c@example.com',name:'Test client C',quote:'500'})).reference;
  await repo.updateBilling(owner,ref,plan(1,{dueAmount:'500'}));let sends=0;
  const run=()=>runReminders({pool:local.pool,config:configuration,now,send:async()=>{sends++;throw new Error('simulated timeout');}});
  await run();await run();assert.equal(sends,1);assert.equal((await repo.request(owner,ref)).reminders[0].status,'unknown');
});
test('pending payment reviews cannot block other eligible projects in the reminder batch',async()=>{
  const blocked=[];
  for(let i=0;i<3;i++){
    const ref=(await repo.createProject(owner,{email:`blocked-${i}@example.com`,name:'Pending review test',quote:'500'})).reference;blocked.push(ref);
    await repo.updateBilling(owner,ref,plan(1,{dueAmount:'500'}));
    await repo.ingest({...payment(`SKTS-PAY-20261101-333333333333333${i}`,10000,`TEST-PENDING-${i}`),projectReference:ref,email:`blocked-${i}@example.com`});
  }
  const reference=(await repo.createProject(owner,{email:'eligible@example.com',name:'Eligible test',quote:'500'})).reference;await repo.updateBilling(owner,reference,plan(1,{dueAmount:'500'}));
  const candidates=await repo.reminderCandidates(indiaDay(now));assert.ok(candidates.some(p=>p.reference===reference));assert.ok(!candidates.some(p=>blocked.includes(p.reference)));
  const sent=[];await runReminders({pool:local.pool,config:configuration,now,send:async(project)=>{sent.push(project.reference);return {status:'accepted',messageId:'wamid.unblocked-test'};}});assert.deepEqual(sent,[reference]);
});
