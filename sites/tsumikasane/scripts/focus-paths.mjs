import {readFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
// Installation metadata never lives in a release manifest. Updates keep it intact.
export async function runtimeDataDir(appDir,environment,env=process.env){
 if(env.FOCUS_DATA_DIR)return resolve(env.FOCUS_DATA_DIR);
 let installation;
 try{installation=JSON.parse(await readFile(resolve(appDir,'installation.json'),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw Error('Focusの保存先設定を確認してください。installation.jsonを保持して復旧してください。');}
 if(installation){
  if(installation.format!=='focus-installation'||installation.version!==1||installation.environment!==environment||typeof installation.dataDir!=='string'||!isAbsolute(installation.dataDir)||installation.dataDir.includes('\0'))throw Error('Focusの保存先設定が正しくありません。');
  return resolve(installation.dataDir);
 }
 return resolve(appDir,'..','focus-data',environment);
}
