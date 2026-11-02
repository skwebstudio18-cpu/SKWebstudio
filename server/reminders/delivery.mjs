import {randomUUID} from 'node:crypto';
import {PortalRepository} from '../portal/repository.mjs';
import {indiaDay,reminderStage} from '../portal/tracking.mjs';
import {sendMetaTemplate} from './meta.mjs';
export async function applyDeliveryEvents(pool,messageId){
  const {rows}=await pool.query(`SELECT status,error_code FROM skts_whatsapp_status_events WHERE message_id=$1 ORDER BY CASE status WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 ELSE 1 END DESC,event_at DESC,CASE status WHEN 'failed' THEN 1 ELSE 0 END DESC LIMIT 1`,[messageId]);
  if(!rows.length)return;
  const event=rows[0];
  await pool.query(`UPDATE skts_reminder_deliveries SET status=$2,error_code=$3,updated_at=now() WHERE provider_message_id=$1 AND NOT(status='read' AND $2<>'read') AND NOT(status='delivered' AND $2 IN ('sent','failed'))`,[messageId,event.status,event.error_code]);
}
export async function runReminders({pool,config,now=new Date(),send=(p)=>sendMetaTemplate(config,p),respectHours=true}){
  const result={accepted:0,failed:0,unknown:0,suppressed:0};
  if(!config.configured||!config.enabled)return {...result,disabled:true};
  const hour=new Date(now.getTime()+330*60000).getUTCHours();
  if(respectHours&&(hour<9||hour>=18))return {...result,outsideHours:true};
  await pool.query(`UPDATE skts_reminder_deliveries SET status='unknown',error_code='WORKER_INTERRUPTED',updated_at=now() WHERE status='sending' AND created_at<now()-interval '15 minutes'`);
  const repository=new PortalRepository(pool),today=indiaDay(now);
  const candidates=await repository.reminderCandidates(today);
  for(const candidate of candidates.filter(project=>reminderStage(project,now)).slice(0,3)){
    let claim;
    await repository.transaction(async db=>{
      const locked=await db.query('SELECT reference FROM skts_requests WHERE reference=$1 FOR UPDATE',[candidate.reference]);if(!locked.rows.length)return;
      const snapshot=(await repository.request({admin:true,email:''},candidate.reference,db)).project;
      const stage=reminderStage(snapshot,now);if(!stage)return;
      const id=randomUUID();
      const inserted=await db.query(`INSERT INTO skts_reminder_deliveries (id,request_reference,due_date,stage,amount_paise) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(request_reference,due_date,stage) DO NOTHING RETURNING id`,[id,snapshot.reference,snapshot.payment_due_date,stage,snapshot.due_paise]);
      if(inserted.rows.length)claim={id,snapshot};
    });
    if(!claim)continue;
    // Recheck consent, payment reviews, balance and version immediately before sending.
    const latest=(await repository.request({admin:true,email:''},claim.snapshot.reference)).project;
    let outcome;
    if(latest.version!==claim.snapshot.version||!reminderStage(latest,now))outcome={status:'suppressed',errorCode:'PROJECT_CHANGED'};
    else try{outcome=await send(latest);}catch{outcome={status:'unknown',errorCode:'NETWORK_OUTCOME_UNKNOWN'};}
    if(!['accepted','failed','unknown','suppressed'].includes(outcome?.status))outcome={status:'unknown',errorCode:'INVALID_PROVIDER_RESULT'};
    await pool.query(`UPDATE skts_reminder_deliveries SET provider_message_id=$2,status=$3,error_code=$4,updated_at=now() WHERE id=$1`,[claim.id,outcome.messageId??null,outcome.status,outcome.errorCode??null]);
    if(outcome.messageId)await applyDeliveryEvents(pool,outcome.messageId);
    result[outcome.status]++;
  }
  return result;
}
