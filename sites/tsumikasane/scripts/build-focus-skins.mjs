import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SKINS} from '../web/focus-skins.mjs';
const keys=['bg','paper','control','line','ink','muted','green','primary-ink'];
let css='/* Generated from focus-skins.mjs. Static decoration; no animation loop. */\n';
for(const s of SKINS){
 for(const mode of ['dark','light']){
  const colors=s[mode];css+=`[data-theme=${mode}][data-skin=${s.id}]{${keys.map((k,i)=>`--${k}:${colors[i]}`).join(';')};--heat:${colors[6]};--heat-ink:${colors[7]};--skin-scene:${s.preview};--scene-opacity:${mode==='dark'?'.38':'.22'}}\n`;
 }
 css+=`[data-preview-skin=${s.id}]{--skin-preview:${s.preview};--swatch-panel:${s.dark[1]};--swatch-ink:${s.dark[4]};--swatch-accent:${s.dark[6]}}\n`;
}
css+=`
html[data-skin]:not([data-skin=chrome]):not([data-skin=garnet]) body{isolation:isolate;background:var(--bg)}
html[data-skin]:not([data-skin=chrome]):not([data-skin=garnet]):not([data-skin=graphite]):not([data-skin=glass]) body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--skin-scene);background-size:cover;opacity:var(--scene-opacity);contain:paint}
[data-skin=opium] body::before,[data-skin=decadence] body::before{background-image:linear-gradient(#100c1299,#100c12b8),url('/skins/garnet.webp')!important;filter:grayscale(.9);background-size:cover!important;opacity:.55!important}
[data-skin=decadence] body::before{background-image:linear-gradient(#352b1880,#20190c99),url('/skins/garnet.webp')!important;filter:sepia(.75) saturate(.6)}
[data-skin=glitch] .panel{box-shadow:inset 1px 0 #7cf3da1a,inset -1px 0 #e37faa16,0 8px 24px #0000001a}
[data-skin=terminal] .timer-output{font-family:ui-monospace,"Cascadia Code",monospace;font-weight:400}
[data-skin=aero] .primary-button{box-shadow:inset 0 1px #ffffff80,0 3px 10px #004c6422;background:linear-gradient(#ffffff2c,transparent 55%),var(--green)}
.skin-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px}
.skin-controls button{margin-top:6px;min-height:44px;padding:9px 12px;font-size:12px}
.skin-gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.skin-choice{min-width:0;padding:6px;background:var(--bg);text-align:left;border-radius:12px;border:1px solid var(--line);box-shadow:none;scroll-margin:12px}
.skin-choice[aria-pressed=true]{background:var(--control);border-color:var(--green);outline:1px solid var(--green)}
.skin-choice strong{display:block;font-weight:500;font-size:11px;line-height:1.4;padding:7px 3px 2px;overflow-wrap:anywhere;color:var(--ink)}
.skin-swatch{height:72px;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:11px 8px;border-radius:7px;background:var(--skin-preview);pointer-events:none}
.skin-swatch i{display:block;border:1px solid #ffffff32;border-radius:5px;background:var(--swatch-panel);position:relative;box-shadow:0 2px 7px #0003}
.skin-swatch i::before{content:"";position:absolute;left:5px;right:9px;top:7px;height:2px;background:var(--swatch-ink);opacity:.7;box-shadow:0 5px var(--swatch-ink)}
.skin-swatch i:first-child::after{content:"";position:absolute;bottom:6px;left:5px;right:8px;height:7px;border-radius:2px;background:var(--swatch-accent)}
.skin-gallery-dialog{width:min(740px,calc(100% - 24px))}
html[data-theme] .error{color:var(--error-ink,#ffb6a7)}html[data-theme=light] .error{--error-ink:#9b3019}
html[data-theme] .primary-button{color:var(--primary-ink)}
@media(max-width:500px){.skin-gallery{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.skin-swatch{height:70px}}
@media(prefers-reduced-transparency:reduce),(forced-colors:active){body::before{display:none!important}}
@media(prefers-reduced-motion:reduce){html[data-skin] body::before{position:absolute}}
`;
await writeFile(resolve(import.meta.dirname,'../web/focus-skins.css'),css);
console.log(`Built ${SKINS.length} skins (${Buffer.byteLength(css)} bytes)`);
