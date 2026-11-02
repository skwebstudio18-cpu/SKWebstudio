import {PortalError} from '../portal/model.mjs';
export class CloudInvitations {
  constructor({pool,getIdentityConfig,fetcher=fetch}){this.pool=pool;this.getIdentityConfig=getIdentityConfig;this.fetcher=fetcher;}
  async send(actor,project){
    if(!actor.admin)throw new PortalError(403,'Administrator access required.');
    const config=this.getIdentityConfig();
    if(!config?.url||!config.token)throw new PortalError(503,'Identity invitation service is unavailable.');
    const url=new URL(config.url);
    if(url.protocol!=='https:'||url.pathname.replace(/\/$/,'')!=='/.netlify/identity')throw new PortalError(503,'Identity invitation endpoint is not configured.');
    const email=project.customer_email;
    const claimed=await this.pool.query(`INSERT INTO skts_identity_invitations (email,requested_by,status) VALUES ($1,$2,'sending') ON CONFLICT(email) DO UPDATE SET requested_by=$2,attempted_at=now(),status='sending' WHERE skts_identity_invitations.attempted_at<now()-interval '10 minutes' RETURNING email`,[email,actor.id]);
    if(!claimed.rows.length)throw new PortalError(429,'An invitation was recently requested. Check the client’s inbox before trying again.');
    let response;
    try{
      // Documented GoTrue POST /invite. The official SDK supplies the server
      // operator context; it never reaches the browser, logs or source config.
      response=await this.fetcher(config.url.replace(/\/$/,'')+'/invite',{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({email}),signal:AbortSignal.timeout(10000)});
    }catch{
      await this.pool.query("UPDATE skts_identity_invitations SET status='unknown' WHERE email=$1",[email]);
      throw new PortalError(502,'The invitation outcome is unknown. Check the client’s inbox before requesting another.');
    }
    if(!response.ok){
      await this.pool.query("UPDATE skts_identity_invitations SET status='failed' WHERE email=$1",[email]);
      if([409,422].includes(response.status))throw new PortalError(409,'This client may already have an account or invitation. Use the portal’s password-reset option or check Netlify Identity users.');
      throw new PortalError(502,'Netlify did not accept the invitation. Check the Identity email settings.');
    }
    await this.pool.query("UPDATE skts_identity_invitations SET status='requested' WHERE email=$1",[email]);
    return {requested:true,email,delivery:'email'};
  }
}
