import {projectText,initTextSprites,setTextProjection,setReturnProjection} from './text-sprites.js?v=return-arrival-1';
import {initSectionNavigation} from './section-navigation.js?v=final-flight-11';
import {readingPhase} from './camera-path.js?v=final-flight-11';
import {createPrerenderedPlayer} from './prerendered.js?v=return-left-1';
import {createTextSuspension} from './text-suspension.js';
const viewMode=document.querySelector('#view-mode');
const motionPreferenceKey='choomno-static-view';
let prefersStatic=false;
try{prefersStatic=localStorage.getItem(motionPreferenceKey)==='true';}catch{}
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const player=createPrerenderedPlayer({still:document.querySelector('#background-still'),video:document.querySelector('#background-video'),portraitSource:document.querySelector('#background-portrait')});
let running=!reduced.matches&&!prefersStatic,phase=0,navigation=null;
const textMotion=createTextSuspension(projectText);
function updateText(immediate=false){textMotion.set(running?phase:readingPhase(navigation?.active??0),{immediate:immediate||!running||!document.documentElement.classList.contains('projected-text')});}
function reportProgress(value){
 phase=readingPhase(value);updateText((document.documentElement.classList.contains('reset-flight')&&value===3)||(!player.playing&&Number.isInteger(value)));
 if(!player.playing&&Number.isInteger(value))player.showStation(value,{preload:running});
}
function setResetFlight(active){
 document.documentElement.classList.toggle('reset-flight',active);
 document.querySelector('main').inert=active;
 setReturnProjection(active);
}
function state(){
 viewMode.textContent=running?'Static view':'Animated view';
 viewMode.setAttribute('aria-pressed',String(!running));
 viewMode.setAttribute('aria-label','Static view');
 viewMode.disabled=reduced.matches;
 viewMode.title=reduced.matches?'Your system preference for reduced motion enables static view.':'';
}
function resize(){
 const fit=[...document.querySelectorAll('.reading-copy')].every(copy=>copy.offsetHeight<=innerHeight-160);
 setTextProjection(fit);navigation?.refresh();updateText(true);
}
function changeMotion(value){
 running=value&&!reduced.matches;player.freeze();navigation?.refresh();
 player.showStation(navigation?.active??0,{preload:running});
 updateText(true);state();
}
async function main(){
 const yearLabel=document.querySelector('#copyright-year');
 if(yearLabel)yearLabel.textContent=String(new Date().getFullYear());
 await document.fonts.ready;
 initTextSprites();
 navigation=initSectionNavigation({
  isEnabled:()=>document.documentElement.classList.contains('projected-text'),
  onChange:()=>updateText(),onProgress:reportProgress,
  animateTransition:options=>{
   if(!running){options.onProgress(options.to);options.onComplete();return()=>{};}
   if(!options.reset)return player.navigate(options);
   // Only the opening text plane appears during the closing flight's arrival.
   setResetFlight(true);
   try{
    const cancel=player.navigate({...options,onComplete(){
     options.onComplete();updateText(true);setResetFlight(false);
    }});
    return()=>{try{cancel?.();}finally{setResetFlight(false);}};
   }catch(error){setResetFlight(false);throw error;}
  }
 });
 resize();phase=readingPhase(navigation?.active??0);player.showStation(navigation?.active??0,{preload:running});updateText(true);state();
 window.addEventListener('resize',resize);
 viewMode.addEventListener('click',()=>{
  prefersStatic=running;
  try{localStorage.setItem(motionPreferenceKey,String(prefersStatic));}catch{}
  changeMotion(!prefersStatic);
 });
 reduced.addEventListener('change',()=>changeMotion(!prefersStatic));
 document.addEventListener('visibilitychange',()=>{player.setHidden(document.hidden);if(document.hidden)updateText(true);});
 // In document-flow fallback the background rests at the nearest section.
 window.addEventListener('scroll',()=>{
  if(document.documentElement.classList.contains('projected-text'))return;
  const sections=[...document.querySelectorAll('main > section')];
  const index=sections.reduce((best,section,i)=>Math.abs(section.getBoundingClientRect().top+section.offsetHeight/2-innerHeight/2)<Math.abs(sections[best].getBoundingClientRect().top+sections[best].offsetHeight/2-innerHeight/2)?i:best,0);
  player.showStation(index,{preload:running});
 },{passive:true});
}
main().catch(error=>{console.error(error);setResetFlight(false);player.freeze();setTextProjection(false);});
