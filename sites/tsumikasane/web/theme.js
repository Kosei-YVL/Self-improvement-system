const media=matchMedia('(prefers-color-scheme: dark)');
let preference='system';
try{preference=localStorage.getItem('tsumikasane-theme')||'system';}catch{}
const apply=()=>{const dark=preference==='dark'||preference==='system'&&media.matches;document.documentElement.dataset.theme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#142018':'#326653');document.documentElement.style.colorScheme=dark?'dark':'light';const button=document.querySelector('#theme-toggle');if(button){button.textContent=dark?'☀':'☾';button.setAttribute('aria-label',dark?'ライトモードに切り替える':'ダークモードに切り替える');button.title=dark?'ライトモード':'ダークモード';}const select=document.querySelector('#theme-preference');if(select)select.value=preference;};
export function setTheme(value){if(!['light','dark','system'].includes(value))return;preference=value;try{localStorage.setItem('tsumikasane-theme',value);}catch{}apply();}
document.addEventListener('click',e=>{if(e.target.closest('#theme-toggle'))setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');});
document.addEventListener('change',e=>{if(e.target.id==='theme-preference')setTheme(e.target.value);});
media.addEventListener('change',()=>{if(preference==='system')apply();});
export const refreshTheme=apply;
apply();
