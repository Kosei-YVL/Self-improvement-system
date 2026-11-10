import { mkdir,rm,writeFile,copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectWebAssets } from './build-worker.mjs';
const focus=process.argv.includes('--focus');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,focus?'focus-test':'device-test'),assets=await collectWebAssets(root,{deviceOnly:true,focus});
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await writeFile(resolve(out,'app-assets.json'),JSON.stringify(assets));
if(focus){const {readFile}=await import('node:fs/promises');const server=await readFile(resolve(root,'scripts/device-server.mjs'),'utf8');await writeFile(resolve(out,'server.mjs'),server.replaceAll('積みかさね 端末内テスト版','Focus').replaceAll('http://127.0.0.1:4545','http://127.0.0.1:4545/focus.html'));}else await copyFile(resolve(root,'scripts/device-server.mjs'),resolve(out,'server.mjs'));
await copyFile(resolve(root,'deploy/START-DEVICE-WINDOWS.cmd'),resolve(out,'START-WINDOWS.cmd'));if(focus){const {readFile}=await import('node:fs/promises');const cmd=await readFile(resolve(out,'START-WINDOWS.cmd'),'utf8');await writeFile(resolve(out,'START-WINDOWS.cmd'),cmd.replaceAll('http://127.0.0.1:4545','http://127.0.0.1:4545/focus.html'));}
await copyFile(resolve(root,focus?'FOCUS.md':'DEVICE-TEST.md'),resolve(out,'README.md'));
await writeFile(resolve(out,'package.json'),JSON.stringify({name:'tsumikasane-device-test',private:true,type:'module',engines:{node:'>=24'},scripts:{start:'node server.mjs'}},null,2)+'\n');
await mkdir(resolve(out,'web'),{recursive:true});
for(const [name,asset] of Object.entries(assets)){
  const path=resolve(out,'web',name.slice(1));await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,Buffer.from(asset.body,asset.encoding==='base64'?'base64':'utf8'));
}
console.log('Built '+(focus?'focus-test/':'device-test/')+': device-only IndexedDB storage, offline app, no cloud API or external fonts.');
