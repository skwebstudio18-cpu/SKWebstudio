import { PortalError, identity, projectUpdate, paymentUpdate, referencePattern } from './model.mjs';
import {serviceUpdate,billingUpdate,expectedVersion} from './tracking.mjs';
import {reminderText} from '../reminders/meta.mjs';
import {readUpload,reviewInput,uuidPattern,downloadHeaders} from '../documents/files.mjs';
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'private, no-store', 'Vary':'Cookie, Authorization', 'X-Content-Type-Options':'nosniff' };
const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
export function createHandler({ getUser, getSettings, verifyRequestOrigin, repository, authenticate,inviteClient,documents,reminderStatus=()=>({ready:false,note:'Automatic delivery is not configured.'}) }) {
  return async request => {
    try {
      const url = new URL(request.url);
      // Production uses confirmed Netlify Identity. The loopback-only local
      // server supplies a separate database-backed owner session adapter.
      const actor = authenticate ? await authenticate(request) : identity(await getUser());
      if (!authenticate && (await getSettings()).autoconfirm) throw new PortalError(503,'Email confirmation must be enabled before using the project portal.');
      const path = url.pathname.replace(/\/$/,'');
      if (path === '/api/portal/me' && request.method === 'GET') return reply({ email:actor.email, admin:actor.admin });
      if (!['GET','PATCH','POST'].includes(request.method)) return reply({error:'Method not allowed.'},405);
      if (path.startsWith('/api/portal/admin/') && !actor.admin) throw new PortalError(403,'Administrator access required.');
      if(path==='/api/portal/admin/reminders/status'&&request.method==='GET')return reply(await reminderStatus());
      const documentRoute=path.match(/^\/api\/portal\/(admin\/)?requests\/([^/]+)\/documents(?:\/([^/]+)\/(download|review))?$/);
      if(documentRoute&&(!referencePattern.test(documentRoute[2])||documentRoute[2].includes('-PAY-')))throw new PortalError(404,'Project not found.');
      if(documentRoute&&referencePattern.test(documentRoute[2])&&!documentRoute[2].includes('-PAY-')){
        const [,adminPrefix,reference,id,action]=documentRoute;
        if(id&&!uuidPattern.test(id))throw new PortalError(404,'Document not found.');
        if(!documents)throw new PortalError(503,'Document storage is not configured.');
        if(request.method==='GET'&&!id)return reply(await documents().list(actor,reference));
        if(request.method==='GET'&&action==='download'){
          const file=await documents().download(actor,reference,id);
          return new Response(file.bytes,{headers:{...headers,...downloadHeaders(file.filename,file.media_type)}});
        }
        if(request.method==='POST'&&!id&&!adminPrefix){
          try{verifyRequestOrigin(request);}catch{return reply({error:'The request origin could not be verified.'},403);}
          // Authorize before reading or buffering the multipart body.
          const service=documents();await service.project(service.pool,actor,reference);
          return reply(await service.upload(actor,reference,await readUpload(request)),201);
        }
      }
      let input;
      if (['PATCH','POST'].includes(request.method)) {
        try { verifyRequestOrigin(request); }
        catch { return reply({error:'The request origin could not be verified.'},403); }
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PortalError(415,'Send JSON data.');
        const raw = await request.text();
        if (raw.length > 20000) throw new PortalError(413,'Update is too large.');
        try { input = JSON.parse(raw); } catch { throw new PortalError(400,'Invalid JSON data.'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PortalError(400,'Invalid update.');
      }
      if(documentRoute&&documentRoute[1]&&documentRoute[4]==='review'&&request.method==='PATCH')return reply(await documents().review(actor,documentRoute[2],documentRoute[3],reviewInput(input)));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const acceptance=path.match(/^\/api\/portal\/requests\/([^/]+)\/services\/([^/]+)\/accept$/);
      if(acceptance&&request.method==='POST'&&referencePattern.test(acceptance[1])&&uuidPattern.test(acceptance[2])){
        if(input.confirmed!==true)throw new PortalError(400,'Confirm that you reviewed and accept this delivery.');
        return reply(await repository().acceptDelivery(actor,acceptance[1],acceptance[2],expectedVersion(input.version)));
      }
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new PortalError(400,'Invalid page.');
      const projectPath = path.match(/^\/api\/portal\/(admin\/)?requests\/([^/]+)$/);
      const paymentPath = path.match(/^\/api\/portal\/admin\/payments\/([^/]+)$/);
      const recognizedList = ['/api/portal/requests','/api/portal/admin/requests','/api/portal/payments','/api/portal/admin/payments'].includes(path);
      if(path==='/api/portal/admin/requests'&&request.method==='POST')return reply(await repository().createProject(actor,input),201);
      const invitation=path.match(/^\/api\/portal\/admin\/requests\/([^/]+)\/invite$/);
      if(invitation&&request.method==='POST'&&referencePattern.test(invitation[1])){
        const project=(await repository().request(actor,invitation[1])).project;
        if(!inviteClient)throw new PortalError(503,'Use the local client invitation option for this environment.');
        return reply(await inviteClient(actor,project));
      }
      const preview=path.match(/^\/api\/portal\/admin\/requests\/([^/]+)\/reminder-preview$/);
      if(preview&&request.method==='GET'&&referencePattern.test(preview[1])){
        const project=(await repository().request(actor,preview[1])).project;
        if(!project.budget_agreed||project.due_paise<=0||!project.whatsapp_opted_in_at||!/^\+[1-9]\d{7,14}$/.test(project.whatsapp_phone)||Number(project.pending_payment_count)>0||project.status==='cancelled')throw new PortalError(400,'A reminder needs an agreed payment plan, WhatsApp opt-in and a positive due amount. Review pending payments first.');
        const text=reminderText(project);return reply({text,url:'https://wa.me/'+project.whatsapp_phone.slice(1)+'?text='+encodeURIComponent(text)});
      }
      const trackingPath=path.match(/^\/api\/portal\/admin\/requests\/([^/]+)\/(services|billing)$/);
      if(trackingPath&&referencePattern.test(trackingPath[1])&&request.method==='PATCH')return reply(trackingPath[2]==='services'?await repository().updateServices(actor,trackingPath[1],serviceUpdate(input)):await repository().updateBilling(actor,trackingPath[1],billingUpdate(input)));
      const optOut=path.match(/^\/api\/portal\/requests\/([^/]+)\/stop-reminders$/);
      if(optOut&&request.method==='POST'&&referencePattern.test(optOut[1]))return reply(await repository().stopReminders(actor,optOut[1]));
      if (request.method === 'GET' && recognizedList) {
        const db = repository();
        return reply(path.endsWith('/payments') ? await db.listPayments(actor,offset) : await db.listRequests(actor,offset));
      }
      if (projectPath && referencePattern.test(projectPath[2]) && !projectPath[2].includes('-PAY-')) {
        if (request.method === 'GET') return reply(await repository().request(actor,projectPath[2]));
        if (request.method === 'PATCH' && projectPath[1]) return reply(await repository().updateRequest(actor,projectPath[2],projectUpdate(input)));
      }
      if (paymentPath && referencePattern.test(paymentPath[1]) && request.method === 'PATCH') return reply(await repository().reviewPayment(actor,paymentPath[1],paymentUpdate(input)));
      return reply({error:'Page not found.'},404);
    } catch (error) {
      if (error instanceof PortalError) return reply({error:error.message},error.status);
      // Do not log submission fields, session tokens or database connection strings.
      console.error('Portal request failed.', { code: /^[A-Z0-9_]{1,40}$/.test(String(error.code)) ? error.code : 'UNEXPECTED' });
      return reply({error:'The portal is temporarily unavailable. Please try again.'},503);
    }
  };
}
