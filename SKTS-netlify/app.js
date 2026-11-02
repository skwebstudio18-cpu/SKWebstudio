import {createReference,readReceipts,rememberReceipt,clearReceipts,receiptLabel,receiptStatus,receiptText} from '/request-references.mjs?v=9';
const services=[
{id:'website',category:'build',icon:'⌘',name:'Website development',description:'A beautiful, responsive home for your business. Built to make a lasting first impression.',features:['Responsive across every screen','Performance & SEO foundations','Launch-ready handover'],price:14999,tag:'A GREAT PLACE TO START'},
{id:'ui',category:'design',icon:'✧',name:'UI / UX design',description:'Turn complex ideas into effortless experiences that your customers will love using.',features:['Thoughtful user journeys','Custom interface design','Interactive design prototype'],price:7999},
{id:'google',category:'grow',icon:'◎',name:'Google Business Profile',description:'Help nearby customers discover your business and take the next step with confidence.',features:['Profile setup & optimisation','Business information & imagery','Verification guidance'],price:2499},
{id:'deployment',category:'build',icon:'↗',name:'Deployment & launch',description:'Take your project from development to the world, with the technical details taken care of.',features:['Hosting & domain configuration','HTTPS & launch checks','Deployment handover'],price:2999},
{id:'support',category:'grow',icon:'♡',name:'Website care & support',description:'Keep your digital presence in good shape, with a real person in your corner.',features:['Monthly maintenance support','Updates & health checks','Small content changes'],price:1999,suffix:'/ month'},
{id:'app',category:'build',icon:'▣',name:'Mobile app experiences',description:'Put your business within easy reach, with an installable, responsive web app.',features:['Responsive app interface','Installable PWA setup','Online & offline foundations'],price:19999}
];
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
let cart;try{const saved=JSON.parse(localStorage.getItem('skts-cart')||'[]');cart=Array.isArray(saved)?[...new Set(saved.filter(id=>services.some(s=>s.id===id)))]:[];}catch{cart=[];}
const $=s=>document.querySelector(s);const total=()=>cart.reduce((sum,id)=>sum+services.find(s=>s.id===id).price,0);
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').classList.remove('show'),2500);}
function save(){try{localStorage.setItem('skts-cart',JSON.stringify(cart));}catch{}$('#cart-count').textContent=cart.length;renderServices(document.querySelector('[data-filter].active').dataset.filter);renderCart();}
function renderServices(filter='all'){$('#service-grid').innerHTML=services.filter(s=>filter==='all'||s.category===filter).map(s=>`<article class="service-card"><div class="service-icon" aria-hidden="true"><i class="ti ti-${({website:'browser',ui:'pencil',google:'map-pin',deployment:'rocket',support:'headset',app:'device-mobile'})[s.id]}"></i></div>${s.tag?`<span class="tag">${s.tag}</span>`:''}<h3>${s.name}</h3><p>${s.description}</p><ul>${s.features.map(f=>`<li><i class="ti ti-check" aria-hidden="true"></i>${f}</li>`).join('')}</ul><div class="card-bottom"><div class="price"><small>Starting price</small><strong>${money(s.price)}</strong> <small>${s.suffix||'per project'}</small></div><button class="add-button" data-add="${s.id}" ${cart.includes(s.id)?'disabled':''}>${cart.includes(s.id)?'Added':'Select service'}<span class="sr-only" hidden> ${s.name}</span></button></div></article>`).join('');}
function renderCart(){$('#cart-items').innerHTML=cart.length?cart.map(id=>{const s=services.find(s=>s.id===id);return `<div class="cart-item"><div><strong>${s.name}</strong><p>${s.suffix?'Monthly service · first month':'One project'}</p><button class="remove" data-remove="${s.id}">Remove</button></div><strong>${money(s.price)}</strong></div>`;}).join(''):'<div class="empty"><h3>Your next chapter is waiting.</h3><p>Explore our services and add one to your shortlist.</p><button class="button" data-close>Explore services</button></div>';$('#cart-summary').innerHTML=cart.length?`<div class="total-row"><span>Indicative total</span><strong>${money(total())}</strong></div><p class="pricing-note">Starting prices apply to the listed scope. Monthly services include the first month. No automatic renewal is enabled.</p><button class="button full" id="checkout-open">Request these services</button>`:'';}
document.addEventListener('click',e=>{const add=e.target.closest('[data-add]');if(add&&!cart.includes(add.dataset.add)){cart.push(add.dataset.add);save();notify('Service added to your shortlist');}const remove=e.target.closest('[data-remove]');if(remove){cart=cart.filter(id=>id!==remove.dataset.remove);save();}if(e.target.closest('[data-close]'))e.target.closest('dialog').close();if(e.target.closest('#checkout-open')){$('#cart-dialog').close();$('#checkout-form').hidden=false;$('#checkout-status').hidden=true;updateRequestFields();$('#checkout-total').innerHTML=`<div class="total-row"><span>Indicative total</span><strong>${money(total())}</strong></div>`;$('#checkout-dialog').showModal();}});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(f=>{f.classList.toggle('active',f===b);f.setAttribute('aria-pressed',String(f===b));});renderServices(b.dataset.filter);});
$('#cart-open').onclick=()=>$('#cart-dialog').showModal();document.querySelectorAll('#quote-open,[data-quote]').forEach(b=>b.onclick=()=>$('#quote-dialog').showModal());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#quote-download').onclick=e=>{e.preventDefault();const form=$('#quote-form');if(!['name','email','brief'].every(key=>form.elements.namedItem(key).reportValidity()))return;const data=new FormData(form);const content=`SKTS — Project brief\n\nName: ${data.get('name')}\nEmail: ${data.get('email')}\n\nProject:\n${data.get('brief')}\n`;const url=URL.createObjectURL(new Blob([content],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='SKTS-project-brief.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Project brief downloaded');};
$('#year').textContent=new Date().getFullYear();save();let installPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false;});$('#install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install').hidden=true;}};if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});

