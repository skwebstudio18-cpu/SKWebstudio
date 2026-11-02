import { getSettings, getUser, login, signup, logout, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite, oauthLogin, refreshSession } from '@netlify/identity';
import {trackingSections,serviceRow,createProjectForm} from './tracking-view.mjs';
import {documentsSection} from './documents-view.mjs';
import {visualReport} from './report-view.mjs';
import {accessFromPath,workspacePath,authErrorMessage} from './login-view.mjs';
const $ = selector => document.querySelector(selector);
const localOnly = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const pageAccess=accessFromPath(location.pathname),accessName=pageAccess==='admin'?'Admin':'Client';
document.body.dataset.access=pageAccess;
document.querySelector('.brand small').textContent=accessName.toUpperCase()+' PORTAL';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = value => String(value).replaceAll('_',' ');
const rupees = value => value == null ? 'Not set' : new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value)/100);
const date = value => value ? new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : '—';
const badge = value => `<span class="badge ${esc(value)}">${esc(label(value))}</span>`;
const states = ['new','reviewing','quoted','in_progress','awaiting_client','completed','cancelled'];
let mode = 'login', settings, inviteToken, actor, projects=[], payments=[], selected, dirty=false, running=false, localAuth;
let projectOffset=0, paymentOffset=0;
let localInviteToken;
$('#summary').insertAdjacentHTML('afterend',createProjectForm);
$('#admin-tools').insertAdjacentHTML('beforebegin','<p id="reminder-provider-status" class="notice" role="status" hidden></p>');
$('#reminder-provider-status').insertAdjacentHTML('afterend','<section id="visual-report" class="visual-report" aria-label="Visual project report" hidden></section>');
function notice(selector,message,error=false) { const node=$(selector); node.textContent=message; node.hidden=!message; node.classList.toggle('error',error); }
function authMode(next) {
  if(mode!==next){$('#auth-form').elements.password.value='';$('#auth-form').elements.passwordConfirmation.value='';}
  mode=next;
  const password = !['recovery'].includes(mode), email = !['reset','invite'].includes(mode);
  $('#name-label').hidden=mode!=='signup'; $('#email-label').hidden=!email; $('#password-label').hidden=!password;
  $('#auth-form').elements.email.required=email; $('#auth-form').elements.password.required=password;
  $('#auth-form').elements.password.autocomplete=['signup','reset','invite'].includes(mode)?'new-password':'current-password';
  $('#auth-form').elements.password.minLength=mode==='login'?1:10;
  const newPassword=['signup','reset','invite'].includes(mode);
  $('#password-confirm-label').hidden=!newPassword;$('#auth-form').elements.passwordConfirmation.required=newPassword;
  if(newPassword)$('#auth-form').elements.password.minLength=12;
  const titles={login:accessName+' sign in',signup:'Create your account',recovery:'Reset your password',reset:'Choose a new password',invite:'Accept your invitation'};
  const submitText={login:'Sign in to '+pageAccess+' portal',signup:'Create account',recovery:'Send reset link',reset:'Save new password',invite:'Join SKTS portal'}[mode];
  $('#auth-title').textContent=titles[mode];$('#auth-submit').innerHTML='<span>'+submitText+'</span><span aria-hidden="true">→</span>';
  $('#auth-intro').textContent=mode==='signup'?'Use the email address invited to this portal.':mode==='recovery'?'We will email a secure password reset link.':mode==='invite'?'Choose your password to activate your private workspace.':mode==='reset'?'Save a new password for your portal account.':pageAccess==='admin'?'Welcome back. Your business workspace is ready.':'Welcome back. Let’s see how your project is moving.';
  $('#signup-mode').hidden=mode!=='login'||settings?.disableSignup; $('#recovery-mode').hidden=mode!=='login'; $('#login-mode').hidden=mode==='login'||mode==='invite'; $('#providers').hidden=mode!=='login';
  $('#auth-form').hidden=false; $('#auth-options').hidden=false; notice('#auth-status','');
}
async function api(path,options={}) {
  if(!localOnly) await refreshSession();
  const response=await fetch(`/api/portal${path}`,{...options,credentials:'same-origin',cache:'no-store',headers:{...(!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(localAuth?{'X-SKTS-CSRF':localAuth.csrf}:{}),...options.headers}});
  let data; try { data=await response.json(); } catch { throw new Error('The portal service is not available yet. Please contact SKTS.'); }
  if (!response.ok) {
    if (response.status===401) { clearWorkspace();if(localOnly&&localAuth)configureLocalAuth();else authMode('login');$('#auth-screen').hidden=false; }
    throw new Error(data.error||'Unable to load the portal.');
  }
  return data;
}
function clearWorkspace() { document.body.classList.add('portal-login');document.title=accessName+' sign in — SKTS'; actor=null; projects=[]; payments=[]; selected=null; dirty=false; $('#dashboard').hidden=true; $('#logout').hidden=true; $('#projects').replaceChildren(); $('#payments').replaceChildren(); $('#project-detail').replaceChildren(); $('#visual-report').replaceChildren();$('#visual-report').hidden=true; $('#discard-edits').hidden=true; $('#admin-tools').hidden=true; $('#create-project').reset(); if($('#local-backup'))$('#local-backup').hidden=true; }
async function openWorkspace() {
  const who=await api('/me');
  // The entry screen is a presentation choice. Only the authenticated server
  // response selects the workspace; an Admin link never grants an admin role.
  if(accessFromPath(workspacePath(who))!==pageAccess){$('#auth-form').hidden=true;$('#auth-loading').hidden=false;$('#auth-loading').textContent='Opening your '+(who.admin?'admin':'client')+' workspace…';location.replace(workspacePath(who));return;}
  actor=who;document.body.classList.remove('portal-login');document.title=who.admin?'Admin workspace — SKTS':'Client workspace — SKTS';
  $('#auth-screen').hidden=true; $('#dashboard').hidden=false; $('#logout').hidden=false;
  if($('#local-backup'))$('#local-backup').hidden=!who.admin;
  $('#admin-tools').hidden=!who.admin;
  $('#reminder-provider-status').hidden=!who.admin;
  $('#dashboard-kind').textContent=who.admin?'SKTS CONTROL CENTRE':'YOUR CLIENT WORKSPACE'; $('#dashboard-title').textContent=who.admin?'Project management':'Your projects, connected.'; $('#account-email').textContent=who.email;
  $('#dashboard-intro').textContent=who.admin?'Turn project updates into clear next steps. Manage your clients, deliveries and payment reviews from here.':'A clear view of your progress, payments and project files. Everything you need to move forward, together.';
  $('#workspace-caption').textContent=who.admin?'BUILT TO KEEP WORK MOVING':'GOOD WORK. CLEARLY CONNECTED.';
  await refresh(true);
  if(who.admin)try{const provider=await api('/admin/reminders/status');$('#reminder-provider-status').textContent=provider.note+(provider.schedule?' '+provider.schedule:'');}catch{$('#reminder-provider-status').textContent='Unable to check WhatsApp delivery configuration.';}
}
function renderProjects() {
  $('#projects').innerHTML=projects.length?projects.map(p=>`<button class="project-card ${p.reference===selected?'selected':''}" data-project="${esc(p.reference)}"><div class="project-top"><span>${esc(p.business||p.customer_name)}</span>${badge(p.status)}</div><p>${esc(p.services||'Custom project enquiry')}</p><small>${esc(p.reference)} · ${esc(date(p.updated_at))}</small>${actor.admin?`<small>${esc(p.customer_email)}</small>`:''}</button>`).join(''):'<div class="empty"><h3>No projects here yet</h3><p>New enquiries appear here after processing. Use the same email on your enquiry and portal account. Contact us to link an older request.</p><a href="/services/">Explore services ↗</a></div>';
  const agreed=projects.filter(p=>p.budget_agreed);
  $('#summary').innerHTML=`<div class="summary-card"><div class="metric-top"><span>Projects loaded</span><i aria-hidden="true">↗</i></div><strong>${projects.length}${$('#more-projects').hidden?'':'+'}</strong><small>Your connected project records</small></div><div class="summary-card"><div class="metric-top"><span>Verified payments</span><i aria-hidden="true">✓</i></div><strong>${rupees(agreed.reduce((sum,p)=>sum+Number(p.verified_paid_paise),0))}</strong><small>Across agreed projects loaded</small></div><div class="summary-card"><div class="metric-top"><span>Outstanding balance</span><i aria-hidden="true">₹</i></div><strong>${rupees(agreed.reduce((sum,p)=>sum+Number(p.outstanding_paise),0))}</strong><small>Across agreed projects loaded</small></div>`;
}
async function showProject(reference, focus=false) {
  const data=await api(`${actor.admin?'/admin':''}/requests/${encodeURIComponent(reference)}`);
  if (selected!==reference) return;
  const p=data.project;
  $('#visual-report').innerHTML=visualReport(data,actor.admin);$('#visual-report').hidden=false;
  $('#project-detail').innerHTML=`<div class="panel-heading"><h2>${esc(p.business||p.customer_name)}</h2>${badge(p.status)}</div><p class="detail-reference">${esc(p.reference)}</p><dl><dt>Customer</dt><dd>${esc(p.customer_name)}</dd><dt>Email</dt><dd>${esc(p.customer_email)}</dd>${p.phone?`<dt>Phone</dt><dd>${esc(p.phone)}</dd>`:''}<dt>Services</dt><dd>${esc(p.services||'Custom enquiry')}</dd><dt>Quote</dt><dd>${esc(rupees(p.quoted_amount_paise))}</dd></dl><p class="fineprint">The quote is the amount recorded by our team. Contact us for the agreed scope and any applicable taxes.</p><h3>Project brief</h3><p class="brief">${esc(p.brief||'No additional brief supplied.')}</p>${trackingSections(data,actor.admin,localOnly)}<h3>Project timeline</h3><ol class="timeline">${data.events.map(e=>`<li><small>${esc(date(e.created_at))}${e.visibility==='internal'?' · Internal note':''}</small><p>${esc(e.message)}</p></li>`).join('')}</ol>${actor.admin?`<form id="project-update" class="admin-form"><h3>Update this project</h3><input type="hidden" name="version" value="${p.version}"><label>Project status<select name="status">${states.map(s=>`<option value="${s}"${s===p.status?' selected':''}>${esc(label(s))}</option>`).join('')}</select></label><label>Quoted amount (INR)<input name="quote" inputmode="decimal" type="number" min="0.01" max="99999999.99" step="0.01" value="${p.quoted_amount_paise==null?'':(Number(p.quoted_amount_paise)/100).toFixed(2)}"></label><label>Update visible to the customer<textarea name="message" maxlength="2000" rows="3"></textarea></label><label>Internal note (admins only)<textarea name="internalNote" maxlength="2000" rows="2"></textarea></label><p class="fineprint">Status and quote changes also appear on the customer timeline.</p><button>Save project update</button><p class="notice" role="status" hidden></p></form>`:''}`;
  renderProjects();
  $('#project-detail .detail-reference').insertAdjacentHTML('afterend','<a href="#project-documents" class="document-download">Documents ↓</a>');
  let documentData,documentError='';
  try{documentData=await api('/requests/'+encodeURIComponent(reference)+'/documents');}catch(error){documentError=error.message;}
  if(selected!==reference)return;
  $('#project-detail').insertAdjacentHTML('beforeend',documentsSection(documentData??{},actor.admin,reference,documentError));
  if (focus) { $('#visual-report').tabIndex=-1; $('#visual-report').focus({preventScroll:true}); $('#visual-report').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}); }
}
function renderPayments() {
  $('#payments').innerHTML=payments.length?payments.map(p=>`<article class="payment-card"><div class="project-top"><h3>${esc(rupees(p.reported_amount_paise))} reported</h3>${badge(p.verification_status)}</div><p><strong>${esc(p.reference)}</strong></p><p>Project / quote: ${esc(p.project_reference)}${actor.admin&&!p.matched_project?' · No matching project for this email':''}</p><p>UPI reference: ${esc(p.transaction_reference)} · Paid ${esc(String(p.payment_date).slice(0,10))}</p>${actor.admin?`<p>${esc(p.customer_name)} · ${esc(p.customer_email)}</p>`:''}${p.brief?`<p>${esc(p.brief)}</p>`:''}${p.verified_amount_paise?`<p><strong>Verified: ${esc(rupees(p.verified_amount_paise))}</strong></p>`:''}${p.review_note?`<p>Review: ${esc(p.review_note)}</p>`:''}${actor.admin?`<details><summary>Review this payment reference</summary><form class="payment-review" data-payment="${esc(p.reference)}"><input type="hidden" name="version" value="${p.version}"><label>Review outcome<select name="status"><option value="verified">Verified in bank account</option><option value="rejected">Could not verify / reject</option></select></label><label>Amount verified in bank account (INR)<input name="amount" type="number" inputmode="decimal" min="0.01" max="99999999.99" step="0.01" required placeholder="Enter checked amount"></label><label>Review note (visible to customer)<textarea name="note" maxlength="2000" rows="2" required></textarea></label><label class="check-label"><input name="bankChecked" type="checkbox" required>I checked the bank transaction and the recipient account before choosing this outcome.</label><button>Save payment review</button><p class="notice" role="status" hidden></p></form></details>`:''}</article>`).join(''):'<div class="empty"><h3>No payment references yet</h3><p>Pay only against an agreed quote. Submit your UPI reference using the payment form on our website.</p></div>';
}
async function refresh(reset=false) {
  if (!actor||running) return;
  running=true; $('#refresh').disabled=true;
  try {
    const prefix=actor.admin?'/admin':'';
    const [p,t]=await Promise.all([api(`${prefix}/requests?offset=${projectOffset}`),api(`${prefix}/payments?offset=${paymentOffset}`)]);
    if (reset || projectOffset===0) projects=p.items; else projects=[...projects.slice(0,projectOffset),...p.items];
    if (reset || paymentOffset===0) payments=t.items; else payments=[...payments.slice(0,paymentOffset),...t.items];
    $('#more-projects').hidden=!p.hasMore; $('#more-payments').hidden=!t.hasMore;
    renderProjects(); renderPayments();
    if(!selected&&!actor.admin&&projects.length)selected=projects[0].reference;
    if (selected) await showProject(selected);
    $('#last-checked').textContent=`Last checked ${new Date().toLocaleTimeString('en-IN')}`;
    dirty=false; $('#discard-edits').hidden=true; notice('#dashboard-error','');
  } catch(error) { notice('#dashboard-error',error.message,true); }
  finally { running=false; $('#refresh').disabled=false; }
}
$('#auth-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget, values=new FormData(form), button=$('#auth-submit'); button.disabled=true; notice('#auth-status','');
  try {
    const email=String(values.get('email')).trim().toLowerCase(), password=String(values.get('password'));
    if(['signup','reset','invite'].includes(mode)&&password!==values.get('passwordConfirmation'))throw new Error('The passwords do not match.');
    if(localOnly) {
      if(!localAuth)throw new Error('Start the local backend with npm run dev before signing in.');
      if((localAuth.setupNeeded||localInviteToken)&&password!==values.get('passwordConfirmation'))throw new Error('The passwords do not match.');
      await localRequest(localInviteToken?'/accept-invite':localAuth.setupNeeded?'/setup':'/login',{email,password,name:String(values.get('name')??''),...(localInviteToken?{token:localInviteToken}:{})});
      localInviteToken=undefined;localAuth.invitation=undefined;
      localAuth.setupNeeded=false; $('#password-confirm-label').hidden=true; form.elements.passwordConfirmation.required=false;
      await openWorkspace();
    }
    else if (mode==='recovery') { await requestPasswordRecovery(email); notice('#auth-status','If an account exists for this email, a reset link will arrive shortly.'); }
    else if (mode==='signup') { await signup(email,password,{full_name:String(values.get('name')).trim()}); notice('#auth-status','Check your email and confirm your account, then sign in here.'); }
    else {
      if(mode==='reset')await updateUser({password});
      else if(mode==='invite'){
        await acceptInvite(inviteToken,password);inviteToken=undefined;
        // The invitation has been consumed even if loading the workspace fails.
        // Never offer to submit that single-use token again.
        authMode('login');form.elements.password.value='';form.elements.passwordConfirmation.value='';
        notice('#auth-status','Your password was saved. Loading your workspace…');
      }else await login(email,password);
      await openWorkspace();
    }
    form.elements.password.value=''; form.elements.passwordConfirmation.value='';
  } catch(error) { notice('#auth-status',authErrorMessage(error),true); }
  finally { button.disabled=false; }
});
$('#signup-mode').onclick=()=>authMode('signup'); $('#recovery-mode').onclick=()=>authMode('recovery'); $('#login-mode').onclick=()=>authMode('login');
$('#auth-form').addEventListener('input',()=>notice('#auth-status',''));
$('#logout').onclick=async()=>{ $('#logout').disabled=true; try { if(localOnly)await localRequest('/logout',{});else await logout(); clearWorkspace(); $('#auth-screen').hidden=false; if(localOnly)configureLocalAuth();else authMode('login'); } catch { notice('#dashboard-error','Sign out could not complete. Please try again.',true); } finally { $('#logout').disabled=false; } };
$('#refresh').onclick=()=>{ if(dirty) { notice('#dashboard-error','Save your current edit or reload the page to discard it before refreshing.',true); return; } projectOffset=paymentOffset=0; refresh(true); };
$('#discard-edits').onclick=()=>{ for(const form of $('#dashboard').querySelectorAll('form')) {form.reset(); for(const field of form.elements) field.disabled=false;} dirty=false; $('#discard-edits').hidden=true; projectOffset=paymentOffset=0; refresh(true); };
$('#more-projects').onclick=()=>{ if(dirty) return notice('#dashboard-error','Save your current edit before loading more.',true); projectOffset=projects.length; refresh(); };
$('#more-payments').onclick=()=>{ if(dirty) return notice('#dashboard-error','Save your current edit before loading more.',true); paymentOffset=payments.length; refresh(); };
$('#projects').addEventListener('click',async event=>{const button=event.target.closest('[data-project]'); if(!button) return; if(dirty) return notice('#dashboard-error','Save your current edit before selecting another project.',true); selected=button.dataset.project; try{ await showProject(selected,true); }catch(error){notice('#dashboard-error',error.message,true);} });
$('#dashboard').addEventListener('input',event=>{
  const active=event.target.closest('form'); if(!active) return;
  dirty=true; $('#discard-edits').hidden=false;
  if(active.id==='document-upload')delete active.dataset.uploadId;
  if(active.id==='services-update'){
    const field=event.target;
    if(!field.matches('[name=service-notes],[name=service-status],[name=planAgreed]')||field.name==='service-status'&&(field.value==='cancelled'||field.dataset.originalStatus==='cancelled'))active.elements.planAgreed.checked=false;
  }
  // Keep one draft active so saving one form cannot erase edits in another.
  for(const form of $('#dashboard').querySelectorAll('form')) if(form!==active) for(const field of form.elements) field.disabled=true;
});
$('#visual-report').addEventListener('click',event=>{if(event.target.closest('.report-print'))window.print();});
$('#dashboard').addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('.milestone-accept'))return;
  event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[role=status]'),values=Object.fromEntries(new FormData(form));button.disabled=true;status.hidden=true;
  try{await api('/requests/'+encodeURIComponent(selected)+'/services/'+encodeURIComponent(form.dataset.serviceId)+'/accept',{method:'POST',body:JSON.stringify({version:Number(values.version),confirmed:values.confirmed==='on'})});dirty=false;await refresh(true);}
  catch(error){status.textContent=error.message;status.hidden=false;status.classList.add('error');}
  finally{button.disabled=false;}
});
$('#project-detail').addEventListener('change',event=>{
  if(event.target.matches('#document-upload [name=documentId]')){
    const title=event.target.form.elements.title;title.required=!event.target.value;title.disabled=!!event.target.value;
  }
});
$('#dashboard').addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('#document-upload,.document-review'))return;
  event.preventDefault();const button=form.querySelector('button[type=submit]'),status=form.querySelector('[role=status]'),original=button.textContent;button.disabled=true;status.hidden=true;
  try{
    const base='/requests/'+encodeURIComponent(selected)+'/documents';
    if(form.id==='document-upload'){
      const body=new FormData(form),file=body.get('file');
      if(!file?.size||file.size>3*1024*1024)throw new Error('Choose a non-empty file of 3 MB or smaller.');
      form.dataset.uploadId??=crypto.randomUUID();body.set('uploadId',form.dataset.uploadId);button.textContent='Uploading…';
      await api(base,{method:'POST',body});
    }else{
      const values=Object.fromEntries(new FormData(form));await api('/admin'+base+'/'+encodeURIComponent(form.dataset.documentVersion)+'/review',{method:'PATCH',body:JSON.stringify({...values,revision:Number(values.revision)})});
    }
    dirty=false;await refresh(true);
  }catch(error){status.textContent=error.message;status.hidden=false;status.classList.add('error');}
  finally{button.disabled=false;button.textContent=original;}
});
$('#project-detail').addEventListener('click',async event=>{
  if(event.target.closest('#prepare-reminder')){
    const button=event.target.closest('button');button.disabled=true;
    try{const draft=await api('/admin/requests/'+encodeURIComponent(selected)+'/reminder-preview');if(new URL(draft.url).origin!=='https://wa.me')throw new Error('Invalid reminder link.');$('#reminder-preview-result').innerHTML=`<label>Reminder draft<textarea readonly rows="9">${esc(draft.text)}</textarea></label><a href="${esc(draft.url)}" target="_blank" rel="noopener noreferrer">Open WhatsApp draft ↗</a><p class="fineprint">Review the recipient and message, then tap Send in WhatsApp. This draft has not been sent automatically.</p>`;}catch(error){notice('#dashboard-error',error.message,true);}finally{button.disabled=false;}
  }
  if(event.target.closest('#add-service')){
    if($('#service-editor').children.length>=30)return notice('#dashboard-error','A project can contain up to 30 services.',true);
    $('#service-editor').insertAdjacentHTML('beforeend',serviceRow());$('#services-update').dispatchEvent(new Event('input',{bubbles:true}));
  }
  if(event.target.closest('.remove-service')){const form=event.target.closest('form');event.target.closest('.service-edit-row').remove();form.dispatchEvent(new Event('input',{bubbles:true}));}
  if(event.target.closest('#stop-reminders')){
    const button=event.target.closest('button');button.disabled=true;
    try{await api('/requests/'+encodeURIComponent(selected)+'/stop-reminders',{method:'POST',body:'{}'});await refresh(true);}catch(error){notice('#dashboard-error',error.message,true);}finally{button.disabled=false;}
  }
});
$('#dashboard').addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('#create-project,#services-update,#billing-update,#client-invite'))return;
  event.preventDefault();const button=form.querySelector('button[type=submit],button:not([type])'),status=form.querySelector('[role=status]'),values=Object.fromEntries(new FormData(form));button.disabled=true;status.hidden=true;
  try{
    if(form.id==='client-invite'){
      if(localOnly){
        const result=await localRequest('/invite',values);
        const link=location.origin+'/portal/client/#local-invite='+encodeURIComponent(result.token);
        $('#client-invite-result').innerHTML=`<label>Private client invitation (expires in 48 hours)<textarea readonly rows="4">${esc(link)}</textarea></label><p class="fineprint">Copy this link for the named client. Use a separate browser profile to test client access. The link works locally until the portal is published.</p>`;
        dirty=true;$('#discard-edits').hidden=false;
      }else{
        const result=await api('/admin/requests/'+encodeURIComponent(selected)+'/invite',{method:'POST',body:'{}'});
        $('#client-invite-result').textContent='Invitation email requested for '+result.email+'. The client opens the link and chooses their own password.';
      }
    }else{
      let path,payload;
      if(form.id==='create-project'){path='/admin/requests';payload=values;}
      else if(form.id==='services-update'){path='/admin/requests/'+encodeURIComponent(selected)+'/services';payload={version:Number(values.version),planAgreed:values.planAgreed==='on',services:[...form.querySelectorAll('.service-edit-row')].map(row=>({id:row.querySelector('[name=service-id]').value||null,title:row.querySelector('[name=service-title]').value,status:row.querySelector('[name=service-status]').value,notes:row.querySelector('[name=service-notes]').value,weight:row.querySelector('[name=service-weight]').value,targetDate:row.querySelector('[name=service-target]').value}))};}
      else{path='/admin/requests/'+encodeURIComponent(selected)+'/billing';payload={...values,version:Number(values.version),agreed:values.agreed==='on',reminders:values.reminders==='on',optedIn:values.optedIn==='on'};}
      const result=await api(path,{method:form.id==='create-project'?'POST':'PATCH',body:JSON.stringify(payload)});
      if(form.id==='create-project'){selected=result.reference;form.reset();$('#admin-tools').open=false;}
      dirty=false;projectOffset=paymentOffset=0;await refresh(true);
    }
  }catch(error){status.textContent=error.message;status.hidden=false;status.classList.add('error');}
  finally{button.disabled=false;}
});
$('#payments').addEventListener('change',event=>{if(event.target.name==='status'){ const amount=event.target.form.elements.amount; amount.required=event.target.value==='verified'; amount.disabled=event.target.value==='rejected'; }});
$('#dashboard').addEventListener('submit',async event=>{
  const form=event.target; if(!form.matches('#project-update,.payment-review')) return;
  event.preventDefault(); const button=form.querySelector('button'),status=form.querySelector('[role=status]'), values=Object.fromEntries(new FormData(form)); button.disabled=true; status.hidden=true;
  const payment=!!form.dataset.payment;
  const payload=payment?{version:Number(values.version),status:values.status,amount:values.amount,bankChecked:values.bankChecked==='on',note:values.note}:{version:Number(values.version),status:values.status,quote:values.quote,message:values.message,internalNote:values.internalNote};
  try { await api(`/admin/${payment?'payments/'+encodeURIComponent(form.dataset.payment):'requests/'+encodeURIComponent(selected)}`,{method:'PATCH',body:JSON.stringify(payload)}); dirty=false; projectOffset=paymentOffset=0; await refresh(true); }
  catch(error) { status.textContent=error.message; status.hidden=false; status.classList.add('error'); }
  finally { button.disabled=false; }
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
setInterval(()=>{if(actor&&!document.hidden&&!dirty&&!document.activeElement?.closest('form')&&!$('#dashboard').querySelector('details[open]')&&!$('#reminder-preview-result')?.hasChildNodes()){projectOffset=paymentOffset=0;refresh(true);}},30000);
async function localRequest(path,body) {
  const response=await fetch('/api/local'+path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-SKTS-CSRF':localAuth.csrf},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Local request failed.');return data;
}
function configureLocalAuth() {
  if(localAuth.setupNeeded&&!localInviteToken&&pageAccess!=='admin'){location.replace('/portal/admin/');return;}
  authMode(localInviteToken?'invite':localAuth.setupNeeded?'signup':'login'); $('#auth-options').hidden=true;
  $('#auth-title').textContent=localInviteToken?'Activate your client login':localAuth.setupNeeded?'Create your local owner account':accessName+' sign in';
  $('#auth-intro').textContent='Records are saved on this computer. This account is separate from the public website.';
  if(localInviteToken||localAuth.setupNeeded)$('#auth-submit').textContent=localInviteToken?'Activate client account':'Create local owner account';
  $('#auth-form').elements.email.value=localAuth.invitation?.email??(localAuth.setupNeeded||pageAccess==='admin'?localAuth.ownerEmail:''); $('#auth-form').elements.email.readOnly=localAuth.setupNeeded||!!localInviteToken;
  $('#email-label').hidden=false;$('#auth-form').elements.email.required=true;
  $('#auth-form').elements.password.minLength=localAuth.setupNeeded||localInviteToken?12:1;
  $('#password-confirm-label').hidden=!localAuth.setupNeeded&&!localInviteToken; $('#auth-form').elements.passwordConfirmation.required=localAuth.setupNeeded||!!localInviteToken;
  $('#recovery-mode').hidden=true;
  if(localAuth.setupNeeded)notice('#auth-status','Choose a password to manage the local database. Your password stays on this computer.');
}
if(localOnly) {
  try {
    const response=await fetch('/api/local/config',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('Local backend unavailable.');
    localAuth=await response.json();if(localAuth.local!==true||!localAuth.ready)throw new Error('Local backend unavailable.');
    localInviteToken=new URLSearchParams(location.hash.slice(1)).get('local-invite')??undefined;
    if(localInviteToken){history.replaceState(null,'','/portal/client/');localAuth.invitation=await localRequest('/invitation-info',{token:localInviteToken});}
    $('#auth-loading').hidden=true; configureLocalAuth();
    const backup=document.createElement('a'); backup.href='/api/local/backup'; backup.textContent='Download records'; backup.id='local-backup'; backup.hidden=true;$('.header-actions').prepend(backup);
    if(localAuth.signedIn&&!localInviteToken)await openWorkspace();
  }catch{ $('#auth-loading').hidden=true;authMode('login');$('#auth-options').hidden=true;$('#auth-submit').disabled=true;notice('#auth-status','The local backend is not running. Start it with npm run dev to sign in and save records.'); }
} else try {
  const callback=await handleAuthCallback();
  settings=await getSettings(); $('#auth-loading').hidden=true; authMode('login');
  // Portal access requires verified email. Autoconfirm must stay disabled in Identity settings.
  if (settings.autoconfirm) { $('#auth-form').hidden=true; $('#auth-options').hidden=true; throw new Error('Email confirmation must be enabled before the project portal can launch. Please contact SKTS.'); }
  for(const [provider,enabled] of Object.entries(settings.providers)) if(enabled&&provider!=='email') { const button=document.createElement('button');button.className='provider-button';button.textContent=`Continue with ${provider[0].toUpperCase()+provider.slice(1)}`;button.onclick=()=>oauthLogin(provider);$('#providers').append(button); }
  if(callback?.type==='invite'){inviteToken=callback.token;authMode('invite');}
  else if(callback?.type==='recovery'||new URLSearchParams(location.search).has('password-reset')){authMode('reset');history.replaceState(null,'','/portal/'+pageAccess+'/');}
  else if(new URLSearchParams(location.search).has('callback-error')){throw new Error('Your sign-in link could not be processed. Request a new link or contact SKTS.');}
  else if(await getUser()) await openWorkspace();
} catch(error) { $('#auth-loading').hidden=true; notice('#auth-status',error.message||'Sign-in is not available. Please contact SKTS.',true); }
