import {getStore,getDeployStore} from '@netlify/blobs';
import {getContext} from '@netlify/functions';
import {createHash} from 'node:crypto';
import {PortalError} from '../portal/model.mjs';
export function cloudDocumentStore({context=getContext(),siteStore=getStore,deployStore=getDeployStore}={}){
  const production=context.deploy.context==='production';
  const store=production?siteStore({name:'skts-project-files-production',consistency:'strong'}):deployStore({name:'skts-project-files-preview',consistency:'strong'});
  return {
    async put(key,bytes){
      try{const result=await store.set(key,bytes,{onlyIfNew:true});if(!result.modified){const prior=await store.get(key,{type:'arrayBuffer'});if(!prior||createHash('sha256').update(Buffer.from(prior)).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Immutable object conflict');}}
      catch{console.error('Project document storage failed.',{code:'DOCUMENT_WRITE_FAILED'});throw new PortalError(503,'Document storage is unavailable. Retry the same upload later.');}
    },
    async get(key){try{const value=await store.get(key,{type:'arrayBuffer'});return value?Buffer.from(value):null;}catch{console.error('Project document storage failed.',{code:'DOCUMENT_READ_FAILED'});throw new PortalError(503,'Document storage is unavailable. Please try later.');}}
  };
}
