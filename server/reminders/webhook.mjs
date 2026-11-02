import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {applyDeliveryEvents} from './delivery.mjs';
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length>4096||b.length>4096)return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
const response=(text,status=200)=>new Response(text,{status,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
export function createWhatsAppWebhook({pool,config}){
  return async request=>{
    if(!config.appSecret||!config.verifyToken||!config.phoneId)return response('Webhook not configured.',503);
    const url=new URL(request.url);
    if(request.method==='GET'){
      if(url.searchParams.get('hub.mode')!=='subscribe'||!equal(url.searchParams.get('hub.verify_token'),config.verifyToken))return response('Verification rejected.',403);
      return response(url.searchParams.get('hub.challenge')??'');
    }
    if(request.method!=='POST')return response('Method not allowed.',405);
    const raw=await request.text();if(raw.length>100000)return response('Payload too large.',413);
    const signature=request.headers.get('x-hub-signature-256');
    if(!equal(signature,'sha256='+createHmac('sha256',config.appSecret).update(raw).digest('hex')))return response('Signature rejected.',403);
    let body;try{body=JSON.parse(raw);}catch{return response('Invalid JSON.',400);}
    if(body.object!=='whatsapp_business_account')return response('Ignored.');
    for(const entry of (Array.isArray(body.entry)?body.entry:[]).slice(0,50))for(const change of (Array.isArray(entry.changes)?entry.changes:[]).slice(0,50)){
      const value=change.value;if(value?.metadata?.phone_number_id!==config.phoneId)continue;
      for(const item of (Array.isArray(value.statuses)?value.statuses:[]).slice(0,100)){
        if(!['sent','delivered','read','failed'].includes(item.status)||typeof item.id!=='string'||item.id.length>512||!/^\d{9,12}$/.test(String(item.timestamp)))continue;
        const at=new Date(Number(item.timestamp)*1000);if(!Number.isFinite(at.getTime()))continue;
        const errorCode=item.errors?.[0]?.code==null?null:String(item.errors[0].code).replace(/[^0-9A-Z_]/gi,'').slice(0,40);
        await pool.query('INSERT INTO skts_whatsapp_status_events (message_id,status,event_at,error_code) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[item.id,item.status,at,errorCode]);
        await applyDeliveryEvents(pool,item.id);
      }
      for(const message of (Array.isArray(value.messages)?value.messages:[]).slice(0,100)){
        if(message.type!=='text'||!/^(STOP|UNSUBSCRIBE|CANCEL REMINDERS)$/i.test(message.text?.body?.trim()??'')||typeof message.id!=='string'||message.id.length>512||!/^\d{8,15}$/.test(message.from??''))continue;
        const db=await pool.connect();
        try{
          await db.query('BEGIN');
          const inserted=await db.query('INSERT INTO skts_whatsapp_opt_outs (message_id,phone) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING message_id',[message.id,'+'+message.from]);
          if(inserted.rows.length){
            const projects=await db.query('UPDATE skts_requests SET reminder_enabled=false,whatsapp_opted_in_at=NULL,whatsapp_consent_note=$2,version=version+1 WHERE whatsapp_phone=$1 RETURNING reference',['+'+message.from,'Client replied STOP on WhatsApp']);
            for(const project of projects.rows)await db.query(`INSERT INTO skts_request_events (id,request_reference,message,visibility) VALUES ($1,$2,$3,'customer')`,[randomUUID(),project.reference,'WhatsApp reminders stopped at the client’s request.']);
          }
          await db.query('COMMIT');
        }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
      }
    }
    return response('OK');
  };
}
