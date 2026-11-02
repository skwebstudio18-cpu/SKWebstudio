import { randomUUID, randomBytes } from 'node:crypto';
import { PortalError, ingestRecord, money, textField } from './model.mjs';
import { financials } from './tracking.mjs';
import {projectReport} from './report.mjs';
const requestColumns = 'reference, kind, customer_email, customer_name, phone, business, brief, services, indicative_total, status, quoted_amount_paise, version, created_at, updated_at';
const paymentColumns = 'reference, project_reference, customer_email, customer_name, reported_amount_paise, transaction_reference, payment_date::text AS payment_date, brief, verification_status, verified_amount_paise, review_note, reviewed_at, version, created_at';
const trackingColumns='budget_agreed, payment_due_date, payment_target_paise, reminder_enabled, reminder_schedule, whatsapp_phone, whatsapp_opted_in_at, whatsapp_consent_note, progress_plan_agreed, progress_plan_agreed_at';
const requestSelect=[requestColumns,trackingColumns].join(', ').split(', ').map(column=>column==='payment_due_date'?'r.payment_due_date::text AS payment_due_date':'r.'+column).join(', ')+`, COALESCE((SELECT sum(p.verified_amount_paise) FROM skts_payment_references p WHERE p.project_reference=r.reference AND p.customer_email=r.customer_email AND p.verification_status='verified'),0) AS verified_paid_paise, (SELECT count(*) FROM skts_payment_references p WHERE p.project_reference=r.reference AND p.customer_email=r.customer_email AND p.verification_status='pending') AS pending_payment_count`;
const present=(row,actor)=>{const result=financials(row);if(!actor.admin)delete result.whatsapp_consent_note;return result;};
export class PortalRepository {
  constructor(pool) { this.pool = pool; }
  async transaction(fn) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async ingest(record) {
    if (!record) return;
    return this.transaction(async db => {
      if (record.kind === 'payment') {
        await db.query(`INSERT INTO skts_payment_references (reference,project_reference,customer_email,customer_name,reported_amount_paise,transaction_reference,payment_date,brief) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (reference) DO NOTHING`, [record.reference,record.projectReference,record.email,record.name,record.amount,record.transactionReference,record.date,record.brief]);
      } else {
        const inserted = await db.query(`INSERT INTO skts_requests (reference,kind,customer_email,customer_name,phone,business,brief,services,indicative_total,quoted_amount_paise) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (reference) DO NOTHING RETURNING reference`, [record.reference,record.kind,record.email,record.name,record.phone,record.business,record.brief,record.services,record.indicativeTotal,record.quote??null]);
        if (inserted.rowCount) {
          await db.query(`INSERT INTO skts_request_events (id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`, [randomUUID(),record.reference,record.createdBy??null,record.createdBy?'Project created by SKTS.':'Request received. We will review your project details.']);
          for(const [index,title] of record.services.split('\n').filter(Boolean).slice(0,30).entries())await db.query('INSERT INTO skts_project_services (id,request_reference,title,sort_order) VALUES ($1,$2,$3,$4)',[randomUUID(),record.reference,title.replace(/:\s*(?:₹|INR|Rs\.?).*$/i,'').slice(0,160),index]);
        }
      }
    });
  }
  async listRequests(actor, offset = 0) {
    const { rows } = await this.pool.query(`SELECT ${requestSelect} FROM skts_requests r WHERE ($1::boolean OR r.customer_email = $2) ORDER BY r.created_at DESC, r.reference LIMIT 51 OFFSET $3`,[actor.admin,actor.email,offset]);
    return { items: rows.slice(0,50).map(row=>present(row,actor)), hasMore: rows.length > 50 };
  }
  async listPayments(actor, offset = 0) {
    const { rows } = await this.pool.query(`SELECT ${paymentColumns}, EXISTS(SELECT 1 FROM skts_requests r WHERE r.reference = p.project_reference AND r.customer_email = p.customer_email) AS matched_project FROM skts_payment_references p WHERE ($1::boolean OR customer_email = $2) ORDER BY created_at DESC, reference LIMIT 51 OFFSET $3`,[actor.admin,actor.email,offset]);
    return { items: rows.slice(0,50), hasMore: rows.length > 50 };
  }
  async request(actor, reference,db=this.pool) {
    const { rows } = await db.query(`SELECT ${requestSelect} FROM skts_requests r WHERE r.reference = $1 AND ($2::boolean OR r.customer_email = $3)`,[reference,actor.admin,actor.email]);
    if (!rows.length) throw new PortalError(404,'Project not found.');
    const events = await db.query(`SELECT id,message,visibility,created_at FROM skts_request_events WHERE request_reference = $1 AND ($2::boolean OR visibility = 'customer') ORDER BY created_at, id`,[reference,actor.admin]);
    const services=await db.query('SELECT id,title,status,notes,weight_points,target_date::text AS target_date,delivered_at,completed_at,accepted_at FROM skts_project_services WHERE request_reference=$1 ORDER BY sort_order,id',[reference]);
    const reminders=await db.query('SELECT id,stage,status,amount_paise,error_code,created_at,updated_at FROM skts_reminder_deliveries WHERE request_reference=$1 ORDER BY created_at DESC LIMIT 20',[reference]);
    const project=present(rows[0],actor);
    return { project, events: events.rows,services:services.rows,reminders:reminders.rows,report:projectReport(project,services.rows) };
  }
  async updateRequest(actor, reference, input) {
    if (!actor.admin) throw new PortalError(403,'Administrator access required.');
    return this.transaction(async db => {
      const current = await db.query('SELECT * FROM skts_requests WHERE reference = $1 FOR UPDATE',[reference]);
      if (!current.rows.length) throw new PortalError(404,'Project not found.');
      const prior = current.rows[0];
      if (prior.version !== input.version) throw new PortalError(409,'This project changed. Refresh before saving.');
      const changed = prior.status !== input.status || String(prior.quoted_amount_paise ?? '') !== String(input.quote ?? '');
      if (!changed && !input.message && !input.internalNote) throw new PortalError(400,'Add an update before saving.');
      const quoteChanged=String(prior.quoted_amount_paise??'')!==String(input.quote??'');
      await db.query(`UPDATE skts_requests SET status=$2, quoted_amount_paise=$3, budget_agreed=CASE WHEN $4 THEN false ELSE budget_agreed END, reminder_enabled=CASE WHEN $4 THEN false ELSE reminder_enabled END, payment_due_date=CASE WHEN $4 THEN NULL ELSE payment_due_date END, payment_target_paise=CASE WHEN $4 THEN NULL ELSE payment_target_paise END, version=version+1, updated_at=now() WHERE reference=$1`,[reference,input.status,input.quote,quoteChanged]);
      const event = async (message, visibility) => db.query(`INSERT INTO skts_request_events (id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,$5)`,[randomUUID(),reference,actor.id,message,visibility]);
      if (changed) await event(`Project status: ${input.status.replaceAll('_',' ')}. ${input.quote ? `Quote: INR ${(input.quote / 100).toFixed(2)}.` : 'Quote not set.'}`,'customer');
      if(quoteChanged&&prior.budget_agreed)await event('The budget changed. Budget agreement and the payment schedule need to be reconfirmed; reminders are paused.','customer');
      if (input.message) await event(input.message,'customer');
      if (input.internalNote) await event(input.internalNote,'internal');
      return { saved: true };
    });
  }
  async reviewPayment(actor, reference, input) {
    if (!actor.admin) throw new PortalError(403,'Administrator access required.');
    try { return await this.transaction(async db => {
      const { rows } = await db.query('SELECT * FROM skts_payment_references WHERE reference=$1 FOR UPDATE',[reference]);
      if (!rows.length) throw new PortalError(404,'Payment reference not found.');
      const prior = rows[0];
      if (prior.version !== input.version) throw new PortalError(409,'This payment changed. Refresh before saving.');
      await db.query(`UPDATE skts_payment_references SET verification_status=$2, verified_amount_paise=$3, review_note=$4, reviewed_by=$5, reviewed_at=now(), version=version+1 WHERE reference=$1`,[reference,input.status,input.amount,input.note,actor.id]);
      await db.query(`INSERT INTO skts_payment_audit (id,payment_reference,actor_id,previous_status,new_status,verified_amount_paise,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),reference,actor.id,prior.verification_status,input.status,input.amount,input.note]);
      // Only associate a payment with a project when both the reference and owner email match.
      await db.query(`INSERT INTO skts_request_events (id,request_reference,actor_id,message,visibility) SELECT $1, reference, $2, $3, 'customer' FROM skts_requests WHERE reference=$4 AND customer_email=$5`,[randomUUID(),actor.id,`Payment reference ${reference}: ${input.status}. ${input.amount ? `Verified INR ${(input.amount / 100).toFixed(2)}. ` : ''}${input.note}`,prior.project_reference,prior.customer_email]);
      await db.query('UPDATE skts_requests SET version=version+1,updated_at=now() WHERE reference=$1 AND customer_email=$2',[prior.project_reference,prior.customer_email]);
      return { saved: true };
    }); } catch (error) {
      if (error.code === '23505') throw new PortalError(409,'This transaction reference is already verified on another submission. Check for a duplicate.');
      throw error;
    }
  }
  async createProject(actor,body){
    if(!actor.admin)throw new PortalError(403,'Administrator access required.');
    const reference=`SKTS-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomBytes(8).toString('hex').toUpperCase()}`;
    const record=ingestRecord({'record-kind':'enquiry','request-reference':reference,email:body.email,name:body.name,phone:body.phone??'',business:body.business??'',brief:body.brief??'',services:textField(body.services??'',2000)});
    record.quote=body.quote?money(body.quote):null;record.createdBy=actor.id;
    await this.ingest(record);return {reference};
  }
  async updateServices(actor,reference,input){
    if(!actor.admin)throw new PortalError(403,'Administrator access required.');
    return this.transaction(async db=>{
      const {rows}=await db.query('SELECT version,progress_plan_agreed FROM skts_requests WHERE reference=$1 FOR UPDATE',[reference]);
      if(!rows.length)throw new PortalError(404,'Project not found.');
      if(rows[0].version!==input.version)throw new PortalError(409,'The project changed. Discard your edit and refresh.');
      const existing=(await db.query('SELECT id,title,status,notes,weight_points,target_date::text AS target_date FROM skts_project_services WHERE request_reference=$1',[reference])).rows;
      const ids=new Set(existing.map(s=>s.id));
      if(input.services.some(s=>s.id&&!ids.has(s.id)))throw new PortalError(400,'A service does not belong to this project.');
      const normalized=input.services.map(s=>{const prior=existing.find(x=>x.id===s.id);return {...s,weight:s.weight===undefined?prior?.weight_points??null:s.weight,targetDate:s.targetDate===undefined?prior?.target_date??null:s.targetDate};});
      const scopeChanged=normalized.length!==existing.length||normalized.some(s=>{const prior=existing.find(x=>x.id===s.id);return !prior||prior.title!==s.title||prior.weight_points!==s.weight||prior.target_date!==s.targetDate||(prior.status==='cancelled')!==(s.status==='cancelled');});
      const agreed=input.planAgreed??(scopeChanged?false:rows[0].progress_plan_agreed);
      const active=normalized.filter(s=>s.status!=='cancelled');
      if(agreed&&(!active.length||active.some(s=>!s.weight)))throw new PortalError(400,'Set a positive weight for every active milestone before confirming the progress plan.');
      const retained=input.services.map(s=>s.id).filter(Boolean);
      await db.query('DELETE FROM skts_project_services WHERE request_reference=$1 AND NOT(id=ANY($2::uuid[]))',[reference,retained]);
      for(const [index,service]of normalized.entries())await db.query(`INSERT INTO skts_project_services (id,request_reference,title,status,notes,sort_order,weight_points,target_date,delivered_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $4 IN ('delivered','awaiting_approval') THEN now() END,CASE WHEN $4='completed' THEN now() END) ON CONFLICT (id) DO UPDATE SET title=$3,status=$4,notes=$5,sort_order=$6,weight_points=$7,target_date=$8,accepted_at=CASE WHEN skts_project_services.title=$3 AND $4='completed' THEN skts_project_services.accepted_at END,accepted_by=CASE WHEN skts_project_services.title=$3 AND $4='completed' THEN skts_project_services.accepted_by END,delivered_at=CASE WHEN skts_project_services.title=$3 AND $4 IN ('delivered','awaiting_approval','completed') THEN COALESCE(skts_project_services.delivered_at,CASE WHEN $4 IN ('delivered','awaiting_approval') THEN now() END) END,completed_at=CASE WHEN $4='completed' THEN CASE WHEN skts_project_services.status='completed' AND skts_project_services.title=$3 THEN skts_project_services.completed_at ELSE now() END END,updated_at=now()`,[service.id??randomUUID(),reference,service.title,service.status,service.notes,index,service.weight,service.targetDate]);
      await db.query('UPDATE skts_requests SET progress_plan_agreed=$2,progress_plan_agreed_at=CASE WHEN $2 THEN CASE WHEN $3 OR progress_plan_agreed_at IS NULL THEN now() ELSE progress_plan_agreed_at END END,version=version+1,updated_at=now() WHERE reference=$1',[reference,agreed,scopeChanged]);
      const summary=input.services.map(s=>`${s.title}: ${s.status.replaceAll('_',' ')}`).join('; ');
      await db.query(`INSERT INTO skts_request_events (id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`,[randomUUID(),reference,actor.id,'Services updated. '+(summary||'No services listed.')]);
      if(scopeChanged||agreed!==rows[0].progress_plan_agreed)await db.query(`INSERT INTO skts_request_events(id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`,[randomUUID(),reference,actor.id,agreed?'Milestone scope weights and progress plan recorded as agreed.':'Progress percentage paused until the milestone scope weights are agreed.']);
      return {saved:true};
    });
  }
  async acceptDelivery(actor,reference,id,version){
    if(actor.admin)throw new PortalError(403,'Delivery acceptance must come from the assigned client.');
    return this.transaction(async db=>{
      const project=(await db.query('SELECT version,status FROM skts_requests WHERE reference=$1 AND customer_email=$2 FOR UPDATE',[reference,actor.email])).rows[0];
      if(!project)throw new PortalError(404,'Project not found.');
      if(project.version!==version)throw new PortalError(409,'The project changed. Refresh before accepting this delivery.');
      if(project.status==='cancelled')throw new PortalError(400,'A cancelled project cannot accept deliveries.');
      const service=(await db.query('SELECT title,status FROM skts_project_services WHERE id=$1 AND request_reference=$2',[id,reference])).rows[0];
      if(!service)throw new PortalError(404,'Milestone not found.');
      if(!['delivered','awaiting_approval'].includes(service.status))throw new PortalError(409,'This milestone is not awaiting delivery acceptance.');
      await db.query("UPDATE skts_project_services SET status='completed',accepted_at=now(),accepted_by=$2,completed_at=now(),updated_at=now() WHERE id=$1",[id,actor.id]);
      await db.query('UPDATE skts_requests SET version=version+1,updated_at=now() WHERE reference=$1',[reference]);
      await db.query(`INSERT INTO skts_request_events(id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`,[randomUUID(),reference,actor.id,'Client accepted delivery: '+service.title+'.']);
      return {saved:true};
    });
  }
  async updateBilling(actor,reference,input){
    if(!actor.admin)throw new PortalError(403,'Administrator access required.');
    return this.transaction(async db=>{
      const {rows}=await db.query('SELECT * FROM skts_requests WHERE reference=$1 FOR UPDATE',[reference]);
      if(!rows.length)throw new PortalError(404,'Project not found.');
      const project=rows[0];if(project.version!==input.version)throw new PortalError(409,'The project changed. Discard your edit and refresh.');
      const paid=Number((await db.query(`SELECT COALESCE(sum(verified_amount_paise),0) AS paid FROM skts_payment_references WHERE project_reference=$1 AND customer_email=$2 AND verification_status='verified'`,[reference,project.customer_email])).rows[0].paid);
      if(input.agreed&&!project.quoted_amount_paise)throw new PortalError(400,'Record a project quote before confirming the budget.');
      if(input.dueAmount&&(!input.agreed||input.dueAmount>Math.max(0,Number(project.quoted_amount_paise)-paid)))throw new PortalError(400,'The next payment cannot exceed the agreed outstanding balance.');
      const optInAt=input.optedIn?(project.whatsapp_phone===input.phone&&project.whatsapp_opted_in_at?project.whatsapp_opted_in_at:new Date()):null;
      await db.query(`UPDATE skts_requests SET budget_agreed=$2,payment_due_date=$3,payment_target_paise=$4,reminder_enabled=$5,reminder_schedule=$6,whatsapp_phone=$7,whatsapp_opted_in_at=$8,whatsapp_consent_note=$9,version=version+1,updated_at=now() WHERE reference=$1`,[reference,input.agreed,input.dueDate,input.dueAmount?paid+input.dueAmount:null,input.reminders,input.schedule,input.phone,optInAt,input.optedIn?input.consentNote:'']);
      await db.query(`INSERT INTO skts_request_events (id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`,[randomUUID(),reference,actor.id,`Budget ${input.agreed?'confirmed as agreed':'awaiting agreement'}. ${input.dueAmount?`Next payment: INR ${(input.dueAmount/100).toFixed(2)} by ${input.dueDate}.`:'No payment due date scheduled.'} WhatsApp reminders ${input.reminders?'enabled with recorded opt-in':'paused'}.`]);
      return {saved:true};
    });
  }
  async stopReminders(actor,reference){
    return this.transaction(async db=>{
      const result=await db.query('UPDATE skts_requests SET reminder_enabled=false,whatsapp_opted_in_at=NULL,whatsapp_consent_note=$3,version=version+1 WHERE reference=$1 AND customer_email=$2 RETURNING reference',[reference,actor.email,'Withdrawn in client portal']);
      if(!result.rows.length)throw new PortalError(404,'Project not found.');
      await db.query(`INSERT INTO skts_request_events (id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`,[randomUUID(),reference,actor.id,'WhatsApp reminders stopped in the client portal.']);return {saved:true};
    });
  }
  async reminderCandidates(today){return (await this.pool.query(`SELECT q.* FROM (SELECT ${requestSelect} FROM skts_requests r WHERE reminder_enabled=true AND budget_agreed=true AND whatsapp_opted_in_at IS NOT NULL AND r.payment_due_date BETWEEN $1::date-3 AND $1::date+3) q WHERE q.status<>'cancelled' AND q.pending_payment_count=0 AND q.payment_target_paise>q.verified_paid_paise AND q.quoted_amount_paise>q.verified_paid_paise AND ((q.payment_due_date::date=$1::date AND q.reminder_schedule<>'overdue') OR (q.payment_due_date::date=$1::date+3 AND q.reminder_schedule='before_due_overdue') OR q.payment_due_date::date=$1::date-3) AND NOT EXISTS(SELECT 1 FROM skts_reminder_deliveries d WHERE d.request_reference=q.reference AND d.due_date=q.payment_due_date::date AND d.stage=CASE WHEN q.payment_due_date::date=$1::date THEN 'due' WHEN q.payment_due_date::date=$1::date+3 THEN 'before' ELSE 'overdue' END) ORDER BY q.payment_due_date,q.created_at LIMIT 100`,[today])).rows.map(financials);}
}
