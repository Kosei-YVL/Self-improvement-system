import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomBytes} from 'node:crypto';
import {createServer,createConnection} from 'node:net';
import {get} from 'node:http';
import {readFile,mkdir,open,unlink,writeFile,access,stat} from 'node:fs/promises';
import {readFileSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve,dirname,join,win32} from 'node:path';
import {tmpdir,userInfo} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeDataDir} from './focus-paths.mjs';

const execute=promisify(execFile),self=fileURLToPath(import.meta.url);
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function exists(path){try{await access(path);return true;}catch{return false;}}

export async function readConfig(root=dirname(self),env=process.env){
  let appDir;
  for(const candidate of [root,resolve(root,'personal')]){
    if(await exists(resolve(candidate,'server.mjs'))&&await exists(resolve(candidate,'app-assets.json'))){appDir=candidate;break;}
  }
  if(!appDir)throw Error('Focusのフォルダーが見つかりません。以前のSTART-WINDOWS.cmdがあるフォルダーへ起動ツールを追加してください。');
  const assets=JSON.parse(await readFile(resolve(appDir,'app-assets.json'),'utf8'));
  const runtime=assets['/focus-runtime.mjs']?.body;
  const environment=runtime?.match(/FOCUS_ENV\s*=\s*['"](personal|development)['"]/)?.[1];
  if(!environment)throw Error('Focusの環境設定を確認できません。アプリを展開し直してください。');
  const port=Number(env.PORT||(environment==='development'?4546:4545));
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Focusのポート番号が正しくありません。');
  const dataDir=await runtimeDataDir(appDir,environment,env);
  const hash=createHash('sha256').update(JSON.stringify([appDir,dataDir,port])).digest('hex').slice(0,32);
  const pipe=process.platform==='win32'?`\\\\.\\pipe\\focus-${hash}`:join(tmpdir(),`focus-${userInfo().uid}-${hash}.sock`);
  return {root,appDir,runtime,environment,port,dataDir,pipe,url:`http://127.0.0.1:${port}/focus.html`,
    marker:resolve(dataDir,'desktop-session.json'),lock:resolve(dataDir,'desktop-start.lock'),log:resolve(dataDir,'desktop-server.log')};
}

export async function probe(config){
  // Do not reuse keep-alive connections across server stop/start cycles.
  return new Promise(done=>{
    const request=get(`http://127.0.0.1:${config.port}/focus-runtime.mjs`,{agent:false},response=>{
      if(response.statusCode!==200||response.headers['x-tsumikasane-asset']!=='1'){response.resume();done('occupied');return;}
      let body='';response.setEncoding('utf8');
      response.on('data',chunk=>{body+=chunk;if(body.length>10000){request.destroy();done('occupied');}});
      response.on('error',()=>done('occupied'));
      response.on('end',()=>done(body.match(/FOCUS_ENV\s*=\s*['"](personal|development)['"]/)?.[1]===config.environment?'ready':'occupied'));
    });
    request.setTimeout(700,()=>{request.destroy();done('occupied');});
    request.on('error',error=>done(error.code==='ECONNREFUSED'?'absent':'occupied'));
  });
}

async function releaseLock(config,content){
  try{if(await readFile(config.lock,'utf8')===content)await unlink(config.lock);}catch(error){if(error.code!=='ENOENT')throw error;}
}

async function acquireLock(config,deadline){
  while(Date.now()<deadline){
    const content=JSON.stringify({pid:process.pid,time:Date.now(),nonce:randomBytes(16).toString('hex')});
    try{
      const file=await open(config.lock,'wx',0o600);
      try{await file.writeFile(content);}finally{await file.close();}
      return content;
    }catch(error){if(error.code!=='EEXIST')throw error;}
    const status=await probe(config);
    if(status==='ready')return null;
    if(status==='occupied')throw Error('Focusの起動先を別のアプリが使用中か、応答していません。ポート番号は変更せず、使用中のアプリを確認してください。');
    try{
      const content=await readFile(config.lock,'utf8');let previous;
      try{previous=JSON.parse(content);}catch{}
      let alive=false;
      if(Number.isInteger(previous?.pid)&&previous.pid>0){try{process.kill(previous.pid,0);alive=true;}catch(error){alive=error.code==='EPERM';}}
      const age=Date.now()-Number(previous?.time||(await stat(config.lock)).mtimeMs);
      if((previous&&!alive)||age>30000)await releaseLock(config,content);
    }catch(error){if(error.code!=='ENOENT')throw error;}
    await pause(150);
  }
  throw Error('Focusの起動待ちが長くなっています。少し待ってからアイコンを開き直してください。');
}

export async function ensureServer(config,{timeout=15000,env=process.env}={}){
  let state=await probe(config);
  if(state==='ready')return {started:false,url:config.url};
  if(state==='occupied')throw Error('Focusの起動先を別のアプリが使用中か、応答していません。ポート番号は変更せず、使用中のアプリを確認してください。');
  await mkdir(config.dataDir,{recursive:true,mode:0o700});
  const deadline=Date.now()+timeout,lock=await acquireLock(config,deadline);
  if(lock===null)return {started:false,url:config.url};
  let child;
  try{
    state=await probe(config);
    if(state==='ready')return {started:false,url:config.url};
    if(state==='occupied')throw Error('Focusの起動先が使用中です。');
    const log=await open(config.log,'a',0o600);
    try{
      child=spawn(process.execPath,[resolve(config.root,'focus-launcher.mjs'),'--serve'],{
        cwd:config.root,env:{...env,FOCUS_ENV:config.environment,FOCUS_DATA_DIR:config.dataDir,PORT:String(config.port)},
        detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]
      });
      await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});
      child.unref();
    }finally{await log.close();}
    while(Date.now()<deadline){
      state=await probe(config);
      if(state==='ready')return {started:true,url:config.url,pid:child.pid};
      if(child.exitCode!==null||child.signalCode!==null)break;
      await pause(150);
    }
    throw Error('Focusを起動できませんでした。focus-data内のdesktop-server.logを確認してください。');
  }finally{await releaseLock(config,lock);}
}

async function controlRequest(config,marker,command){
  return new Promise((done,reject)=>{
    const socket=createConnection(config.pipe);let body='';
    socket.setTimeout(2500,()=>socket.destroy(Error('Focusの終了処理が応答しません。')));
    socket.on('error',reject);
    socket.on('connect',()=>socket.write(JSON.stringify({command,token:marker.token,instance:marker.instance})+'\n'));
    socket.on('data',chunk=>{body+=chunk;if(body.length>4096)socket.destroy(Error('Invalid local control response'));});
    socket.on('end',()=>{try{const result=JSON.parse(body);if(!result.ok||result.instance!==marker.instance)throw Error('Focusの起動状態を確認できません。');done(result);}catch(error){reject(error);}});
  });
}

export async function stopServer(config){
  let marker;
  try{marker=JSON.parse(await readFile(config.marker,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!marker){
    if(await probe(config)==='absent')return {stopped:false};
    throw Error('以前のSTART-WINDOWS.cmdから起動しています。その黒い起動画面を閉じて終了してください。');
  }
  if(marker.appDir!==config.appDir||marker.environment!==config.environment||marker.port!==config.port)throw Error('別のFocus環境が起動しています。終了を中止しました。');
  try{await controlRequest(config,marker,'stop');}
  catch(error){if(['ENOENT','ECONNREFUSED'].includes(error.code)&&await probe(config)==='absent')return {stopped:false};throw error;}
  const deadline=Date.now()+7000;
  while(Date.now()<deadline){if(await probe(config)==='absent')return {stopped:true};await pause(100);}
  throw Error('Focusの終了待ちが長くなっています。画面を閉じてから再度お試しください。');
}

async function serve(config){
  await mkdir(config.dataDir,{recursive:true,mode:0o700});
  const marker={version:1,pid:process.pid,appDir:config.appDir,environment:config.environment,port:config.port,instance:randomBytes(16).toString('hex'),token:randomBytes(32).toString('base64url')};
  // A stale socket can remain after a crash. Never remove a live control endpoint.
  if(process.platform!=='win32'&&await exists(config.pipe)){
    let live=false;
    try{await new Promise((done,reject)=>{const socket=createConnection(config.pipe);socket.once('connect',()=>{live=true;socket.destroy();done();});socket.once('error',reject);});}catch{}
    if(live)throw Error('Focus is already starting.');
    await unlink(config.pipe);
  }
  const control=createServer(socket=>{
    let body='';socket.setTimeout(2500,()=>socket.destroy());
    socket.on('error',()=>{});
    socket.on('data',chunk=>{
      body+=chunk;
      if(body.length>4096){socket.destroy();return;}
      if(!body.includes('\n'))return;
      let request;try{request=JSON.parse(body.trim());}catch{socket.destroy();return;}
      if(request.token!==marker.token||request.instance!==marker.instance){socket.end(JSON.stringify({ok:false}));return;}
      if(request.command==='status'){socket.end(JSON.stringify({ok:true,instance:marker.instance}));return;}
      if(request.command!=='stop'){socket.destroy();return;}
      socket.end(JSON.stringify({ok:true,instance:marker.instance}),()=>{
        control.close();process.emit('SIGTERM');
      });
    });
  });
  await new Promise((done,reject)=>{control.once('error',reject);control.listen({path:config.pipe,readableAll:false,writableAll:false},done);});
  await writeFile(config.marker,JSON.stringify(marker),{mode:0o600});
  process.once('exit',()=>{
    try{if(JSON.parse(readFileSync(config.marker,'utf8')).instance===marker.instance)unlinkSync(config.marker);}catch{}
    if(process.platform!=='win32')try{unlinkSync(config.pipe);}catch{}
  });
  await import(pathToFileURL(resolve(config.appDir,'server.mjs')).href);
}

export function browserCommand(program,url){return {file:program,args:[`--app=${url}`]};}

export async function openBrowser(url,{platform=process.platform,env=process.env,run=execute,hasFile=exists,start=spawn}={}){
  if(platform!=='win32')throw Error('デスクトップ起動はWindows用です。');
  const system=win32.resolve(env.SystemRoot||'C:\\Windows','System32');let program;
  try{
    const result=await run(win32.resolve(system,'reg.exe'),['query','HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice','/v','ProgId'],{windowsHide:true,timeout:3000});
    const chrome=/ChromeHTML/i.test(result.stdout),edge=/MSEdgeHTM/i.test(result.stdout);
    const bases=[env.LOCALAPPDATA,env.PROGRAMFILES,env['PROGRAMFILES(X86)']].filter(Boolean);
    for(const base of bases){const path=chrome?win32.resolve(base,'Google','Chrome','Application','chrome.exe'):edge?win32.resolve(base,'Microsoft','Edge','Application','msedge.exe'):null;if(path&&await hasFile(path)){program=path;break;}}
  }catch{}
  const launch=async(file,args)=>{
    const child=start(file,args,{detached:true,windowsHide:true,stdio:'ignore'});
    await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});child.unref();
  };
  if(program){try{const command=browserCommand(program,url);await launch(command.file,command.args);return;}catch{}}
  await launch(win32.resolve(system,'rundll32.exe'),['url.dll,FileProtocolHandler',url]);
}

if(process.argv[1]&&!process.argv[1].startsWith('-')&&realpathSync(resolve(process.argv[1]))===realpathSync(self)){
  try{
    const config=await readConfig();
    if(process.argv.includes('--serve'))await serve(config);
    else if(process.argv.includes('--stop'))await stopServer(config);
    else{await ensureServer(config);if(!process.argv.includes('--no-open'))await openBrowser(config.url);}
  }catch(error){
    const index=process.argv.indexOf('--error-file');
    if(index>=0&&process.argv[index+1])try{await writeFile(process.argv[index+1],Buffer.from('\uFEFF'+error.message,'utf16le'));}catch{}
    console.error(error.message);process.exitCode=1;
    if(process.argv.includes('--serve'))process.exit(1);
  }
}
