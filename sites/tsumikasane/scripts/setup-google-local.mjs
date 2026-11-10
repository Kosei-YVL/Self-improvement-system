import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {runtimeDataDir} from './focus-paths.mjs';
const root=resolve(import.meta.dirname),assets=JSON.parse(await readFile(resolve(root,'app-assets.json'),'utf8')),environment=JSON.parse(assets['/focus-runtime.mjs'].body.match(/FOCUS_ENV=("[^"\n]+")/)[1]),port=environment==='development'?4546:4545;
const dir=await runtimeDataDir(root,environment),rl=createInterface({input:process.stdin,output:process.stdout});
const lines=rl[Symbol.asyncIterator]();const ask=async prompt=>{process.stdout.write(prompt);const {value,done}=await lines.next();if(done)throw Error('入力が終了しました。もう一度設定してください。');return value;};
try{
 console.log('Focus用のGoogle OAuth設定。Google Cloudでウェブ用クライアントを作成し、以下をリダイレクトURIに登録してください。\nhttp://127.0.0.1:'+port+'/oauth/google/callback');
 const clientId=(await ask('クライアントID: ')).trim();if(!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('ウェブ用クライアントIDを確認してください。');
 const clientSecret=(await ask('クライアントシークレット（このPC内に保存）: ')).trim();if(!clientSecret||clientSecret.length>4096)throw Error('クライアントシークレットを確認してください。');
 await mkdir(dir,{recursive:true,mode:0o700});const target=resolve(dir,'google-config.json'),temp=target+'.new';
 await writeFile(temp,JSON.stringify({clientId,clientSecret,redirectUri:'http://127.0.0.1:'+port+'/oauth/google/callback'},null,2)+'\n',{mode:0o600});await rename(temp,target);
 console.log('保存しました。Focusの起動ウィンドウを閉じて再起動し、設定→Googleに接続を選んでください。');
}catch(error){console.error(error.message);process.exitCode=1;}finally{rl.close();}
