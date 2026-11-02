const statuses=['pending','in_progress','delivered','awaiting_approval','completed','on_hold','cancelled'];
const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
export function projectReport(project,services,now=new Date()){
  const counts=Object.fromEntries(statuses.map(s=>[s,services.filter(x=>x.status===s).length]));
  const active=services.filter(s=>s.status!=='cancelled');
  const hasWeights=active.length>0&&active.every(s=>Number.isInteger(s.weight_points)&&s.weight_points>0&&s.weight_points<=100);
  const weighted=project.progress_plan_agreed===true&&hasWeights&&project.status!=='cancelled';
  const totalWeight=weighted?active.reduce((n,s)=>n+s.weight_points,0):0;
  const completedWeight=weighted?active.filter(s=>s.status==='completed').reduce((n,s)=>n+s.weight_points,0):0;
  const completion=weighted?(completedWeight===totalWeight?100:Math.min(99.9,Math.round(completedWeight/totalWeight*1000)/10)):null;
  const budget=project.budget_agreed&&number(project.quoted_amount_paise)>0?number(project.quoted_amount_paise):null;
  const paid=number(project.verified_paid_paise),balance=budget===null?null:Math.max(0,budget-paid);
  const paidPercent=budget===null?null:paid>=budget?100:Math.min(99.9,Math.round(paid/budget*1000)/10);
  const reviewServices=active.filter(s=>['delivered','awaiting_approval'].includes(s.status));
  const today=new Date(now.getTime()+330*60000).toISOString().slice(0,10);
  const pendingReview=number(project.pending_payment_count);
  const nextMilestone=active.filter(s=>s.status!=='completed').sort((a,b)=>(a.target_date??'9999').localeCompare(b.target_date??'9999'))[0]??null;
  let next;
  if(project.status==='cancelled')next={kind:'cancelled',title:'Project cancelled',detail:'Contact SKTS to discuss any remaining handover or account balance.'};
  else if(reviewServices.length)next={kind:'review',title:`${reviewServices.length} deliver${reviewServices.length===1?'y':'ies'} ready for your review`,detail:'Review the delivered work, then accept it in the milestone list.'};
  else if(pendingReview)next={kind:'payment_review',title:'Payment verification in progress',detail:'SKTS is checking your submitted payment reference. Your verified balance updates after the bank review.'};
  else if(budget!==null&&number(project.due_paise)>0&&project.payment_due_date)next={kind:'payment',title:project.payment_due_date<today?'Payment instalment overdue':'Next payment instalment',detail:'Use your agreed payment details and submit the transaction reference after payment.',amount:number(project.due_paise),date:project.payment_due_date};
  else if(nextMilestone)next={kind:'milestone',title:'Next milestone',detail:nextMilestone.title,date:nextMilestone.target_date??null};
  else if(active.length&&counts.completed===active.length)next={kind:'complete',title:'All milestones completed',detail:balance>0?'Review the remaining project balance with SKTS.':'Your recorded project milestones are complete.'};
  else next={kind:'planning',title:'Project planning',detail:'SKTS will confirm your milestones, scope weights and target dates.'};
  return {counts,activeCount:active.length,completionPercent:completion,totalWeight,completedWeight,progressReady:weighted,budgetPaise:budget,paidPaise:paid,balancePaise:balance,creditPaise:budget===null?0:Math.max(0,paid-budget),paidPercent,pendingPaymentCount:pendingReview,reviewCount:reviewServices.length,next,today};
}
