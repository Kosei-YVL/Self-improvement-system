import { resolve } from 'node:path';
export function standaloneConfig(env){
  const hosted=env.RENDER==='true'||!!env.RENDER_EXTERNAL_URL;
  if(hosted&&!env.DATA_DIR)throw Error('クラウドではDATA_DIRに永続ディスクの保存先を指定してください。');
  const origin=env.APP_ORIGIN||env.RENDER_EXTERNAL_URL;
  if(!origin)throw Error('APP_ORIGINにアプリのURLを指定してください。');
  const port=Number(env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORTが不正です。');
  return {origin,passwordHash:env.APP_PASSWORD_HASH,dataDir:resolve(env.DATA_DIR||'./data'),port,host:env.HOST||(hosted?'0.0.0.0':'127.0.0.1')};
}