document.querySelectorAll('[data-category]').forEach(a=>a.addEventListener('click',()=>document.querySelector(`[data-filter="${a.dataset.category}"]`).click()));
const menuButton=$('#menu-toggle');menuButton.onclick=()=>{const open=$('#main-nav').classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');};
$('#main-nav').addEventListener('click',e=>{if(e.target.closest('a')){$('#main-nav').classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');}});


$('#copy-upi').onclick=async()=>{
  try{await navigator.clipboard.writeText($('#upi-id').textContent.trim());notify('UPI ID copied');}
  catch{notify('Please select and copy the UPI ID shown above.');}
};

function savedReceipts(){
  try{return readReceipts(window.localStorage);}catch{return [];}
}
function downloadReceipt(receipt){
  const url=URL.createObjectURL(new Blob([receiptText(receipt)],{type:'text/plain'}));
  const link=document.createElement('a');link.href=url;link.download=`${receipt.reference}-submission.txt`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openPaymentForm(reference=''){
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  if(reference)$('#payment-form').elements.namedItem('project-reference').value=reference;
  $('#payment-status').hidden=true;
  $('#payment-form').querySelector('[data-receipt]').hidden=true;
  const date=new Date();
  $('#payment-form').elements.namedItem('payment-date').max=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  $('#payment-dialog').showModal();
}
function renderReceiptHistory(){
  const list=$('#request-history-list');
  const receipts=savedReceipts();
  list.replaceChildren();$('#clear-receipts').hidden=receipts.length===0;
  if(!receipts.length){const message=document.createElement('p');message.textContent='No submission references saved on this browser yet. After a successful submission, your reference will appear here. If you used another device, contact us with the reference you saved.';list.append(message);return;}
  const items=document.createElement('ul');items.className='receipt-history';
  for(const receipt of receipts){
    const item=document.createElement('li');const heading=document.createElement('strong');heading.textContent=receiptLabel(receipt.kind);
    const code=document.createElement('code');code.textContent=receipt.reference;
    const status=document.createElement('span');status.className='receipt-state';status.textContent=receiptStatus(receipt.kind);
    const date=document.createElement('time');date.dateTime=receipt.submittedAt;date.textContent=new Date(receipt.submittedAt).toLocaleString('en-IN');
    const contact=document.createElement('a');contact.className='text-link';contact.textContent='Ask for an update';contact.target='_blank';contact.rel='noopener noreferrer';contact.href='https://wa.me/919840407296?text='+encodeURIComponent(`Hello SKTS, please share an update for reference ${receipt.reference}.`);
    const download=document.createElement('button');download.type='button';download.className='text-link';download.textContent='Download receipt ↓';download.onclick=()=>downloadReceipt(receipt);
    const actions=document.createElement('div');actions.className='form-actions';actions.append(contact,download);
    if(receipt.kind!=='payment'){const payment=document.createElement('button');payment.type='button';payment.className='text-link';payment.textContent='Submit payment reference';payment.onclick=()=>openPaymentForm(receipt.reference);actions.append(payment);}
    item.append(heading,code,status,date,actions);items.append(item);
  }
  list.append(items);
}
function recordSubmission(form,reference){
  const receipt={reference,kind:form.id==='payment-form'?'payment':form.id==='checkout-form'?'service':'enquiry',submittedAt:new Date().toISOString()};
  try{rememberReceipt(window.localStorage,receipt);}catch{}
  const panel=form.querySelector('[data-receipt]');
  panel.receipt=receipt;panel.querySelector('[data-reference]').textContent=reference;panel.hidden=false;
  renderReceiptHistory();
}
$('#payment-open').onclick=()=>openPaymentForm();
$('#clear-receipts').onclick=()=>{try{if(!clearReceipts(window.localStorage)){notify('Could not clear references on this browser.');return;}}catch{notify('Could not clear references on this browser.');return;}renderReceiptHistory();};
document.addEventListener('click',async event=>{
  const panel=event.target.closest('[data-receipt]');if(!panel)return;
  if(event.target.closest('[data-copy-reference]')){try{await navigator.clipboard.writeText(panel.receipt.reference);notify('Reference copied');}catch{notify('Please select and copy the reference shown above.');}}
  if(event.target.closest('[data-download-receipt]'))downloadReceipt(panel.receipt);
  if(event.target.closest('[data-report-payment]'))openPaymentForm(panel.receipt.reference);
  if(event.target.closest('[data-view-references]'))event.target.closest('dialog').close();
});
renderReceiptHistory();

function updateRequestFields(){
  const form=$('#checkout-form');
  form.elements.namedItem('services').value=cart.map(id=>{const service=services.find(item=>item.id===id);return `${service.name}: ${money(service.price)}${service.suffix||' per project'}`;}).join('\n');
  form.elements.namedItem('estimated-total').value=`${money(total())} (indicative; final quote required)`;
}
function formStatus(form,message,state){
  const status=form.querySelector('.form-status');
  status.textContent=message;status.dataset.state=state;status.hidden=false;status.focus();
}
async function sendEnquiry(event){
  event.preventDefault();
  const form=event.currentTarget;
  if(form.dataset.submitting==='true'||form.dataset.checkingLocal==='true'||!form.reportValidity())return;
  const previousReceipt=form.querySelector('[data-receipt]');if(previousReceipt)previousReceipt.hidden=true;
  form.querySelector('.form-status').hidden=true;
  const kind=form.id==='payment-form'?'payment':form.id==='checkout-form'?'service':'enquiry';
  if(kind==='service'){
    if(!cart.length){formStatus(form,'Choose at least one service before sending a request.','error');return;}
    updateRequestFields();
  }
  if(kind==='payment'){
    const project=form.elements.namedItem('project-reference');const transaction=form.elements.namedItem('transaction-reference');const amount=Number(form.elements.namedItem('amount').value);
    project.value=project.value.trim();transaction.value=transaction.value.trim();
    if(project.value.length<4||transaction.value.length<6||!Number.isFinite(amount)||amount<0.01||Math.abs(amount*100-Math.round(amount*100))>0.000001){formStatus(form,'Enter your project / quote reference, the transaction reference from your payment app, and a valid amount in INR.','error');return;}
  }
  const localSubmission=['localhost','127.0.0.1','[::1]'].includes(location.hostname)||location.hostname.endsWith('.localhost')||location.protocol==='file:';
  let localCsrf;
  if(localSubmission){
    form.dataset.checkingLocal='true';
    const checkController=new AbortController();const checkTimer=setTimeout(()=>checkController.abort(),20000);
    try{
      const capability=await fetch('/api/local/config',{cache:'no-store',credentials:'same-origin',signal:checkController.signal});
      const config=await capability.json();
      if(!capability.ok||config.local!==true||config.ready!==true||!config.csrf)throw new Error('Local backend unavailable');
      localCsrf=config.csrf;
    }catch{formStatus(form,'The local backend is not running. Start it with npm run dev, or use the published website to contact us. Your details have not been sent.','error');return;}
    finally{clearTimeout(checkTimer);form.dataset.checkingLocal='false';}
  }
  const referenceField=form.elements.namedItem(kind==='payment'?'submission-reference':'request-reference');
  try{if(!referenceField.value)referenceField.value=createReference(kind);}catch{formStatus(form,'We could not create a reference. Please try again or contact us directly.','error');return;}
  const reference=referenceField.value;
  form.elements.namedItem('subject').value=`SKTS ${receiptLabel(kind)} — ${reference}`;
  const submit=form.querySelector('[type="submit"]');const originalText=submit.textContent;const data=new FormData(form);
  form.dataset.submitting='true';form.setAttribute('aria-busy','true');submit.disabled=true;submit.textContent='Sending…';
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(localSubmission?'/api/local/intake':'/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(localSubmission?{'X-SKTS-CSRF':localCsrf}:{})},body:new URLSearchParams(data).toString(),signal:controller.signal});
    if(!response.ok)throw new Error('Submission rejected');
    form.reset();
    if(kind==='service'){cart=[];save();$('#checkout-total').replaceChildren();}
    // A saved receipt records acceptance of the form, never a verified payment.
    try{recordSubmission(form,reference);}catch{} // Receipt display/storage failure must not turn an accepted request into a failed submission.
    formStatus(form,kind==='payment'?`Your payment reference has been submitted. Submission reference: ${reference}. Status: awaiting manual verification. We’ll confirm receipt after checking our account.`:`Thank you — your request has been received. Your reference: ${reference}. Keep this reference for updates. This request does not process a payment.`,'success');
    if(localSubmission)formStatus(form,`Saved to this computer’s database. Reference: ${reference}. ${kind==='payment'?'Payment remains pending manual verification. ':''}No email notification was sent.`,'success');
    notify(kind==='payment'?'Payment reference submitted for review':'Request received');
  }catch(error){
    formStatus(form,error.name==='AbortError'?`We could not confirm whether your request arrived. Keep reference ${reference} and contact us before trying again.`:`Your request could not be sent. Your details are still here so you can try again, or contact skwebstudio18@gmail.com / +91 98404 07296. Reference: ${reference}.`,'error');
  }finally{clearTimeout(timer);form.dataset.submitting='false';form.removeAttribute('aria-busy');submit.disabled=false;submit.textContent=originalText;}
}
$('#quote-form').addEventListener('submit',sendEnquiry);
$('#checkout-form').addEventListener('submit',sendEnquiry);
$('#payment-form').addEventListener('submit',sendEnquiry);
