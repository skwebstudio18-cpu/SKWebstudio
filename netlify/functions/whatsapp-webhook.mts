import {getDatabase} from '@netlify/database';
import {metaConfig} from '../../server/reminders/meta.mjs';
import {createWhatsAppWebhook} from '../../server/reminders/webhook.mjs';
export default async(request:Request)=>{
  const config=metaConfig(name=>Netlify.env.get(name));
  if(!config.appSecret||!config.verifyToken)return new Response('Webhook not configured.',{status:503});
  return createWhatsAppWebhook({pool:getDatabase().pool,config})(request);
};
export const config={path:'/api/whatsapp/webhook'};
