export function privateOrigin(value){
 if(!value)return '';
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.includes('.')||!/^[a-z0-9.-]+$/i.test(url.hostname))throw Error('私用HTTPS URLの形式を確認してください。');
 return url.origin;
}
export function originForRequest(request,local,privateURL=''){
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress))return null;
 const host=request.headers.host,localHost=new URL(local).host,remoteHost=privateURL?new URL(privateURL).host:null;
 if(host!==localHost&&host!==remoteHost)return null;
 if(privateURL&&(host===remoteHost||request.headers.origin===privateURL))return privateURL;
 return local;
}
