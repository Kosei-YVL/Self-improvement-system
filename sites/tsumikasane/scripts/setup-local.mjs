import { access,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashPassword,readPassword } from './password-hash.mjs';
export async function createLocalConfig(dir,password){
  const path=resolve(dir,'.env');
  try{await access(path);return false;}catch(error){if(error.code!=='ENOENT')throw error;}
  const contents='APP_ORIGIN=http://127.0.0.1:3000\nAPP_PASSWORD_HASH='+hashPassword(password)+'\n';
  try{await writeFile(path,contents,{flag:'wx',mode:0o600});return true;}catch(error){if(error.code==='EEXIST')return false;throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24以上をインストールしてください: https://nodejs.org/');
    const dir=resolve(import.meta.dirname);
    try{await access(resolve(dir,'.env'));console.log('保存済みの設定で起動します。');process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!process.stdin.isTTY)throw Error('初回はターミナルで起動してパスワードを設定してください。');
    console.log('ChatGPTを使わない、積みかさねの初期設定です。');
    const password=await readPassword('専用パスワード（12文字以上）: '),confirmation=await readPassword('もう一度: ');
    if(password!==confirmation)throw Error('パスワードが一致しません。');
    if(await createLocalConfig(dir,password))console.log('設定を保存しました。パスワードは表示・平文保存しません。');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
