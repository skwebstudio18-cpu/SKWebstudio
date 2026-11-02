import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {projectReport} from '../server/portal/report.mjs';
import {PortalRepository} from '../server/portal/repository.mjs';
import {serviceUpdate} from '../server/portal/tracking.mjs';
import {createHandler} from '../server/portal/api.mjs';
import {visualReport} from '../src/portal/report-view.mjs';
import {verifyRequestOrigin} from '@netlify/identity';
const owner={id:'owner',email:'owner@example.test',admin:true},client={id:'client',email:'client@example.test',admin:false},stranger={id:'stranger',email:'other@example.test',admin:false};
const project={status:'in_progress',progress_plan_agreed:true,budget_agreed:true,quoted_amount_paise:2000000,verified_paid_paise:800000,due_paise:400000,payment_due_date:'2026-11-05',pending_payment_count:0};
const milestones=[{id:'a',title:'Website',status:'completed',weight_points:50},{id:'b',title:'App',status:'in_progress',weight_points:25},{id:'c',title:'Profile',status:'awaiting_approval',weight_points:15},{id:'d',title:'Branding',status:'pending',weight_points:10}];
let database,pool,repo,reference,otherReference;
const origin='https://example.netlify.app';
const api=(actor,path,body,method='POST',requestOrigin=origin)=>createHandler({authenticate:async()=>actor,verifyRequestOrigin,repository:()=>repo})(new Request(origin+'/api/portal'+path,{method:body?method:'GET',headers:body?{'content-type':'application/json',...(requestOrigin?{origin:requestOrigin}:{})}:{},...(body?{body:JSON.stringify(body)}:{})}));
before(async()=>{database=new NetlifyDB({logger:()=>{}});const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;repo=new PortalRepository(pool);reference=(await repo.createProject(owner,{email:client.email,name:'Report client',services:'Website\nApp\nProfile\nBranding',quote:'20000'})).reference;otherReference=(await repo.createProject(owner,{email:stranger.email,name:'Other client',services:'Other scope',quote:'1000'})).reference;});
after(async()=>{await pool?.end();await database?.stop();});
test('completion uses agreed scope weights, with no assumed credit for in-progress or delivered work',()=>{
  const report=projectReport(project,milestones);assert.equal(report.completionPercent,50);assert.equal(report.counts.completed,1);assert.equal(report.activeCount,4);assert.equal(report.paidPercent,40);assert.equal(report.balancePaise,1200000);assert.equal(report.next.kind,'review');
  assert.equal(projectReport(project,milestones.map(s=>({...s,status:'delivered'}))).completionPercent,0);
});
test('missing, unagreed or cancelled milestone plans do not invent a percentage',()=>{
  for(const [p,services]of [[{...project,progress_plan_agreed:false},milestones],[project,milestones.map(s=>({...s,weight_points:null}))],[project,[]],[{...project,status:'cancelled'},milestones]])assert.equal(projectReport(p,services).completionPercent,null);
  const report=projectReport(project,[...milestones,{title:'Removed scope',status:'cancelled',weight_points:100}]);assert.equal(report.completionPercent,50);assert.equal(report.counts.cancelled,1);
});
test('rounding cannot report 100 percent before all scope or budget is completed',()=>{
  const services=Array.from({length:30},(_,i)=>({status:i===29?'pending':'completed',weight_points:i===29?1:100}));
  assert.equal(projectReport(project,services).completionPercent,99.9);
  assert.equal(projectReport({...project,verified_paid_paise:1999999},milestones).paidPercent,99.9);
  const credit=projectReport({...project,verified_paid_paise:2500000},milestones);assert.equal(credit.paidPercent,100);assert.equal(credit.balancePaise,0);assert.equal(credit.creditPaise,500000);
});
test('unagreed budgets show verified receipts without a fabricated budget or remaining balance',()=>{
  const result=projectReport({...project,budget_agreed:false},milestones);assert.equal(result.paidPercent,null);assert.equal(result.budgetPaise,null);assert.equal(result.balancePaise,null);assert.equal(result.paidPaise,800000);
});
test('next steps distinguish bank review, overdue instalments and milestone targets using India dates',()=>{
  const services=milestones.filter(s=>s.status!=='awaiting_approval');
  assert.equal(projectReport({...project,pending_payment_count:1},services).next.kind,'payment_review');
  const overdue=projectReport({...project,payment_due_date:'2026-11-01'},services,new Date('2026-11-01T20:00:00Z'));assert.equal(overdue.today,'2026-11-02');assert.equal(overdue.next.title,'Payment instalment overdue');
  const next=projectReport({...project,due_paise:0},services.map((s,i)=>({...s,target_date:['2026-10-31','2026-11-12','2026-11-20'][i]})));assert.equal(next.next.detail,'App');
});
test('weights and milestone dates are validated before database writes',()=>{
  for(const weight of [0,101,1.5,'abc',true])assert.throws(()=>serviceUpdate({version:1,services:[{title:'Test',status:'pending',weight}]}));
  assert.throws(()=>serviceUpdate({version:1,services:[{title:'Test',status:'pending',targetDate:'2026-02-30'}]}));
  assert.equal(serviceUpdate({version:1,services:[{title:'Test',status:'delivered',weight:'50',targetDate:'2026-11-05'}]}).services[0].weight,50);
});
test('admin records an agreed plan and clients get accurate scoped report data',async()=>{
  const data=await repo.request(owner,reference);
  const services=data.services.map((s,i)=>({...s,status:milestones[i].status,weight:milestones[i].weight_points,targetDate:'2026-11-10'}));
  assert.equal((await api(client,'/admin/requests/'+reference+'/services',{version:data.project.version,planAgreed:true,services},'PATCH')).status,403);
  await assert.rejects(()=>repo.updateServices(owner,reference,serviceUpdate({version:data.project.version,planAgreed:true,services:services.map(s=>({...s,weight:''}))})),/positive weight/);
  await repo.updateServices(owner,reference,serviceUpdate({version:data.project.version,planAgreed:true,services}));
  const own=await repo.request(client,reference);assert.equal(own.report.completionPercent,50);assert.ok(own.project.progress_plan_agreed_at);assert.ok(own.services[2].delivered_at);
  assert.equal((await api(stranger,'/requests/'+reference)).status,404);
});
test('delivery acceptance requires the assigned client, correct project, origin, confirmation and revision',async()=>{
  const data=await repo.request(client,reference),id=data.services[2].id,path='/requests/'+reference+'/services/'+id+'/accept',body={version:data.project.version,confirmed:true};
  assert.equal((await api(owner,path,body)).status,403);assert.equal((await api(stranger,path,body)).status,404);
  assert.equal((await api(client,path,{...body,confirmed:false})).status,400);
  assert.equal((await api(client,path,body,'POST','https://evil.example')).status,403);assert.equal((await api(client,path,body,'POST',null)).status,403);
  const foreign=(await repo.request(owner,otherReference)).services[0].id;assert.equal((await api(client,'/requests/'+reference+'/services/'+foreign+'/accept',body)).status,404);
  assert.equal((await api(client,'/requests/'+reference+'/services/'+data.services[1].id+'/accept',body)).status,409);
  assert.equal((await api(client,path,body)).status,200);assert.equal((await api(client,path,body)).status,409);
  const accepted=await repo.request(client,reference);assert.equal(accepted.report.completionPercent,65);assert.equal(accepted.services[2].status,'completed');assert.ok(accepted.services[2].accepted_at);assert.equal(accepted.events.filter(e=>e.message.startsWith('Client accepted delivery:')).length,1);
});
test('reopening a delivery clears its current acceptance while preserving the audit timeline',async()=>{
  const data=await repo.request(owner,reference);await repo.updateServices(owner,reference,serviceUpdate({version:data.project.version,services:data.services.map((s,i)=>({...s,status:i===2?'in_progress':s.status}))}));
  const changed=await repo.request(client,reference);assert.equal(changed.services[2].accepted_at,null);assert.equal(changed.services[2].completed_at,null);assert.equal(changed.report.completionPercent,50);assert.ok(changed.events.some(e=>e.message.startsWith('Client accepted delivery:')));
});
test('scope changes without renewed agreement pause the percentage and stale saves cannot overwrite it',async()=>{
  const data=await repo.request(owner,reference);await repo.updateServices(owner,reference,serviceUpdate({version:data.project.version,services:data.services.map((s,i)=>({...s,weight:i===0?60:s.weight_points}))}));
  const changed=await repo.request(client,reference);assert.equal(changed.project.progress_plan_agreed,false);assert.equal(changed.report.completionPercent,null);assert.equal(changed.services[0].weight_points,60);
  await assert.rejects(()=>repo.updateServices(owner,reference,serviceUpdate({version:data.project.version,planAgreed:true,services:data.services})),/changed/);
});
test('report renders exact numbers and accessible labels, escapes notes and limits delivery controls to clients',()=>{
  const p={...project,reference:'SKTS-20261102-0000000000000001',customer_name:'<script>alert(1)</script>',version:2,updated_at:'2026-11-02T08:00:00Z'};
  const data={project:p,services:milestones.map(s=>({...s,notes:'<img src=x onerror=alert(1)>'}))};
  const html=visualReport(data,false);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.match(html,/50%/);assert.match(html,/40%/);assert.match(html,/aria-label="Service counts:/);assert.match(html,/milestone-accept/);assert.ok(!visualReport(data,true).includes('class="milestone-accept"'));
  assert.doesNotMatch(visualReport({project:{...p,budget_agreed:false,progress_plan_agreed:false},services:[]}),/NaN|Infinity/);
});
