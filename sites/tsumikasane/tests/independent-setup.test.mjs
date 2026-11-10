import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,cp } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { standaloneConfig } from '../scripts/standalone-config.mjs';
import { createLocalConfig } from '../scripts/setup-local.mjs';
const dir=await mkdtemp(join(tmpdir(),'tsumikasane-setup-'));
try{
  assert.equal(await createLocalConfig(dir,'test-password-new-123'),true);
  const original=await readFile(join(dir,'.env'),'utf8');assert.match(original,/APP_PASSWORD_HASH=scrypt:/);assert.ok(!original.includes('test-password-new-123'));
  assert.equal(await createLocalConfig(dir,'test-replacement-456'),false);assert.equal(await readFile(join(dir,'.env'),'utf8'),original);
  const local=standaloneConfig({APP_ORIGIN:'http://127.0.0.1:3000',APP_PASSWORD_HASH:'test'});assert.equal(local.host,'127.0.0.1');assert.equal(local.port,3000);
  assert.throws(()=>standaloneConfig({RENDER:'true',RENDER_EXTERNAL_URL:'https://example.onrender.com'}),/永続ディスク/);
  const cloud=standaloneConfig({RENDER:'true',RENDER_EXTERNAL_URL:'https://example.onrender.com',DATA_DIR:'/var/data',PORT:'10000'});assert.equal(cloud.origin,'https://example.onrender.com');assert.equal(cloud.host,'0.0.0.0');assert.equal(cloud.port,10000);
  assert.throws(()=>standaloneConfig({APP_ORIGIN:'http://localhost',PORT:'NaN'}),/PORT/);
  // The full standalone build must work with no .openai directory or installed packages.
  const source=join(dir,'source');
  for(const name of ['web','worker','scripts','drizzle','deploy','STANDALONE.md','package.json'])await cp(resolve(name),join(source,name),{recursive:true});
  await import(pathToFileURL(join(source,'scripts/build-standalone.mjs')).href);
  const built=await readFile(join(source,'standalone/server.mjs'),'utf8');assert.ok(built.includes('createStandalone'));
  console.log('Independent setup checks passed: safe password setup, settings preserved, hosted persistence guard, automatic hosted origin and build without ChatGPT configuration.');
}finally{await rm(dir,{recursive:true,force:true});}
