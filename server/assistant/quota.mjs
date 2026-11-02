import {createHash} from 'node:crypto';
export const SITE_DAILY_LIMIT=20, NETWORK_DAILY_LIMIT=5;
export class AssistantLimit extends Error {}
export async function claimAnswer(pool,ip,now=new Date()){
  if(typeof ip!=='string'||!ip||ip.length>80)throw new AssistantLimit('AI is unavailable. Please contact SKTS.');
  const day=new Date(now.getTime()+19800000).toISOString().slice(0,10),bucket='ip:'+createHash('sha256').update(day+'|'+ip).digest('hex');
  // One atomic statement, not a read/then-write counter. A network-denied
  // request cannot use site allowance. A site-denied request conservatively
  // keeps its network reservation; allowances are never refunded or retried.
  const {rows}=await pool.query(`WITH network AS (
    INSERT INTO skts_visitor_ai_quota(day,bucket,used) VALUES ($1,$2,1)
    ON CONFLICT(day,bucket) DO UPDATE SET used=skts_visitor_ai_quota.used+1
    WHERE skts_visitor_ai_quota.used<$3 RETURNING used
  ), site AS (
    INSERT INTO skts_visitor_ai_quota(day,bucket,used) SELECT $1,'site',1 FROM network
    ON CONFLICT(day,bucket) DO UPDATE SET used=skts_visitor_ai_quota.used+1
    WHERE skts_visitor_ai_quota.used<$4 RETURNING used
  ) SELECT (SELECT used FROM network) AS network,(SELECT used FROM site) AS site`,[day,bucket,NETWORK_DAILY_LIMIT,SITE_DAILY_LIMIT]);
  if(rows[0].network==null)throw new AssistantLimit('Your network’s AI answer limit has been reached for today. Please contact SKTS for more help.');
  if(rows[0].site==null)throw new AssistantLimit('Today’s AI answer limit has been reached. Browse services or contact SKTS for help.');
  await pool.query("DELETE FROM skts_visitor_ai_quota WHERE day < $1::date-interval '2 days'",[day]);
}
