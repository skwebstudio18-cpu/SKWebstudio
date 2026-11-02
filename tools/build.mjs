import { build } from 'esbuild';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import {loginScreen} from '../src/portal/login-view.mjs';
import {buildSitePages} from './site-pages.mjs';
await buildSitePages();
await mkdir('SKTS-netlify/portal/assets', { recursive: true });
await build({ entryPoints: ['src/portal/app.mjs','src/portal/callback.mjs'], bundle:true, outdir:'SKTS-netlify/portal/assets', format:'esm', platform:'browser', target:'es2022', minify:true, legalComments:'none', entryNames:'[name]', sourcemap:false });
const template=await readFile('SKTS-netlify/portal/index.html','utf8');
if(!template.includes('<!-- auth:start -->')||!template.includes('<!-- auth:end -->'))throw new Error('Portal login template markers are missing.');
for(const [path,access]of [['','client'],['client/','client'],['admin/','admin']]){
  await mkdir('SKTS-netlify/portal/'+path,{recursive:true});
  const page=template.replace(/<!-- auth:start -->[\s\S]*?<!-- auth:end -->/,'<!-- auth:start -->'+loginScreen(access)+'<!-- auth:end -->').replace(/<body[^>]*>/,`<body class="portal-login" data-access="${access}">`).replace(/<title>[^<]*<\/title>/,`<title>${access==='admin'?'Admin':'Client'} sign in — SKTS</title>`).replace(/(<meta name="theme-color" content=")[^"]*/,`$1${access==='admin'?'#111c34':'#087f83'}`);
  await writeFile('SKTS-netlify/portal/'+path+'index.html',page);
}
console.log('Portal browser bundles built. Netlify Functions and database migrations deploy separately through Netlify builds.');
