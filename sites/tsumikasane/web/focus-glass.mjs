import {glassSkin} from './focus-skins.mjs';
// Native scroll timelines change compositor opacity. No scroll handler or inherited per-frame CSS writes.
export class GlassMotion {
 constructor({root=document.documentElement}={}){
  this.root=root;this.active=false;
  this.reduced=matchMedia('(prefers-reduced-motion:reduce)');
  this.motion=()=>{this.root.dataset.glassMotion=!this.reduced.matches&&CSS.supports('animation-timeline','scroll()')?'scroll':'static';};
  this.reduced.addEventListener('change',this.motion);
 }
 configure({skin='graphite',enabled=true}={}){
  this.active=enabled&&glassSkin(skin);this.skin=skin;
  this.root.dataset.glass=this.active?'on':'off';this.root.dataset.glassRefraction='false';this.motion();
 }
 destroy(){this.reduced.removeEventListener('change',this.motion);this.active=false;this.root.dataset.glass='off';}
}
