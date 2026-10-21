import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {transitionDuration,textSlideDuration,transitionProgress} from '../transition-timing.js';
import {projectReadingPlaneWithDepth,readingPhase} from '../projection.js';
import {videoFramesPerSecond} from '../media-settings.js';

const scenario=process.argv[2];
if(!scenario){
 for(const name of ['media-clock','autoplay-rejection','media-failure','paused','saved-static','reduced-motion','rounded-scroll','short-viewport','rewind-cancel']){
  const result=spawnSync(process.execPath,['--experimental-default-type=module',fileURLToPath(import.meta.url),name],{encoding:'utf8'});
  assert.equal(result.status,0,`${name}: ${result.stdout}${result.stderr}`);
 }
 console.log('Scene integration: decoded media frames drive text; stalls, rounded scrolling and visibility retain the same pose; playback failures preserve navigation; pause/reduced motion, rewind, cancellation and short-viewport flow pass.');
}else{
 let now=0,nextId=0,rafs=new Map(),timers=new Map();
 class Target {
  constructor(kind=''){this.kind=kind;this.listeners=new Map();this.attributes={};this.children=[];this.style={};}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  dispatchEvent(event){event.target??=this;for(const fn of this.listeners.get(event.type)||[])fn(event);return !event.defaultPrevented;}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key]??null;}
  append(...children){this.children.push(...children);}
  remove(){}
  focus(options){document.activeElement=this;this.focusOptions=options;document.dispatchEvent({type:'focusin',target:this});}
  closest(selector){
   if(selector==='main > section')return this.section||null;
   return selector.split(',').some(part=>part===this.kind||part==='a[href]'&&this.kind==='a')?this:null;
  }
 }
 class Classes {
  values=new Set();add(value){this.values.add(value);}
  contains(value){return this.values.has(value);}
  toggle(value,enabled){if(enabled)this.values.add(value);else this.values.delete(value);}
 }
 class Video extends Target {
  constructor(){super('video');this.frames=new Map();this.sources=[];this.currentTime=0;this.readyState=4;this.paused=true;this.hidden=true;this.playCalls=0;}
  canPlayType(type){return type.startsWith('video/mp4')||scenario==='media-failure'&&type.startsWith('video/webm')?'probably':'';}
  load(){this.sources.push(this.src);this.currentTime=0;}
  play(){++this.playCalls;this.paused=false;return scenario==='autoplay-rejection'?Promise.reject(new Error('Autoplay blocked')):Promise.resolve();}
  pause(){this.paused=true;}
  requestVideoFrameCallback(fn){const id=++nextId;this.frames.set(id,fn);return id;}
  cancelVideoFrameCallback(id){this.frames.delete(id);}
  present(seconds){
   assert.equal(this.paused,false,'a paused player must not consume another decoded frame');
   const [id,fn]=this.frames.entries().next().value??[];assert.ok(fn,'a frame callback must be pending');
   this.frames.delete(id);this.currentTime=seconds;fn(now,{mediaTime:seconds});
  }
 }
 const win=new Target(),doc=new Target(),media=new Target();media.matches=scenario==='reduced-motion';
 globalThis.window=win;globalThis.document=doc;globalThis.innerHeight=scenario==='short-viewport'?390:800;globalThis.innerWidth=1280;globalThis.scrollY=0;
 Object.defineProperty(globalThis,'navigator',{value:{connection:{saveData:false}},configurable:true});
 const preferences=new Map(scenario==='saved-static'?[['choomno-static-view','true']]:[]);
 globalThis.localStorage={getItem:key=>preferences.get(key)??null,setItem:(key,value)=>preferences.set(key,value)};
 const downloaded=[];
 globalThis.fetch=async url=>({ok:true,blob:async()=>{downloaded.push(url);return Object.assign(new Blob(['encoded video']),{source:url});}});
 URL.createObjectURL=blob=>'blob:'+blob.source;
 URL.revokeObjectURL=()=>{};
 globalThis.performance={now:()=>now};globalThis.matchMedia=()=>media;globalThis.getSelection=()=>({toString:()=>''});
 globalThis.requestAnimationFrame=fn=>{rafs.set(++nextId,fn);return nextId;};globalThis.cancelAnimationFrame=id=>rafs.delete(id);
 globalThis.setTimeout=(fn,ms)=>{timers.set(++nextId,{fn,at:now+ms});return nextId;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail;}};
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){}disconnect(){}};
 globalThis.getComputedStyle=node=>({width:String(node.copyWidth),height:String(node.offsetHeight)});
 const location=new URL('http://localhost/');globalThis.location=location;
 globalThis.history={state:null,scrollRestoration:'auto',replaceState(_,unused,url){location.href=new URL(url,location).href;},pushState(_,unused,url){location.href=new URL(url,location).href;}};
 function emit(target,type,props={}){
  const event={type,target:doc.body,defaultPrevented:false,cancelable:true,preventDefault(){this.defaultPrevented=true;},...props};
  target.dispatchEvent(event);return event;
 }
 win.scrollTo=(_,y)=>{globalThis.scrollY=scenario==='rounded-scroll'?Math.round(y):y;emit(win,'scroll');};
 doc.body=new Target('body');doc.documentElement={scrollHeight:3250,classList:new Classes()};doc.createElement=kind=>new Target(kind);doc.fonts={ready:Promise.resolve()};doc.hidden=false;
 const geometry=[[84,760],[848.5,801.5],[1650,800.25],[2450,800]];
 const sections=geometry.map((_,index)=>{
  const section=new Target('section');section.id=['','background','','elsewhere'][index];section.attributes['aria-labelledby']=['name','background-title','current-title','elsewhere-title'][index];section.section=section;
  Object.defineProperty(section,'offsetHeight',{get:()=>geometry[index][1]});
  section.getBoundingClientRect=()=>({top:geometry[index][0]-scrollY,height:geometry[index][1]});return section;
 });
 const copies=sections.map((section,index)=>{const copy=new Target('div');copy.section=section;copy.copyWidth=index===0?620:440;copy.offsetHeight=[302,306,286,180][index];return copy;});
 const ids=Object.fromEntries(sections.flatMap(section=>{
  const heading=new Target('h2');heading.section=section;
  return [[section.attributes['aria-labelledby'],heading],...(section.id?[[section.id,section]]:[])];
 }));
 const video=new Video(),still=new Target('img'),play=new Target('button'),year=new Target('span'),main=new Target('main');main.inert=false;
 const nodes={'#background-video':video,'#background-still':still,'#view-mode':play,'#copyright-year':year,main};
 doc.querySelector=selector=>nodes[selector];doc.querySelectorAll=selector=>selector==='main > section'?sections:copies;doc.getElementById=id=>ids[id];
 const errors=[];console.error=(...args)=>errors.push(args.join(' '));
 function advance(ms){
  const end=now+ms;
  while(now<end){
   now=Math.min(end,now+16);
   for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
   const queue=[...rafs.values()];rafs.clear();for(const fn of queue)fn(now);
  }
 }
 async function flush(){for(let i=0;i<40;i++)await Promise.resolve();}
 function visible(index){
  assert.equal(copies[index].style.visibility,'visible');assert.equal(copies[index].style.opacity,'1');assert.equal(copies[index].inert,false);
  assert.equal(copies[index].style.transform,`translate(${(innerWidth-copies[index].copyWidth)/2}px, ${(innerHeight-copies[index].offsetHeight)/2}px)`,'a reading station uses an exact centered 2D translation');
  copies.forEach((copy,i)=>{
   assert.equal(copy.style.willChange,'auto','stationary and hidden text releases its compositor hint');
   if(i!==index){assert.equal(copy.inert,true);assert.equal(copy.style.transform,'','hidden planes do not retain a perspective raster');}
  });
 }
 function expectedTransform(index,progress){
  const matrix=projectReadingPlaneWithDepth(readingPhase(progress),readingPhase(index),copies[index].copyWidth,copies[index].offsetHeight,innerWidth,innerHeight).matrix;
  return `matrix3d(${matrix.join(',')})`;
 }
 function endLeg(){const ended=video.onended;assert.ok(ended);ended();}
 await import('../app.js');await flush();advance(32);
 assert.deepEqual(errors,[],'application initialization should not throw');
 assert.equal(year.textContent,String(new Date().getFullYear()));
 const controls=doc.body.children.find(node=>node.className==='section-controls');assert.ok(controls,'navigation initializes independently of media playback');
 const previous=controls.children[0],next=controls.children[2];
 if(scenario==='short-viewport'){
  assert.equal(doc.documentElement.classList.contains('projected-text'),false);assert.equal(controls.hidden,true);
  copies.forEach(copy=>{assert.equal(copy.style.transform,'');assert.equal(copy.inert,false);});
  assert.equal(emit(win,'wheel',{deltaX:0,deltaY:80}).defaultPrevented,false);
  win.scrollTo(0,1650);assert.equal(still.src,'./media/station-2.webp','ordinary scrolling selects the nearest station poster');
  assert.equal(video.playCalls,0,'document flow never begins an animated transition');
 }else{
  assert.equal(doc.documentElement.classList.contains('projected-text'),true);visible(0);
  assert.equal(still.src,'./media/station-0.webp');
  if(scenario==='media-clock'){
   const initial=copies[0].style.transform;emit(next,'click');await flush();
   assert.match(video.src,/transition-0-forward\.mp4\?v=final-flight-13$/);assert.equal(video.hidden,true,'a station poster remains until the first presented frame');
   assert.ok(video.src.startsWith('blob:'),'the application plays a complete downloaded file');
   assert.ok(downloaded.includes('./media/transition-0-forward.mp4?v=final-flight-13'));
   advance(1000);assert.equal(copies[0].style.transform,initial,'elapsed wall time cannot move text before decoded frames');
   video.present(.4);assert.equal(video.hidden,false);
   assert.equal(copies[0].style.transform,initial,'a new video target does not jump the text in the same callback');
   advance(32);assert.notEqual(copies[0].style.transform,initial,'display frames smoothly move text toward its video target');
   assert.notEqual(copies[0].style.transform,expectedTransform(0,transitionProgress(400,0)),'the damped attachment initially trails a discontinuous target');
   assert.match(copies[0].style.transform,/^matrix3d\(/,'moving text retains the full projective plane');
   assert.equal(copies[0].style.willChange,'transform, opacity');
   copies.filter(copy=>copy.style.visibility==='hidden').forEach(copy=>assert.equal(copy.style.willChange,'auto'));
   advance(2000);assert.equal(copies[0].style.transform,expectedTransform(0,transitionProgress(1000*(.4+1/videoFramesPerSecond),0)),'a stalled video permits at most one frame of text interpolation');
   const frameTransform=copies[0].style.transform;advance(1000);assert.equal(copies[0].style.transform,frameTransform,'bounded interpolation stops without another presented frame');
   video.present(7.95);endLeg();visible(1);assert.equal(still.src,'./media/station-1.webp');assert.equal(video.hidden,true);
   emit(previous,'click');await flush();assert.match(video.src,/transition-0-reverse\.mp4\?v=final-flight-13$/);
   const reverseStart=copies[1].style.transform;video.present(.4);assert.equal(copies[1].style.transform,reverseStart);
   advance(2000);assert.equal(copies[1].style.transform,expectedTransform(1,1-transitionProgress(1000*(.4+1/videoFramesPerSecond),0)),'reverse text settles onto the bounded reverse media target');
   endLeg();visible(0);
   for(let leg=0;leg<3;leg++){
    emit(win,'keydown',{key:'ArrowRight'});await flush();
    assert.match(video.src,new RegExp(`transition-${leg}-forward\\.mp4\\?v=final-flight-13$`));
    assert.equal(next.disabled,true,'arrow navigation locks controls during each transition');
    video.present(.4);
    if(leg===1){
     video.present(6);advance(2000);
     assert.ok(copies.every(copy=>copy.style.visibility==='hidden'),'gallery flight cannot reveal text projected along the previous camera route');
     video.present(10.8);advance(2000);
     assert.equal(copies[2].style.transform,expectedTransform(2,1+transitionProgress(1000*(10.8+1/videoFramesPerSecond),1)),'twelve-second gallery uses its native late arrival mount');
    }
    endLeg();await flush();visible(leg+1);
    assert.equal(next.disabled,leg===2,'each exact station releases navigation unless it is the final section');
   }
   assert.equal(previous.disabled,false,'the final exact station releases the transition lock');
  }else if(scenario==='autoplay-rejection'){
   emit(next,'click');await flush();visible(1);
   assert.equal(still.src,'./media/station-1.webp');assert.equal(video.hidden,true);assert.equal(video.paused,true);
   assert.equal(next.disabled,false,'autoplay denial cannot strand navigation in a busy state');
   emit(next,'click');await flush();visible(2);
  }else if(scenario==='media-failure'){
   emit(next,'click');await flush();video.onerror();await flush();assert.match(video.src,/transition-0-forward\.mp4\?v=final-flight-13$/,'an AV1 decode error tries the supported H.264 format');
   video.onerror();visible(1);assert.equal(video.hidden,true);assert.equal(next.disabled,false);
   assert.equal(still.src,'./media/station-1.webp','both codec failures retain the requested text and station still');
   emit(next,'click');await flush();video.present(4);advance(300);
   assert.ok(copies.every(copy=>copy.style.opacity!=='1'),'the bridge is between its stationary reading poses');
   video.onerror();await flush();advance(1000);visible(1);
   assert.equal(still.src,'./media/station-1.webp','a codec retry restores both the source poster and its readable text while loading');
   video.present(4);advance(12016);visible(2);
   assert.equal(still.src,'./media/station-2.webp','a prolonged network/decoder stall also completes with a still');
  }else if(scenario==='paused'||scenario==='saved-static'||scenario==='reduced-motion'){
   if(scenario==='reduced-motion'||scenario==='saved-static')assert.deepEqual(downloaded,[],'a static initial preference does not eagerly fetch background clips');
   if(scenario==='paused')emit(play,'click');
   assert.equal(play.textContent,'Animated view');assert.equal(play.getAttribute('aria-pressed'),'true');
   assert.equal(play.disabled,scenario==='reduced-motion');
   if(scenario!=='reduced-motion')assert.equal(preferences.get('choomno-static-view'),'true');
   emit(next,'click');visible(1);
   assert.equal(video.playCalls,0);assert.equal(still.src,'./media/station-1.webp','static navigation shows the selected section background');
   if(scenario==='saved-static'){
    emit(next,'click');visible(2);emit(next,'click');visible(3);
    const reset=new Target('a');reset.href='http://localhost/#name';reset.attributes.href='#name';reset.attributes['data-rewind']='';
    emit(doc,'click',{target:reset,button:0});advance(16);visible(0);
    assert.equal(video.playCalls,0);assert.equal(main.inert,false);assert.equal(doc.documentElement.classList.contains('reset-flight'),false,'static return never starts or hides text for a movie');
    emit(next,'click');visible(1);
   }
   if(scenario!=='reduced-motion')emit(play,'click');else{media.matches=false;emit(media,'change');}
   assert.equal(play.textContent,'Static view');assert.equal(play.getAttribute('aria-pressed'),'false');
   assert.equal(still.src,'./media/station-1.webp','resuming aligns the background with the currently selected text');
   emit(next,'click');await flush();video.present(4);emit(play,'click');visible(2);
   const frozenFrame=copies[2].style.transform,playCount=video.playCalls;
   advance(transitionDuration);assert.equal(video.playCalls,playCount);assert.equal(copies[2].style.transform,frozenFrame);
   assert.equal(next.disabled,false,'pausing mid-transition releases navigation at its selected station');
  }else if(scenario==='rounded-scroll'){
   const initial=copies[0].style.transform,transforms=[];emit(next,'click');await flush();
   const end=Math.floor(textSlideDuration/3/16)*16;
   for(let time=16;time<=end;time+=16){
    advance(16);
    video.present(time/1000);assert.equal(scrollY,0,'departure starts within one native scroll pixel');
    transforms.push(copies[0].style.transform);
   }
   assert.ok(new Set(transforms).size>=20,'decoded frames continuously move text despite quantized native scrolling');
   const presented=transforms.at(-1);assert.notEqual(presented,initial);
   advance(1000);const exact=copies[0].style.transform;emit(win,'scroll');assert.equal(copies[0].style.transform,exact,'delayed native scroll cannot replace bounded media progress');
   doc.hidden=true;emit(doc,'visibilitychange');assert.equal(video.paused,true);
   advance(14000);assert.equal(copies[0].style.transform,exact,'hidden tabs suspend the stall watchdog and retain the same frame');
   doc.hidden=false;emit(doc,'visibilitychange');assert.equal(video.paused,false);assert.equal(copies[0].style.transform,exact);
   video.present(.6);assert.equal(copies[0].style.transform,exact,'resuming a media target does not jump the damped text');advance(32);assert.notEqual(copies[0].style.transform,exact);endLeg();visible(1);
   assert.equal(scrollY,849,'the exact text stop survives a fractional anchor rounded by native scrolling');
  }else if(scenario==='rewind-cancel'){
   emit(next,'click');await flush();video.present(.4);
   const lateFrame=[...video.frames.values()][0],lateEnded=video.onended;
   emit(win,'resize');advance(32);visible(1);
   assert.equal(video.paused,true);assert.equal(still.src,'./media/station-1.webp');
   const settled=copies[1].style.transform;
   lateFrame(now,{mediaTime:2});lateEnded();assert.equal(copies[1].style.transform,settled,'callbacks canceled by resize cannot revive an earlier transition');
   const rewind=new Target('a');rewind.href='http://localhost/#name';rewind.attributes.href='#name';rewind.attributes['data-rewind']='';
   for(let destination=2;destination<=3;destination++){emit(next,'click');await flush();video.present(7.9);endLeg();visible(destination);}
   const before=video.playCalls;emit(doc,'click',{target:rewind,button:0});await flush();
   assert.equal(video.playCalls,before+1);assert.match(video.src,/rewind\.mp4\?v=return-left-1$/);
   assert.equal(doc.documentElement.classList.contains('reset-flight'),true);assert.equal(main.inert,true,'return flight hides and disables every slide plane');
   for(const seconds of [.4,4,8,12,18,21.9,22.3]){
    video.present(seconds);advance(32);
    assert.equal(doc.documentElement.classList.contains('reset-flight'),true,'intermediate logical section coordinates never reveal earlier slide text');
    assert.equal(main.inert,true);assert.equal(next.disabled,true,'return flight holds the navigation lock');
    copies.slice(1).forEach(copy=>assert.equal(copy.style.visibility,'hidden','intermediate text never appears during the return'));
    if(seconds<=18)assert.equal(copies[0].style.visibility,'hidden','opening text waits for its actual final approach');
    if(seconds===21.9){
     advance(200); // Let the suspension follow this deliberately sparse frame sample.
     assert.equal(copies[0].style.visibility,'visible','the name slides in before the movie ends');
     assert.match(copies[0].style.transform,/^matrix3d\(/,'arrival uses the camera projection instead of appearing centered');
     advance(500);const stalled=copies[0].style.transform;
     assert.notEqual(copies[0].style.transform,'','a stalled arrival retains its projected text');
     advance(500);assert.equal(copies[0].style.transform,stalled,'a stalled movie cannot advance the name toward its destination');
    }
   }
   endLeg();advance(16);visible(0);assert.equal(still.src,'./media/station-0.webp');assert.equal(doc.activeElement,ids.name);
   assert.equal(doc.documentElement.classList.contains('reset-flight'),false);assert.equal(main.inert,false,'arrival reveals only the exact opening text');
   for(let destination=1;destination<=3;destination++){emit(next,'click');await flush();video.present(7.9);endLeg();visible(destination);}
   emit(doc,'click',{target:rewind,button:0});await flush();video.present(.8);
   const canceledReturn=[...video.frames.values()][0],canceledReturnEnd=video.onended;
   emit(win,'resize');advance(32);visible(0);assert.equal(doc.documentElement.classList.contains('reset-flight'),false);assert.equal(main.inert,false,'canceling a return flight cannot strand hidden text');
   canceledReturn(now,{mediaTime:5});canceledReturnEnd();assert.equal(doc.documentElement.classList.contains('reset-flight'),false);visible(0);
   for(let destination=1;destination<=3;destination++){emit(next,'click');await flush();video.present(7.9);endLeg();visible(destination);}
   emit(doc,'click',{target:rewind,button:0});await flush();assert.equal(main.inert,true);video.onerror();advance(16);
   visible(0);assert.equal(doc.documentElement.classList.contains('reset-flight'),false);assert.equal(main.inert,false,'a failed return movie reveals its opening poster and text');
   emit(next,'click');await flush();video.present(.4);
   const currentSource=video.src;location.hash='#elsewhere';emit(win,'hashchange');
   assert.equal(video.src,currentSource);assert.equal(video.paused,false,'URL hashes no longer interrupt local slide navigation');
   endLeg();visible(1);assert.equal(still.src,'./media/station-1.webp');
  }
 }
 // Rotation into a short viewport restores readable ordinary document flow.
 globalThis.innerHeight=390;emit(win,'resize');advance(32);
 assert.equal(doc.documentElement.classList.contains('projected-text'),false);assert.equal(controls.hidden,true);
 copies.forEach(copy=>{assert.equal(copy.style.transform,'');assert.equal(copy.style.visibility,'');assert.equal(copy.style.willChange,'');assert.equal(copy.inert,false);});
 assert.equal(emit(win,'wheel',{deltaX:0,deltaY:80}).defaultPrevented,false,'short viewports retain ordinary scrolling');
 globalThis.innerHeight=800;emit(win,'resize');advance(32);
 assert.equal(doc.documentElement.classList.contains('projected-text'),true);assert.equal(controls.hidden,false);
 globalThis.innerWidth=390;globalThis.innerHeight=844;
 copies.forEach((copy,index)=>{copy.copyWidth=Math.min(index===0?620:360,innerWidth*.88);});
 emit(win,'resize');advance(32);
 const centered=copies.findIndex(copy=>copy.style.opacity==='1');assert.ok(centered>=0,'mobile resize retains a readable station');visible(centered);
 assert.deepEqual(errors,[]);
}
