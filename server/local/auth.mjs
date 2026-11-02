import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PortalError, textField } from '../portal/model.mjs';
const derive = promisify(scrypt);
const cost = { N:32768, r:8, p:3, maxmem:64*1024*1024 };
export const sessionCookie = 'skts_local_session';
export const csrfCookie = 'skts_local_csrf';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function cookie(request, name) {
  const part=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return part?.slice(name.length+1)??'';
}
export function localCookie(name,value,maxAge=28800) { return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`; }
export function mutationGuard(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new PortalError(403,'Request origin rejected. Reload the portal and try again.');
  const supplied=request.headers.get('x-skts-csrf')??'', expected=cookie(request,csrfCookie);
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) throw new PortalError(403,'Session check failed. Reload the portal and try again.');
}
function passwordValue(value) {
  if (typeof value!=='string'||value.length<12||value.length>128) throw new PortalError(400,'Use a password between 12 and 128 characters.');
  return value;
}
export async function hashPassword(password) {
  const salt=randomBytes(16).toString('hex');
  const key=await derive(passwordValue(password),salt,64,cost);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password,encoded) {
  if(typeof password!=='string'||password.length>128) return false;
  const [kind,salt,hash]=String(encoded).split(':');
  if(kind!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hash)) return false;
  const key=await derive(password,salt,64,cost);
  return timingSafeEqual(key,Buffer.from(hash,'hex'));
}
export class LocalOwnerAuth {
  constructor(pool,ownerEmail) { this.pool=pool; this.ownerEmail=ownerEmail.toLowerCase(); this.attempts=new Map(); this.dummyHash=hashPassword(randomBytes(24).toString('hex')); }
  async configured() { return (await this.pool.query('SELECT 1 FROM skts_local_owner WHERE singleton=1')).rows.length>0; }
  async setup({email,password,name=''}) {
    if(typeof email!=='string'||email.trim().toLowerCase()!==this.ownerEmail) throw new PortalError(400,'Use the configured business owner email.');
    const passwordHash=await hashPassword(password);
    try {
      const result=await this.pool.query('INSERT INTO skts_local_owner (singleton,id,email,name,password_hash) VALUES (1,$1,$2,$3,$4) ON CONFLICT (singleton) DO NOTHING RETURNING id',[randomUUID(),this.ownerEmail,textField(name,120)||'SKTS owner',passwordHash]);
      if(!result.rows.length) throw new PortalError(409,'The local owner account already exists. Sign in instead.');
      return this.session(result.rows[0].id);
    } catch(error) { throw error; }
  }
  async login({email,password}) {
    const key=digest(String(email).trim().toLowerCase());
    const now=Date.now();
    for(const [id,entry] of this.attempts) if(entry.until<=now) this.attempts.delete(id);
    const entry=this.attempts.get(key)??{count:0,until:now+15*60000};
    if(entry.count>=10||this.attempts.size>200) throw new PortalError(429,'Too many attempts. Try again in 15 minutes.');
    entry.count++;this.attempts.set(key,entry);
    const {rows}=await this.pool.query('SELECT id,email,password_hash FROM skts_local_owner WHERE singleton=1');
    const owner=rows[0],normalized=String(email).trim().toLowerCase();
    const account=owner?.email===normalized?owner:(await this.pool.query('SELECT id,email,password_hash FROM skts_local_clients WHERE email=$1 AND disabled=false',[normalized])).rows[0];
    const valid=await passwordMatches(password,account?.password_hash??await this.dummyHash);
    if(!account||!valid) throw new PortalError(401,'Email or password is incorrect.');
    this.attempts.delete(key); return this.session(account.id,account===owner?'owner':'client');
  }
  async session(accountId,kind='owner') {
    const token=randomBytes(32).toString('hex');
    await this.pool.query('DELETE FROM skts_local_sessions WHERE expires_at <= now() OR last_seen_at < now() - interval \'30 minutes\'');
    await this.pool.query("INSERT INTO skts_local_sessions (token_hash,owner_id,client_id,expires_at) VALUES ($1,$2,$3,now()+interval '8 hours')",[digest(token),kind==='owner'?accountId:null,kind==='client'?accountId:null]);
    return token;
  }
  async actor(request) {
    const token=cookie(request,sessionCookie);
    if(!/^[a-f0-9]{64}$/.test(token)) throw new PortalError(401,'Sign in to your local account.');
    const {rows}=await this.pool.query("SELECT s.owner_id,s.client_id,COALESCE(o.id,c.id) AS id,COALESCE(o.email,c.email) AS email FROM skts_local_sessions s LEFT JOIN skts_local_owner o ON o.id=s.owner_id LEFT JOIN skts_local_clients c ON c.id=s.client_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes' AND (s.owner_id IS NOT NULL OR c.disabled=false)",[digest(token)]);
    if(!rows.length) throw new PortalError(401,'Your local session expired. Sign in again.');
    await this.pool.query('UPDATE skts_local_sessions SET last_seen_at=now() WHERE token_hash=$1',[digest(token)]);
    return {id:rows[0].id,email:rows[0].email,admin:rows[0].owner_id!=null};
  }
  async logout(request) { await this.pool.query('DELETE FROM skts_local_sessions WHERE token_hash=$1',[digest(cookie(request,sessionCookie))]); }
  async invite(actor,{email,name=''}){
    if(!actor.admin)throw new PortalError(403,'Administrator access required.');
    const normalized=textField(email,254,true).toLowerCase();
    if(normalized===this.ownerEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw new PortalError(400,'Enter a client email, not the owner email.');
    if(!(await this.pool.query('SELECT 1 FROM skts_requests WHERE customer_email=$1 LIMIT 1',[normalized])).rows.length)throw new PortalError(400,'Create a project for this client email first.');
    const token=randomBytes(32).toString('hex');
    const id=(await this.pool.query('INSERT INTO skts_local_clients (id,email,name) VALUES ($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=$3 RETURNING id',[randomUUID(),normalized,textField(name,120)||normalized])).rows[0].id;
    await this.pool.query("INSERT INTO skts_local_invites (token_hash,client_id,expires_at) VALUES ($1,$2,now()+interval '48 hours')",[digest(token),id]);
    return {token,email:normalized,expiresInHours:48};
  }
  async invitation(token,db=this.pool){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new PortalError(400,'Invalid invitation.');
    const {rows}=await db.query('SELECT c.id,c.email,c.name FROM skts_local_invites i JOIN skts_local_clients c ON c.id=i.client_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>now() AND c.disabled=false',[digest(token)]);
    if(!rows.length)throw new PortalError(400,'This invitation expired or has already been used.');return rows[0];
  }
  async acceptInvite({token,password}){
    const passwordHash=await hashPassword(password),db=await this.pool.connect();let id;
    try{
      await db.query('BEGIN');
      // Lock the client to make invitation acceptance and password replacement atomic.
      const account=await this.invitation(token,db);id=account.id;
      await db.query('SELECT id FROM skts_local_clients WHERE id=$1 FOR UPDATE',[id]);
      await this.invitation(token,db);
      await db.query('UPDATE skts_local_clients SET password_hash=$2 WHERE id=$1',[id,passwordHash]);
      await db.query('UPDATE skts_local_invites SET used_at=now() WHERE client_id=$1 AND used_at IS NULL',[id]);
      await db.query('DELETE FROM skts_local_sessions WHERE client_id=$1',[id]);
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
    return this.session(id,'client');
  }
}
