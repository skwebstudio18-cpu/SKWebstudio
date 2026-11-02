import OpenAI from 'openai';
import {getDatabase} from '@netlify/database';
import {createAssistant} from '../../server/assistant/handler.mjs';
import {claimAnswer} from '../../server/assistant/quota.mjs';

export default createAssistant({
  available:()=>Netlify.env.get('SKTS_AI_ENABLED')!=='false'&&!!process.env.OPENAI_API_KEY&&!!process.env.OPENAI_BASE_URL,
  claim:ip=>claimAnswer(getDatabase().pool,ip),
  complete:(body,options)=>new OpenAI().chat.completions.create(body,options)
});
export const config={path:'/api/assistant',rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:8}};
