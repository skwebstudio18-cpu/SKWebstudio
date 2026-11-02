export function metaConfig(get=name=>process.env[name]){
  const config={enabled:get('WHATSAPP_SEND_ENABLED')==='true',accessToken:get('WHATSAPP_ACCESS_TOKEN')??'',phoneId:get('WHATSAPP_PHONE_NUMBER_ID')??'',version:get('WHATSAPP_GRAPH_VERSION')??'',template:get('WHATSAPP_TEMPLATE_NAME')??'',language:get('WHATSAPP_TEMPLATE_LANGUAGE')??'en_US',appSecret:get('WHATSAPP_APP_SECRET')??'',verifyToken:get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')??''};
  config.configured=Boolean(config.accessToken&&/^\d{5,30}$/.test(config.phoneId)&&/^v\d{1,3}\.\d{1,2}$/.test(config.version)&&/^[a-z0-9_]{1,512}$/.test(config.template)&&/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.language)&&config.appSecret&&config.verifyToken);
  return config;
}
export function providerStatus(config){return {provider:'Meta WhatsApp Cloud API',configured:config.configured,enabled:config.enabled,ready:config.configured&&config.enabled,schedule:'Checks every 15 minutes, sends between 9 AM and 6 PM IST',note:config.configured?(config.enabled?'Automatic delivery is enabled. Usage charges may apply.':'Provider configured; automatic delivery is switched off.'):'Automatic delivery is not configured. Manual WhatsApp drafts are available after the client opts in.'};}
export const moneyText=value=>(Number(value)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function templateParameters(project){return [project.customer_name,project.reference,moneyText(project.quoted_amount_paise),moneyText(project.verified_paid_paise),moneyText(project.due_paise),moneyText(project.outstanding_paise),String(project.payment_due_date).slice(0,10)];}
export function reminderText(project){const [name,reference,budget,paid,due,balance,date]=templateParameters(project);return `Hello ${name}, payment update for ${reference} from SKTS.\nAgreed budget: INR ${budget}\nPayments received: INR ${paid}\nPayment due: INR ${due} by ${date}\nRemaining project balance: INR ${balance}\nIf you have already paid, please submit your transaction reference in the client portal. Reply STOP to stop WhatsApp reminders.`;}
export async function sendMetaTemplate(config,project,fetcher=fetch){
  if(!config.enabled||!config.configured)return {status:'suppressed',errorCode:'PROVIDER_DISABLED'};
  try{
    const response=await fetcher(`https://graph.facebook.com/${config.version}/${config.phoneId}/messages`,{method:'POST',headers:{Authorization:'Bearer '+config.accessToken,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:project.whatsapp_phone.slice(1),type:'template',template:{name:config.template,language:{code:config.language},components:[{type:'body',parameters:templateParameters(project).map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(5000)});
    let data;try{data=await response.json();}catch{return {status:'unknown',errorCode:'UNREADABLE_RESPONSE'};}
    if(!response.ok)return {status:response.status>=500?'unknown':'failed',errorCode:String(data.error?.code??'HTTP_'+response.status).replace(/[^A-Z0-9_]/gi,'').slice(0,40)};
    const id=data.messages?.[0]?.id;
    return typeof id==='string'&&id.length<=512?{status:'accepted',messageId:id}:{status:'unknown',errorCode:'MISSING_MESSAGE_ID'};
  }catch{return {status:'unknown',errorCode:'NETWORK_OUTCOME_UNKNOWN'};}
}
