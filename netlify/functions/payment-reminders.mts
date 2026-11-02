import {getDatabase} from '@netlify/database';
import {metaConfig} from '../../server/reminders/meta.mjs';
import {runReminders} from '../../server/reminders/delivery.mjs';
export default async () => {
  const config=metaConfig(name=>Netlify.env.get(name));
  if(!config.enabled||!config.configured)return;
  const result=await runReminders({pool:getDatabase().pool,config});
  console.log('WhatsApp reminder batch completed.',result);
};
export const config={schedule:'*/15 * * * *'};
