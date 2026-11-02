import {instructions,ASSISTANT_MODEL} from './knowledge.mjs';
import {AssistantLimit} from './quota.mjs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Vary':'Origin'};
const json=(data,status=200)=>Response.json(data,{status,headers});
export function validateMessages(body){
  if(!body||Object.keys(body).some(k=>k!=='messages')||!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>7)throw new Error('Send a short question and at most three previous replies.');
  let total=0;
  const messages=body.messages.map((m,i)=>{
    if(!m||Object.keys(m).some(k=>!['role','content'].includes(k))||m.role!==(i%2===0?'user':'assistant')||typeof m.content!=='string'||!m.content.trim()||m.content.length>(m.role==='user'?800:2400))throw new Error('Please use a question of 800 characters or fewer.');
    total+=m.content.length;return {role:m.role,content:m.content.trim()};
  });
  if(messages.at(-1).role!=='user'||total>6000)throw new Error('This conversation is too long. Start a new chat.');
  return messages;
}
export function createAssistant({available,claim,complete}){
  return async(request,context={})=>{
    if(request.method==='GET')return json({available:!!available(),dailyLimit:20});
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Open the assistant on the SKTS website.'},403);
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Send JSON data.'},415);
    if(!available())return json({error:'AI replies are unavailable right now. Browse our service guide or contact SKTS.'},503);
    let messages;
    try{
      if(Number(request.headers.get('content-length'))>16000)return json({error:'Question is too large.'},413);
      const reader=request.body?.getReader();if(!reader)return json({error:'A question is required.'},400);
      let size=0;const chunks=[];
      try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();return json({error:'Question is too large.'},413);}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
      messages=validateMessages(JSON.parse(new TextDecoder().decode(bytes)));
    }catch(error){return json({error:error instanceof SyntaxError?'Send valid JSON.':error.message},400);}
    try{await claim(context.ip);}catch(error){return json({error:error instanceof AssistantLimit?error.message:'AI is temporarily unavailable. Please contact SKTS.'},error instanceof AssistantLimit?429:503);}
    const abort=new AbortController(),signal=AbortSignal.any([request.signal,abort.signal,AbortSignal.timeout(25000)]);
    let upstream;
    try{upstream=await complete({model:ASSISTANT_MODEL,messages:[{role:'system',content:instructions},...messages],stream:true,store:false,reasoning_effort:'none',max_completion_tokens:600},{signal,maxRetries:0,timeout:25000});}
    catch{return json({error:'AI could not answer right now. Please try later or contact SKTS.'},503);}
    const encoder=new TextEncoder();
    const stream=new ReadableStream({
      async start(controller){
        const send=data=>controller.enqueue(encoder.encode('data: '+JSON.stringify(data)+'\n\n'));
        let length=0,limited=false;
        try{
          for await(const event of upstream){const choice=event.choices?.[0];if(choice?.finish_reason==='length')limited=true;const delta=choice?.delta?.content;if(typeof delta==='string'&&delta){const text=delta.slice(0,3200-length);length+=text.length;send({type:'delta',text});if(length>=3200){limited=true;abort.abort();break;}}}
          if(!length||limited)throw new Error('Incomplete answer');send({type:'done'});
        }catch{try{send({type:'error',message:'This reply could not be completed. Please contact SKTS or try again later.'});}catch{}}
        finally{try{controller.close();}catch{}}
      },cancel(){abort.abort();}
    });
    return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8'}});
  };
}
