import {PortalError,textField} from '../portal/model.mjs';
export const MAX_FILE_BYTES=3*1024*1024;
export const MAX_UPLOAD_BYTES=MAX_FILE_BYTES+64*1024;
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',txt:'text/plain',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export async function readUpload(request){
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new PortalError(415,'Choose a document file to upload.');
  const reader=request.body?.getReader();if(!reader)throw new PortalError(400,'Choose a document file.');
  let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_UPLOAD_BYTES){await reader.cancel();throw new PortalError(413,'Files must be 3 MB or smaller.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  let form;
  try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')}}).formData();}
  catch{throw new PortalError(400,'The upload could not be read. Choose the file again.');}
  if(form.getAll('file').length!==1)throw new PortalError(400,'Upload one file at a time.');
  const file=form.get('file');if(!file||typeof file==='string'||!file.size)throw new PortalError(400,'Choose a non-empty file.');
  if(file.size>MAX_FILE_BYTES)throw new PortalError(413,'Files must be 3 MB or smaller.');
  const filename=textField(file.name,180,true);
  if(/[\\/\x00-\x1f\x7f]/.test(filename))throw new PortalError(400,'Use a filename without path separators or control characters.');
  const extension=filename.split('.').pop().toLowerCase(),mediaType=formats[extension];
  if(!mediaType)throw new PortalError(415,'Use PDF, DOCX, XLSX, PNG, JPG or TXT files.');
  const bytes=Buffer.from(await file.arrayBuffer());
  const valid=extension==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':extension==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):['jpg','jpeg'].includes(extension)?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:['docx','xlsx'].includes(extension)?bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])):!bytes.includes(0)&&!new TextDecoder('utf-8',{fatal:false}).decode(bytes).includes('\ufffd');
  if(!valid)throw new PortalError(415,'The file contents do not match its extension.');
  const id=form.get('uploadId'),documentId=form.get('documentId')||null;
  if(typeof id!=='string'||!uuidPattern.test(id)||documentId&&(typeof documentId!=='string'||!uuidPattern.test(documentId)))throw new PortalError(400,'Invalid document upload. Refresh and try again.');
  return {id,documentId,title:documentId?'':textField(form.get('title'),120,true),filename,mediaType,bytes};
}
export function reviewInput(input){
  if(!['under_review','approved','changes_needed'].includes(input.status)||!Number.isSafeInteger(input.revision)||input.revision<1)throw new PortalError(400,'Choose a review status and refresh the document.');
  return {status:input.status,note:textField(input.note,2000,true),revision:input.revision};
}
export function downloadHeaders(filename,mediaType){
  const ascii=filename.replace(/[^a-zA-Z0-9._ -]/g,'_');
  const encoded=encodeURIComponent(filename).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return {'Content-Type':mediaType,'Content-Disposition':`attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'",'X-Frame-Options':'DENY'};
}
