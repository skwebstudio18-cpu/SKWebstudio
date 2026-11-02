import {PortalError,textField,money} from './model.mjs';
export const serviceStatuses=['pending','in_progress','delivered','awaiting_approval','completed','on_hold','cancelled'];
export function expectedVersion(value){if(!Number.isSafeInteger(value)||value<1)throw new PortalError(400,'Refresh the project before saving.');return value;}
export function serviceUpdate(body){
  if(!Array.isArray(body.services)||body.services.length>30)throw new PortalError(400,'Add up to 30 services.');
  const seen=new Set();
  return {version:expectedVersion(body.version),planAgreed:typeof body.planAgreed==='boolean'?body.planAgreed:undefined,services:body.services.map(service=>{
    if(!service||!serviceStatuses.includes(service.status))throw new PortalError(400,'Choose a valid service status.');
    const id=service.id||null;
    if(id&&(!/^[a-f0-9-]{36}$/i.test(id)||seen.has(id)))throw new PortalError(400,'Invalid or duplicate service.');
    if(id)seen.add(id);
    if(service.weight!==undefined&&service.weight!==null&&!['string','number'].includes(typeof service.weight))throw new PortalError(400,'Milestone weights must be whole numbers from 1 to 100.');
    const weight=service.weight===undefined?undefined:service.weight===''||service.weight===null?null:Number(service.weight);
    if(weight!==undefined&&weight!==null&&(!Number.isInteger(weight)||weight<1||weight>100))throw new PortalError(400,'Milestone weights must be whole numbers from 1 to 100.');
    const targetDate=service.targetDate===undefined?undefined:service.targetDate?textField(service.targetDate,10,true):null;
    if(targetDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)||Number.isNaN(Date.parse(targetDate))||new Date(targetDate).toISOString().slice(0,10)!==targetDate))throw new PortalError(400,'Choose a valid milestone target date.');
    return {id,title:textField(service.title,160,true),status:service.status,notes:textField(service.notes??'',2000),weight,targetDate};
  })};
}
export function billingUpdate(body){
  const dueDate=body.dueDate?textField(body.dueDate,10,true):null;
  if(dueDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||Number.isNaN(Date.parse(dueDate))||new Date(dueDate).toISOString().slice(0,10)!==dueDate))throw new PortalError(400,'Choose a valid due date.');
  const schedule=body.schedule??'due_and_overdue';
  if(!['before_due_overdue','due_and_overdue','overdue'].includes(schedule))throw new PortalError(400,'Invalid reminder schedule.');
  const phone=textField(body.phone??'',20);
  if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone))throw new PortalError(400,'Enter the WhatsApp number with country code, for example +919840407296.');
  const consentNote=textField(body.consentNote??'',1000);
  if(body.optedIn===true&&(!phone||!consentNote))throw new PortalError(400,'Record the client’s WhatsApp opt-in source and number.');
  if(body.reminders===true&&(!dueDate||body.agreed!==true||body.optedIn!==true))throw new PortalError(400,'Reminders require an agreed budget, a due date and recorded WhatsApp consent.');
  if(Boolean(dueDate)!==Boolean(body.dueAmount))throw new PortalError(400,'Enter both a due date and the next payment amount, or leave both empty.');
  return {version:expectedVersion(body.version),agreed:body.agreed===true,dueDate,dueAmount:body.dueAmount?money(body.dueAmount):null,reminders:body.reminders===true,schedule,phone,optedIn:body.optedIn===true,consentNote};
}
export function financials(project){
  const paid=Number(project.verified_paid_paise??0),budget=project.budget_agreed&&project.quoted_amount_paise!=null?Number(project.quoted_amount_paise):null;
  return {...project,verified_paid_paise:paid,outstanding_paise:budget===null?null:Math.max(0,budget-paid),credit_paise:budget===null?0:Math.max(0,paid-budget),due_paise:budget===null||!project.payment_target_paise?0:Math.max(0,Math.min(budget,Number(project.payment_target_paise))-paid)};
}
export function indiaDay(now=new Date()){return new Date(now.getTime()+330*60000).toISOString().slice(0,10);}
export function reminderStage(project,now=new Date()){
  if(!project.reminder_enabled||!project.whatsapp_opted_in_at||!/^\+[1-9]\d{7,14}$/.test(project.whatsapp_phone)||!project.budget_agreed||!project.payment_due_date||project.due_paise<=0||Number(project.pending_payment_count)>0||project.status==='cancelled')return null;
  const due=String(project.payment_due_date).slice(0,10),delta=Math.round((Date.parse(indiaDay(now))-Date.parse(due))/86400000);
  if(delta===-3&&project.reminder_schedule==='before_due_overdue')return 'before';
  if(delta===0&&project.reminder_schedule!=='overdue')return 'due';
  if(delta===3)return 'overdue';
  return null;
}
