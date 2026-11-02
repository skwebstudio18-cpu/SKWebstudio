import {randomUUID,createHash} from 'node:crypto';
import {PortalError} from '../portal/model.mjs';
export class DocumentRepository{
  constructor(pool,store){this.pool=pool;this.store=store;}
  async project(db,actor,reference,lock=false){
    const {rows}=await db.query(`SELECT reference FROM skts_requests WHERE reference=$1 AND ($2::boolean OR customer_email=$3)${lock?' FOR UPDATE':''}`,[reference,actor.admin,actor.email]);
    if(!rows.length)throw new PortalError(404,'Project not found.');
  }
  async transaction(fn){const db=await this.pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
  async list(actor,reference){
    await this.project(this.pool,actor,reference);
    const {rows}=await this.pool.query(`SELECT d.id AS document_id,d.title,v.id,v.version,v.filename,v.media_type,v.size_bytes,v.uploader_email,v.created_at,v.status,v.review_revision FROM skts_project_documents d JOIN skts_document_versions v ON v.document_id=d.id WHERE d.request_reference=$1 ORDER BY d.created_at DESC,d.id,v.version DESC`,[reference]);
    const reviews=(await this.pool.query(`SELECT r.id,r.version_id,r.status,r.note,r.created_at FROM skts_document_reviews r JOIN skts_document_versions v ON v.id=r.version_id JOIN skts_project_documents d ON d.id=v.document_id WHERE d.request_reference=$1 ORDER BY r.created_at,r.id`,[reference])).rows;
    const documents=new Map();for(const row of rows){if(!documents.has(row.document_id))documents.set(row.document_id,{id:row.document_id,title:row.title,versions:[]});const {document_id,title,...version}=row;documents.get(document_id).versions.push({...version,reviews:reviews.filter(r=>r.version_id===row.id)});}
    return {items:[...documents.values()],usedBytes:rows.reduce((n,v)=>n+v.size_bytes,0)};
  }
  async upload(actor,reference,input){
    const sha=createHash('sha256').update(input.bytes).digest('hex');
    return this.transaction(async db=>{
      await this.project(db,actor,reference,true);
      const prior=(await db.query(`SELECT v.id,v.sha256,d.request_reference,v.document_id FROM skts_document_versions v JOIN skts_project_documents d ON d.id=v.document_id WHERE v.id=$1`,[input.id])).rows[0];
      if(prior){if(prior.request_reference!==reference||prior.sha256!==sha||input.documentId&&prior.document_id!==input.documentId)throw new PortalError(409,'This upload reference has already been used. Choose the file again.');return {saved:true,id:prior.id,duplicate:true};}
      const totals=(await db.query(`SELECT count(*)::int AS versions,COALESCE(sum(v.size_bytes),0) AS bytes FROM skts_document_versions v JOIN skts_project_documents d ON d.id=v.document_id WHERE d.request_reference=$1`,[reference])).rows[0];
      if(totals.versions>=100||Number(totals.bytes)+input.bytes.length>100*1024*1024)throw new PortalError(413,'This project has reached its 100-version or 100 MB document limit. Contact SKTS.');
      let documentId=input.documentId,title=input.title;
      if(documentId){const record=(await db.query('SELECT title FROM skts_project_documents WHERE id=$1 AND request_reference=$2',[documentId,reference])).rows[0];if(!record)throw new PortalError(404,'Document not found in this project.');title=record.title;}
      else{documentId=randomUUID();await db.query('INSERT INTO skts_project_documents(id,request_reference,title,created_by) VALUES ($1,$2,$3,$4)',[documentId,reference,title,actor.id]);}
      const version=Number((await db.query('SELECT COALESCE(max(version),0)+1 AS next FROM skts_document_versions WHERE document_id=$1',[documentId])).rows[0].next);
      const key=`projects/${reference}/${input.id}`;
      // Immutable random keys make a repeated upload safe. An object is never
      // downloadable until its scoped metadata transaction commits. If commit
      // fails, retrying the same upload ID can reuse the exact bytes safely.
      await this.store.put(key,input.bytes);
      await db.query(`INSERT INTO skts_document_versions(id,document_id,version,storage_key,filename,media_type,size_bytes,sha256,uploaded_by,uploader_email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[input.id,documentId,version,key,input.filename,input.mediaType,input.bytes.length,sha,actor.id,actor.email]);
      await db.query(`INSERT INTO skts_request_events(id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`,[randomUUID(),reference,actor.id,`Document received: ${title}, version ${version}.`]);
      await db.query('UPDATE skts_requests SET updated_at=now() WHERE reference=$1',[reference]);
      return {saved:true,id:input.id,documentId,version};
    });
  }
  async download(actor,reference,id){
    await this.project(this.pool,actor,reference);
    const file=(await this.pool.query(`SELECT v.storage_key,v.filename,v.media_type,v.sha256 FROM skts_document_versions v JOIN skts_project_documents d ON d.id=v.document_id WHERE v.id=$1 AND d.request_reference=$2`,[id,reference])).rows[0];
    if(!file)throw new PortalError(404,'Document not found.');
    const bytes=await this.store.get(file.storage_key);
    if(!bytes)throw new PortalError(404,'The stored file is unavailable. Contact SKTS.');
    if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new PortalError(503,'The document integrity check failed. Contact SKTS.');
    return {...file,bytes};
  }
  async review(actor,reference,id,input){
    if(!actor.admin)throw new PortalError(403,'Administrator access required.');
    return this.transaction(async db=>{
      await this.project(db,actor,reference,true);
      const row=(await db.query(`SELECT v.review_revision,v.version,d.title FROM skts_document_versions v JOIN skts_project_documents d ON d.id=v.document_id WHERE v.id=$1 AND d.request_reference=$2`,[id,reference])).rows[0];
      if(!row)throw new PortalError(404,'Document not found.');
      if(row.review_revision!==input.revision)throw new PortalError(409,'This document review changed. Refresh before saving.');
      await db.query('UPDATE skts_document_versions SET status=$2,review_revision=review_revision+1 WHERE id=$1',[id,input.status]);
      await db.query('INSERT INTO skts_document_reviews(id,version_id,actor_id,status,note) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),id,actor.id,input.status,input.note]);
      await db.query(`INSERT INTO skts_request_events(id,request_reference,actor_id,message,visibility) VALUES ($1,$2,$3,$4,'customer')`,[randomUUID(),reference,actor.id,`Document ${row.title}, version ${row.version}: ${input.status.replaceAll('_',' ')}. ${input.note}`]);
      await db.query('UPDATE skts_requests SET updated_at=now() WHERE reference=$1',[reference]);
      return {saved:true};
    });
  }
}
