import { readdir,readFile } from 'node:fs/promises';
import { resolve,relative } from 'node:path';
import { createHash } from 'node:crypto';

// Shared compiler: no hosting account, configuration, or credentials are read.
export async function collectWebAssets(root,{deviceOnly=false,focus=false,focusEnvironment='personal',focusSync=false}={}){
  const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',webmanifest:'application/manifest+json',png:'image/png',webp:'image/webp',svg:'image/svg+xml',LICENSE:'text/plain; charset=utf-8'};
  const assets={};
  async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=resolve(dir,entry.name);if(entry.isDirectory()){await collect(path);continue;}
    const key='/'+relative(resolve(root,'web'),path).replaceAll('\\','/'),ext=path.split('.').pop();
    assets[key]={body:await readFile(path,['png','webp'].includes(ext)?'base64':'utf8'),type:types[ext]||'text/plain; charset=utf-8',...(['png','webp'].includes(ext)?{encoding:'base64'}:{})};
  }}
  await collect(resolve(root,'web'));
  if(focus){assets['/focus-runtime.mjs'].body='export const FOCUS_ENV='+JSON.stringify(focusEnvironment)+';\nexport const SYNC_ENABLED='+JSON.stringify(focusSync)+';\n';for(const [target,source] of [['icon-192.png','focus-192.png'],['icon-512.png','focus-512.png'],['maskable-512.png','focus-512.png'],['apple-touch-icon.png','focus-180.png']])assets['/icons/'+target]=assets['/icons/'+source];assets['/index.html'].body=assets['/focus.html'].body;const m=JSON.parse(assets['/manifest.webmanifest'].body);m.name='Focus';m.short_name='Focus';m.description='タスク・計測・記録';m.display_override=['standalone','minimal-ui'];m.orientation='any';m.categories=['productivity'];m.shortcuts=[['ホーム','dashboard'],['タスク','tasks'],['記録','review']].map(([name,page])=>({name,url:'/focus.html#'+page,icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'}]}));m.theme_color='#10171c';m.background_color='#10171c';assets['/manifest.webmanifest'].body=JSON.stringify(m);}
  if(deviceOnly){
    assets['/runtime.mjs'].body='export const DEVICE_ONLY=true;\n';
    assets['/style.css'].body=assets['/style.css'].body.replace(/^@import[^\n]*(?:\n|$)/,'');
    const manifest=JSON.parse(assets['/manifest.webmanifest'].body);manifest.id=focus?(focusEnvironment==='development'?'/focus-development':'/focus-test'):'/device-test';manifest.name=focus?'Focus':'積みかさね — 端末内テスト版';manifest.start_url=focus?'/focus.html':'/#today';assets['/manifest.webmanifest'].body=JSON.stringify(manifest);
    const policy="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'";
    assets['/index.html'].body=assets['/index.html'].body.replace('<head>','<head>\n  <meta http-equiv="Content-Security-Policy" content="'+policy+'">');if(focus)assets['/focus.html'].body=assets['/index.html'].body;
  }
  const shellPaths=Object.keys(assets).filter(p=>p!=='/sw.js'&&!p.endsWith('.LICENSE')).sort();
  const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,16);
  assets['/sw.js'].body=assets['/sw.js'].body.replace('__SHELL_VERSION__',version).replace('__SHELL_PATHS__',JSON.stringify(shellPaths));
  return assets;
}
export async function bundleWorker(root){
  const assets=await collectWebAssets(root);
  const core=(await readFile(resolve(root,'web/core.mjs'),'utf8')).replace(/^export /gm,'');
  const worker=(await readFile(resolve(root,'worker/index.js'),'utf8')).replace(/^import .*;\n/m,'');
  const code='const SITE_ASSETS='+JSON.stringify(assets)+';\n'+core+'\n'+worker;
  await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  return {code,assetCount:Object.keys(assets).length};
}
