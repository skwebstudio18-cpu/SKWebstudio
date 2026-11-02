import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHandler } from '../portal/api.mjs';
import { PortalRepository } from '../portal/repository.mjs';
import { PortalError, ingestRecord } from '../portal/model.mjs';
import { LocalOwnerAuth, mutationGuard, localCookie, cookie, csrfCookie, sessionCookie } from './auth.mjs';
import { projectRoot } from './database.mjs';
import business from '../../config/public-business.mjs';
import {metaConfig,providerStatus} from '../reminders/meta.mjs';
import {DocumentRepository} from '../documents/repository.mjs';
import {localDocumentStore} from '../documents/local-store.mjs';
import {MAX_UPLOAD_BYTES} from '../documents/files.mjs';
const baseHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...headers}});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
export function localApplication({pool,publish=resolve(projectRoot,'SKTS-netlify'),documentsDirectory=resolve(projectRoot,'.data/project-documents')}) {
  const auth=new LocalOwnerAuth(pool,business.email), repository=new PortalRepository(pool);
  const portal=createHandler({authenticate:req=>auth.actor(req),verifyRequestOrigin:mutationGuard,repository:()=>repository,documents:()=>new DocumentRepository(pool,localDocumentStore(documentsDirectory)),reminderStatus:()=>({...providerStatus(metaConfig()),schedule:'Checks every five minutes while this local server runs; sends between 9 AM and 6 PM IST.'})});
  return async request=>{
    try {
      const url=new URL(request.url), path=url.pathname;
      if(!['localhost','127.0.0.1'].includes(url.hostname)) return json({error:'Local server only.'},403);
      if(!['GET','HEAD','POST','PATCH'].includes(request.method)) return json({error:'Method not allowed.'},405);
      if(['POST','PATCH'].includes(request.method)) mutationGuard(request);
      if(path==='/api/local/config'&&request.method==='GET') {
        const csrf=randomBytes(32).toString('hex');let signedIn=false;
        try{await auth.actor(request);signedIn=true;}catch(error){if(error.status!==401)throw error;}
        // Keep an existing token to avoid invalidating another open tab's form.
        const existing=cookie(request,csrfCookie), token=/^[a-f0-9]{64}$/.test(existing)?existing:csrf;
        return json({local:true,ready:true,setupNeeded:!await auth.configured(),ownerEmail:business.email,signedIn,csrf:token},200,{'Set-Cookie':localCookie(csrfCookie,token)});
      }
      if(path.startsWith('/api/portal/')) return portal(request);
      if(path.startsWith('/api/local/')) {
        if(path==='/api/local/backup'&&request.method==='GET') {
          if(!(await auth.actor(request)).admin)throw new PortalError(403,'Administrator access required.');
          const result={format:'skts-local-records-v1',exportedAt:new Date().toISOString()};
          // Only fixed table names; accounts, hashes and sessions are excluded.
          for(const table of ['skts_requests','skts_request_events','skts_payment_references','skts_payment_audit','skts_project_services','skts_reminder_deliveries','skts_project_documents','skts_document_versions','skts_document_reviews']) result[table]=(await pool.query(`SELECT * FROM ${table}`)).rows;
          result.documentFiles='File bytes are stored separately in .data/project-documents; copy that directory together with the database backup.';
          return json(result,200,{'Content-Disposition':'attachment; filename="skts-local-records.json"'});
        }
        if(request.method!=='POST') return json({error:'Page not found.'},404);
        const raw=await request.text();if(raw.length>20000)throw new PortalError(413,'Request is too large.');
        if(path==='/api/local/intake') {
          if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new PortalError(415,'Send form data.');
          const fields=Object.fromEntries(new URLSearchParams(raw));
          if(!fields.consent)throw new PortalError(400,'Consent is required.');
          const record=ingestRecord(fields);if(!record)throw new PortalError(400,'Invalid form submission.');
          await repository.ingest(record);return json({saved:true,reference:record.reference,storage:'local'},201);
        }
        if(!request.headers.get('content-type')?.startsWith('application/json'))throw new PortalError(415,'Send JSON data.');
        let body;try{body=JSON.parse(raw);}catch{throw new PortalError(400,'Invalid JSON.');}
        if(!body||typeof body!=='object'||Array.isArray(body))throw new PortalError(400,'Invalid request.');
        if(path==='/api/local/setup'||path==='/api/local/login') {
          const token=path.endsWith('/setup')?await auth.setup(body):await auth.login(body);
          return json({signedIn:true},200,{'Set-Cookie':localCookie(sessionCookie,token)});
        }
        if(path==='/api/local/invite')return json(await auth.invite(await auth.actor(request),body),201);
        if(path==='/api/local/invitation-info'){const info=await auth.invitation(body.token);return json({email:info.email,name:info.name});}
        if(path==='/api/local/accept-invite'){const token=await auth.acceptInvite(body);return json({signedIn:true},200,{'Set-Cookie':localCookie(sessionCookie,token)});}
        if(path==='/api/local/logout'){await auth.logout(request);return json({signedOut:true},200,{'Set-Cookie':localCookie(sessionCookie,'',0)});}
        return json({error:'Page not found.'},404);
      }
      if(path.startsWith('/api/')) return json({error:'Page not found.'},404);
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed.'},405);
      let decoded;try{decoded=decodeURIComponent(path);}catch{return json({error:'Invalid path.'},400);}
      if(decoded.split(/[\\/]/).some(part=>part.startsWith('.'))||decoded.includes('\0'))return json({error:'Page not found.'},404);
      let file=resolve(publish,'.'+decoded);
      if(!file.startsWith(publish+sep)&&file!==publish)return json({error:'Page not found.'},404);
      try{if((await stat(file)).isDirectory())file=resolve(file,'index.html');const content=await readFile(file);return new Response(request.method==='HEAD'?null:content,{headers:{...baseHeaders,'Content-Type':mime[extname(file)]??'application/octet-stream'}});}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return json({error:'Page not found.'},404);throw error;}
    } catch(error) {
      if(error instanceof PortalError)return json({error:error.message},error.status);
      console.error('Local request failed.',{code:/^[A-Z0-9_]{1,40}$/.test(String(error.code))?error.code:'UNEXPECTED'});
      return json({error:'Unable to complete this local request.'},500);
    }
  };
}
export function createLocalServer(options) {
  const app=localApplication(options);
  return createServer(async(req,res)=>{
    try {
      const chunks=[];let length=0;
      const upload=req.method==='POST'&&/^\/api\/portal\/requests\/SKTS-\d{8}-[A-F0-9]{16}\/documents\/?$/.test(req.url??'');
      for await(const chunk of req){length+=chunk.length;if(length>(upload?MAX_UPLOAD_BYTES:20000)){res.writeHead(413,baseHeaders);res.end('Request too large');return;}chunks.push(chunk);}
      const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await app(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch {if(!res.headersSent)res.writeHead(500,baseHeaders);res.end('Local server error');}
  });
}
