const next=()=>location.replace('/focus.html'+(location.hash.startsWith('#sync=')?location.hash:''));
document.querySelector('#retry').onclick=()=>location.reload();
document.querySelector('#open').onclick=next;
try{
  if('serviceWorker'in navigator&&window.isSecureContext){
    const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
    await registration.update();
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){
      if(registration.waiting)registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
      if(!registration.waiting&&!registration.installing&&registration.active?.state==='activated')break;
      await new Promise(done=>setTimeout(done,100));
    }
    if(registration.waiting||registration.installing)throw Error('更新の準備を完了できませんでした。');
  }
  next();
}catch(error){document.querySelector('#status').textContent=error.message;document.querySelector('#actions').hidden=false;}
