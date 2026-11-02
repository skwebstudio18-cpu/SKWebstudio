import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {PortalError} from '../portal/model.mjs';
export function localDocumentStore(directory){
  const root=resolve(directory);
  const file=key=>{if(!/^projects\/SKTS-\d{8}-[A-F0-9]{16}\/[0-9a-f-]{36}$/i.test(key))throw new Error('Invalid storage key');const target=resolve(root,...key.split('/'));if(!target.startsWith(root+sep))throw new Error('Invalid storage path');return target;};
  return {
    async put(key,bytes){const target=file(key);await mkdir(dirname(target),{recursive:true});try{await writeFile(target,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const prior=await readFile(target);if(createHash('sha256').update(prior).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw new PortalError(409,'This upload reference has already been used. Choose the file again.');}},
    async get(key){try{return await readFile(file(key));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  };
}
