import {services} from './services.mjs?v=1';

export async function readAssistantStream(response,onDelta){
  if(!response.body)throw new Error('No reply was received. Please try again.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',length=0;
  try{
    while(true){
      const {value,done}=await reader.read();if(done)break;
      buffer+=decoder.decode(value,{stream:true});if(buffer.length>16000)throw new Error('The reply could not be read.');
      let end;
      while((end=buffer.indexOf('\n\n'))>=0){
        const part=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(!part.startsWith('data: '))throw new Error('The reply could not be read.');
        const event=JSON.parse(part.slice(6));
        if(event.type==='delta'&&typeof event.text==='string'){length+=event.text.length;if(length>3200)throw new Error('The reply was too long. Please contact SKTS.');onDelta(event.text);}
        else if(event.type==='done'){if(!length)throw new Error('No answer was received.');return;}
        else if(event.type==='error')throw new Error('The reply was interrupted. Please try later or contact SKTS.');
        else throw new Error('The reply could not be read.');
      }
    }
    throw new Error('The reply was interrupted. Please try later or contact SKTS.');
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

function mountAssistant(){
  const star='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z"/></svg>';
  document.body.insertAdjacentHTML('beforeend',`<button id="assistant-open" class="assistant-launcher" aria-haspopup="dialog" aria-controls="assistant-dialog">${star}<span>Ask SKTS<span class="assistant-launcher-note">AI service guide</span></span></button><dialog id="assistant-dialog" aria-labelledby="assistant-title" aria-describedby="assistant-disclosure"><header class="assistant-heading"><span class="assistant-avatar">${star}</span><div><span class="assistant-eyebrow">A LITTLE CLARITY, ON DEMAND</span><h2 id="assistant-title">Your SKTS service guide</h2><p>Find the right next step for your business.</p></div><button id="assistant-close" aria-label="Close service guide">×</button></header><div class="assistant-toolbar"><span id="assistant-availability" role="status">Checking AI availability…</span><button id="assistant-new" type="button">New chat</button></div><div id="assistant-messages" role="log" aria-label="Service guide conversation" aria-live="polite" aria-relevant="additions" tabindex="0"></div><div class="assistant-prompts" aria-label="Suggested questions"><button type="button" data-assistant-prompt="prices">Starting prices</button><button type="button" data-assistant-prompt="choose">Help me choose ✦</button><button type="button" data-assistant-prompt="portal">Client portal</button></div><form id="assistant-form"><label for="assistant-question">Ask about your website or digital project</label><div class="assistant-compose"><textarea id="assistant-question" name="question" rows="2" maxlength="800" required placeholder="What would help your business grow?"></textarea><button id="assistant-send" type="submit" aria-label="Send question to AI">↑</button></div><p id="assistant-status" role="status" hidden></p></form><p id="assistant-disclosure">AI can make mistakes. Final scope and pricing are confirmed by our team. Messages are processed by Netlify/OpenAI; don’t share passwords, payment details or private files. <a href="/privacy/#ai-assistant">Privacy</a></p><div class="assistant-actions"><button type="button" id="assistant-quote">Request a quote <span aria-hidden="true">↗</span></button><a href="/contact/" id="assistant-contact">Talk to our team</a></div></dialog>`);
  const $=s=>document.querySelector(s),dialog=$('#assistant-dialog'),launcher=$('#assistant-open'),log=$('#assistant-messages'),form=$('#assistant-form'),input=$('#assistant-question'),status=$('#assistant-status');
  let history=[],busy=false,available=false,checked=false,blocked=false,requestController,enquiryHandoff=false;
  const notice=message=>{status.textContent=message;status.hidden=!message;};
  const message=(role,text,source)=>{const node=document.createElement('div');node.className='assistant-message '+role;const name=document.createElement('span');name.className='assistant-message-source';name.textContent=role==='visitor'?'YOU':source;const body=document.createElement('p');body.textContent=text;node.append(name,body);log.append(node);log.scrollTop=log.scrollHeight;return body;};
  const welcome=()=>message('guide','Hello! I can explain starting prices, help you choose a service, or point you to the right place. What are you planning?','SKTS WEBSITE GUIDE');
  function controls(){for(const id of ['#assistant-send','#assistant-new'])$(id).disabled=busy;input.disabled=busy;$('#assistant-send').textContent=busy?'…':'↑';form.setAttribute('aria-busy',String(busy));}
  async function check(){
    if(checked)return;
    try{const r=await fetch('/api/assistant',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(5000)});const data=await r.json();available=r.ok&&data.available===true;checked=true;}catch{available=false;}
    $('#assistant-availability').textContent=available?'✦ AI replies available':'Service information available · AI offline';
  }
  launcher.onclick=()=>{dialog.showModal();input.focus();void check();};
  $('#assistant-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{requestController?.abort();if(!enquiryHandoff)launcher.focus();enquiryHandoff=false;});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  $('#assistant-new').onclick=()=>{history=[];blocked=false;log.replaceChildren();input.value='';notice('');welcome();input.focus();};
  $('#assistant-quote').onclick=()=>{enquiryHandoff=true;dialog.close();document.querySelector('#quote-open,[data-quote]')?.click();};
  $('#assistant-contact').onclick=()=>dialog.close();
  document.querySelectorAll('[data-assistant-prompt]').forEach(button=>button.onclick=()=>{
    if(busy)return;
    if(button.dataset.assistantPrompt==='choose'){input.value='Help me choose the right service for my business. What should I consider first?';input.focus();notice('Press Send to ask the AI assistant.');return;}
    if(button.dataset.assistantPrompt==='prices'){message('visitor','What are your starting prices?');message('guide',services.map(s=>`${s.name}: ₹${s.price.toLocaleString('en-IN')}${s.suffix?' / month':' / project'}`).join('\n')+'\n\nThese are starting prices. Scope, taxes and third-party costs need a written quote. The app package is a PWA; native apps and digital branding need a custom quote.','SKTS WEBSITE INFORMATION');}
    else{message('visitor','How does the client portal work?');message('guide','SKTS sends an invitation to your client email. Open the link, choose your own password, then use Client portal to see your services, milestones, agreed budget, verified payments and project documents. This service guide cannot access private project records.','SKTS WEBSITE INFORMATION');}
  });
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;
    const question=input.value.trim();if(!question)return;
    busy=true;controls();await check();if(!available||blocked){busy=false;controls();notice(blocked?'Your AI limit has been reached. Starting prices and Client portal information still work.':'AI is unavailable right now. Use Starting prices or contact our team.');return;}
    busy=true;controls();notice('Thinking about your project…');message('visitor',question);const answer=message('guide','', 'AI REPLY');let text='';
    requestController=new AbortController();
    let previous=history.slice(-6);while(previous.length&&previous.reduce((n,m)=>n+m.content.length,question.length)>6000)previous=previous.slice(2);
    try{
      const r=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[...previous,{role:'user',content:question}]}),credentials:'omit',signal:AbortSignal.any([requestController.signal,AbortSignal.timeout(35000)])});
      if(!r.ok){if(r.status===429)blocked=true;const data=await r.json().catch(()=>({}));throw new Error(data.error||'AI could not answer. Please contact SKTS.');}
      await readAssistantStream(r,delta=>{text+=delta;answer.textContent=text;log.scrollTop=log.scrollHeight;});
      history=[...previous,{role:'user',content:question},{role:'assistant',content:text.slice(0,2400)}];input.value='';notice('AI reply complete. Our team confirms final scope and pricing.');
    }catch(error){answer.parentElement.classList.add('assistant-message-error');if(!text)answer.textContent='No AI answer was completed.';notice(error.name==='AbortError'?'Reply stopped. Your question is still available to retry.':error.message);}
    finally{busy=false;requestController=undefined;controls();if(dialog.open)input.focus();}
  };
  welcome();
}
if(typeof document!=='undefined'&&document.querySelector('#home'))mountAssistant();
