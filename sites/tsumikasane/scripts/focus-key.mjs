import {randomBytes,createHash} from 'node:crypto';
const secret=randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('hex');
console.log('同期キー（端末にだけ入力し、保管）: '+secret+'\nSYNC_AUTH_HASH（サーバーsecret）: '+hash(hash('focus-auth-v1:'+secret)));
