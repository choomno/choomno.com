// A gesture selects one reading pose; its momentum cannot select a second pose.
import {transitionDuration,transitionDurationForLeg,transitionProgress} from './transition-timing.js?v=final-flight-11';
export {transitionDuration} from './transition-timing.js?v=final-flight-11';
const interactive='a,button,input,select,textarea,summary,details,[contenteditable="true"]';
const editable='input,select,textarea,[contenteditable="true"]';
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

export class WheelIntent {
 constructor(){this.last=-Infinity;this.total=0;this.consumed=false;}
 push(delta,time,blocked=false){
  if(time-this.last>240){this.total=0;this.consumed=false;}
  this.last=time;
  if(blocked){this.total=0;this.consumed=true;return 0;}
  if(this.consumed||!delta)return 0;
  if(Math.sign(delta)!==Math.sign(this.total))this.total=0;
  this.total+=delta;
  if(Math.abs(this.total)<40)return 0;
  this.consumed=true;
  return Math.sign(this.total);
 }
}

export function initSectionNavigation({isEnabled=()=>true,onChange=()=>{},onProgress=()=>{},animateTransition=null}={}){
 const sections=[...document.querySelectorAll('main > section')];
 if(!sections.length)return null;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),wheel=new WheelIntent();
 const listeners=[];
 let active=0,progress=0,moving=false,animation=0,resizeFrame=0,touch=null,multiTouch=false,ignoreClickUntil=0,pointerFocusUntil=0,destroyed=false;
 let transitionId=0,cancelTransition=null;
 const oldRestoration=history.scrollRestoration;
 history.scrollRestoration='manual';
 const position=i=>{
  if(i===0)return 0;
  const rect=sections[i].getBoundingClientRect();
  return clamp(scrollY+rect.top+(rect.height-innerHeight)/2,0,Math.max(0,document.documentElement.scrollHeight-innerHeight));
 };
 const sectionForHash=hash=>{
  if(!hash||hash==='#')return 0;
  let id;try{id=decodeURIComponent(hash.slice(1));}catch{return -1;}
  const section=document.getElementById(id)?.closest('main > section');
  return sections.indexOf(section);
 };
 // Slide selection is local UI state; old slide URLs reopen at the beginning.
 if(location.hash)history.replaceState(history.state,'',location.pathname+location.search);
 const controls=document.createElement('nav');controls.className='section-controls';controls.setAttribute('aria-label','Section navigation');
 const previous=document.createElement('button');previous.type='button';previous.textContent='←';previous.setAttribute('aria-label','Previous section');
 const counter=document.createElement('span');counter.className='section-counter';counter.setAttribute('aria-live','polite');counter.setAttribute('aria-atomic','true');
 const next=document.createElement('button');next.type='button';next.textContent='→';next.setAttribute('aria-label','Next section');
 controls.append(previous,counter,next);document.body.append(controls);
 function updateControls(){
  controls.hidden=!isEnabled();previous.disabled=active===0||moving;next.disabled=active===sections.length-1||moving;
  counter.textContent=`${active+1} / ${sections.length}`;
  counter.setAttribute('aria-label',`Section ${active+1} of ${sections.length}`);
 }
 function stop(){
  ++transitionId;cancelAnimationFrame(animation);animation=0;moving=false;
  const cancel=cancelTransition;cancelTransition=null;cancel?.();
 }
 function goTo(index,{immediate=false,interrupt=false,focusTarget=null,reset=false}={}){
  if(destroyed||!isEnabled()||(moving&&!interrupt))return false;
  const startIndex=active;
  stop();active=clamp(index,0,sections.length-1);
  const start=scrollY,end=position(active),legDuration=immediate||reduced.matches?0:transitionDuration;
  const direction=Math.sign(end-start);
  // Each camera leg meets its neighbors with zero velocity and acceleration.
  // A long jump must therefore ease separately through every reading anchor.
  // Browser scrolling can round a fractional anchor to a device pixel.
  // These document anchors are fixed for this transition. Measuring them on
  // every media/text refresh forces layout after the previous transform writes.
  const positions=sections.map((_,i)=>position(i));
  const anchors=positions.filter(y=>direction*(y-start)>.75&&direction*(end-y)>.75).sort((a,b)=>direction*(a-b));
  const stops=[start,...anchors,end];
  const indices=stops.map((y,i)=>i===0?startIndex:positions.reduce((best,p,j)=>Math.abs(p-y)<Math.abs(positions[best]-y)?j:best,active));
  const durations=indices.slice(1).map((index,i)=>legDuration?transitionDurationForLeg(Math.min(indices[i],index)):0);
  const ends=durations.reduce((out,value)=>[...out,(out.at(-1)??0)+value],[]);
  const duration=ends.at(-1)??0;
  const report=value=>{progress=value;onProgress(value);};
  // Let text projection make the destination plane interactive before focusing.
  const focusDestination=()=>{if(focusTarget)requestAnimationFrame(()=>{if(!destroyed&&!moving&&active===index)focusTarget.focus({preventScroll:true});});};
  onChange(active);document.dispatchEvent(new CustomEvent('sectionchange',{detail:{index:active}}));
  if(!duration||startIndex===active||Math.abs(end-start)<.75){window.scrollTo(0,end);report(active);updateControls();focusDestination();return true;}
  moving=true;updateControls();
  if(animateTransition){
   const id=transitionId;
   const current=()=>!destroyed&&moving&&id===transitionId;
   const cancel=animateTransition({from:startIndex,to:active,reset:reset&&startIndex===sections.length-1&&active===0,onProgress(value){
    if(!current()||!Number.isFinite(value))return;
    if(!isEnabled()){stop();updateControls();return;}
    const p=clamp(value,Math.min(startIndex,active),Math.max(startIndex,active));
    const low=Math.floor(p),high=Math.ceil(p);
    // The media clock supplies an unrounded logical position. Native scroll
    // follows it, while text and camera projection use the original value.
    window.scrollTo(0,positions[low]+(positions[high]-positions[low])*(p-low));report(p);
   },onComplete(){
    if(!current())return;
    if(!isEnabled()){stop();updateControls();return;}
    ++transitionId;cancelTransition=null;moving=false;
    window.scrollTo(0,position(active));report(active);updateControls();focusDestination();
   }});
   // A failed or unavailable media player may complete synchronously.
   if(current())cancelTransition=typeof cancel==='function'?cancel:null;
   else if(typeof cancel==='function')cancel();
   return true;
  }
  const began=performance.now();
  function step(now){
   if(destroyed||!isEnabled()){stop();updateControls();return;}
   const elapsed=Math.min(duration,now-began),leg=Math.min(stops.length-2,Math.max(0,ends.findIndex(end=>elapsed<=end)));
   const routeLeg=Math.min(indices[leg],indices[leg+1]);
   const fraction=transitionProgress(elapsed-(ends[leg-1]??0),routeLeg);
   window.scrollTo(0,stops[leg]+(stops[leg+1]-stops[leg])*fraction);
   // Native scroll coordinates are rounded. Preserve the unrounded logical
   // position for the camera and text, whose nearby parallax is much larger.
   report(indices[leg]+(indices[leg+1]-indices[leg])*fraction);
   if(elapsed<duration)animation=requestAnimationFrame(step);
   else{moving=false;animation=0;updateControls();focusDestination();}
  }
  animation=requestAnimationFrame(step);return true;
 }
 function refresh(){
  if(destroyed)return;
  stop();
  if(isEnabled())goTo(active,{immediate:true});
  else updateControls();
 }
 const on=(target,type,handler,options)=>{target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));};
 on(previous,'click',()=>goTo(active-1));on(next,'click',()=>goTo(active+1));
 on(window,'wheel',event=>{
  if(!isEnabled()||event.ctrlKey||event.target.closest(editable))return;
  event.preventDefault();
  if(Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
  const direction=wheel.push(event.deltaY*unit,performance.now(),moving);
  if(direction)goTo(active+direction);
 },{passive:false});
 on(window,'touchstart',event=>{
  if(!isEnabled())return;
  if(event.touches.length!==1){multiTouch=true;touch=null;return;}
  if(multiTouch)return;
  const point=event.touches[0];
  // Swipes may start over links or controls; their ordinary taps still work.
  touch=event.target.closest(editable)?null:{x:point.clientX,y:point.clientY};
 },{passive:true});
 on(window,'touchmove',event=>{
  if(event.touches.length!==1){multiTouch=true;touch=null;return;}
  if(isEnabled()&&touch&&!multiTouch&&event.cancelable)event.preventDefault();
 },{passive:false});
 on(window,'touchend',event=>{
  if(multiTouch){if(!event.touches.length)multiTouch=false;touch=null;ignoreClickUntil=performance.now()+450;return;}
  const origin=touch;touch=null;
  if(!isEnabled()||!origin||!event.changedTouches.length)return;
  const point=event.changedTouches[0],dx=origin.x-point.clientX,dy=origin.y-point.clientY;
  if(Math.max(Math.abs(dx),Math.abs(dy))>35){
   if(event.cancelable)event.preventDefault();
   ignoreClickUntil=performance.now()+450;
   goTo(active+Math.sign(Math.abs(dy)>=Math.abs(dx)?dy:dx));
  }else if(!event.target.closest(interactive)&&!getSelection()?.toString()){
   // Touch taps retain mobile navigation; ordinary mouse clicks do not.
   ignoreClickUntil=performance.now()+450;
   goTo(active+1);
  }
 },{passive:false});
 on(window,'touchcancel',()=>{touch=null;multiTouch=false;ignoreClickUntil=performance.now()+450;});
 on(document,'pointerdown',()=>{pointerFocusUntil=performance.now()+500;},{passive:true});
 on(document,'click',event=>{
  if(!isEnabled()||performance.now()<ignoreClickUntil||event.defaultPrevented||event.button!==0||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  const link=event.target.closest('a[href]');
  if(link){
   const url=new URL(link.href,location.href);
   if(url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search&&(url.hash||link.getAttribute('href')==='#')){
    const index=sectionForHash(url.hash);
    if(index>=0){event.preventDefault();if(!moving){goTo(index,{reset:link.getAttribute('data-rewind')!==null,focusTarget:url.hash==='#name'?document.getElementById('name'):null});}}
   }
   return;
  }
 });
 on(window,'keydown',event=>{
  pointerFocusUntil=0;
  if(!isEnabled()||event.defaultPrevented||event.target.closest('button,input,select,textarea,summary,[contenteditable="true"]')||event.altKey||event.ctrlKey||event.metaKey)return;
  const direction={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[event.key];
  // These native scrolling keys must not move the document behind the camera.
  if([' ','PageDown','PageUp','Home','End'].includes(event.key)){event.preventDefault();return;}
  if(!direction||event.shiftKey)return;
  event.preventDefault();if(event.repeat)return;
  goTo(active+direction);
 });
 on(document,'focusin',event=>{
  if(!isEnabled()||performance.now()<pointerFocusUntil)return;
  const section=event.target.closest('main > section');
  const index=section?sections.indexOf(section):event.target.closest('header')?0:event.target.closest('footer')?sections.length-1:-1;
  if(index>=0&&index!==active)goTo(index,{immediate:true,interrupt:true});
 });
 on(window,'resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(refresh);});
 on(reduced,'change',refresh);
 refresh();
 return {goTo,refresh,get active(){return active;},get progress(){return progress;},destroy(){destroyed=true;stop();cancelAnimationFrame(resizeFrame);listeners.forEach(remove=>remove());controls.remove();history.scrollRestoration=oldRestoration;}};
}
