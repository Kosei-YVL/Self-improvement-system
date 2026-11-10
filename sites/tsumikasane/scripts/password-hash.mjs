import { randomBytes, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export function hashPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('パスワードは12〜1024文字で指定してください。');
  const salt=randomBytes(16).toString('base64url');
  return 'scrypt:'+salt+':'+scryptSync(password,salt,64).toString('base64url');
}
export async function readPassword(label){
  process.stderr.write(label);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');let value='';
  return new Promise((resolve,reject)=>{const listener=text=>{
    for(const char of text){
      if(char==='\u0003'){finish();reject(Error('中断しました。'));return;}
      if(char==='\r'||char==='\n'){finish();resolve(value);return;}
      if(char==='\u007f'||char==='\b')value=[...value].slice(0,-1).join('');else if(char>=' ')value+=char;
    }
  };function finish(){process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stderr.write('\n');}process.stdin.on('data',listener);});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(!process.stdin.isTTY)throw Error('対話端末で実行してください。パスワードは画面へ表示しません。');
    const password=await readPassword('新しいパスワード（12文字以上）: '),confirmation=await readPassword('もう一度: ');
    if(password!==confirmation)throw Error('パスワードが一致しません。');
    console.log('APP_PASSWORD_HASH='+hashPassword(password));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
