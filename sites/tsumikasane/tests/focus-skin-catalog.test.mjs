import assert from 'node:assert/strict';
import {SKINS,SKIN_IDS,glassSkin} from '../web/focus-skins.mjs';
import {validConfig} from '../web/focus-model.mjs';
const lum=c=>c.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
assert.equal(SKINS.length,20);assert.equal(new Set(SKIN_IDS).size,20);assert.equal(new Set(SKINS.map(s=>s.preview)).size,20);
for(const s of SKINS){
 assert(validConfig({template:'focus',order:['capture','plan','progress','logs'],routines:[],progress:'calendar',skin:s.id}));
 assert.equal(glassSkin(s.id),s.glass);
 for(const mode of ['dark','light']){const p=s[mode];assert.equal(p.length,8);assert(p.every(c=>/^#[a-f0-9]{6}$/.test(c)));for(const [a,b] of [[4,1],[5,1],[7,6]])assert(contrast(p[a],p[b])>=4.5,`${s.id} ${mode} ${a}/${b}`);}
}
assert(!validConfig({template:'focus',order:['capture','plan','progress','logs'],routines:[],progress:'calendar',skin:'unknown-skin'}));
console.log('20 unique skins × 2 themes: main/secondary/button text contrast ≥4.5; strict configuration and optics choices pass.');

const {readFile}=await import('node:fs/promises');const css=await readFile(new URL('../web/focus-experience.css',import.meta.url),'utf8');const nowColors=[...css.matchAll(/--now-color:(#[a-f0-9]{6})/g)].map(m=>m[1]);assert.equal(nowColors.length,2);for(const skin of SKINS)for(const [i,mode] of ['dark','light'].entries())assert(contrast(nowColors[i],skin[mode][1])>=4.5,`${skin.id} ${mode} now-time label contrast`);
