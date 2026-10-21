import assert from 'node:assert/strict';
import {WheelIntent,initSectionNavigation,transitionDuration} from '../section-navigation.js';

assert.equal(transitionDuration,8000,'each transition reserves time for both text sidesteps');

// Trackpad deltas accumulate, while all momentum in one gesture is consumed.
const intent=new WheelIntent();
for(let i=0;i<19;i++)assert.equal(intent.push(2,i*10),0);
assert.equal(intent.push(2,190),1);
for(let time=200;time<1800;time+=100)assert.equal(intent.push(100,time,time<1200),0);
assert.equal(intent.push(-40,2100),-1);
const reversing=new WheelIntent();
assert.equal(reversing.push(30,0),0);assert.equal(reversing.push(-30,20),0);assert.equal(reversing.push(-10,40),-1);

// A small browser fixture exercises the public initializer and actual handlers.
let now=0,rafId=0,rafs=new Map();
class Target {
 constructor(kind=''){this.kind=kind;this.listeners=new Map();this.attributes={};this.children=[];}
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
const win=new Target(),doc=new Target(),media=new Target();media.matches=false;
globalThis.window=win;globalThis.document=doc;globalThis.innerHeight=800;globalThis.scrollY=1650;
globalThis.performance={now:()=>now};globalThis.matchMedia=()=>media;globalThis.getSelection=()=>({toString:()=>''});
globalThis.requestAnimationFrame=fn=>{rafs.set(++rafId,fn);return rafId;};globalThis.cancelAnimationFrame=id=>rafs.delete(id);
globalThis.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail;}};
const location=new URL('http://localhost/?preview=1#current-title');globalThis.location=location;
const historyChanges=[];
globalThis.history={state:null,scrollRestoration:'auto',replaceState(_,unused,url){historyChanges.push(['replace',url]);location.href=new URL(url,location).href;},pushState(_,unused,url){historyChanges.push(['push',url]);location.href=new URL(url,location).href;}};
win.scrollTo=(_,y)=>{globalThis.scrollY=y;};
doc.body=new Target('body');doc.documentElement={scrollHeight:3250};doc.createElement=kind=>new Target(kind);
const geometry=[[84,760],[848.5,801.5],[1650,800.25],[2450,800]];
const sections=geometry.map(([top,height],index)=>{
 const section=new Target('section');section.id=['','background','','elsewhere'][index];section.attributes['aria-labelledby']=['name','background-title','current-title','elsewhere-title'][index];
 section.getBoundingClientRect=()=>({top:geometry[index][0]-scrollY,height:geometry[index][1]});return section;
});
const ids=Object.fromEntries(sections.flatMap(section=>{
 const heading=new Target('h2');heading.section=section;section.section=section;
 return [[section.attributes['aria-labelledby'],heading],...(section.id?[[section.id,section]]:[])];
}));
doc.querySelectorAll=()=>sections;doc.getElementById=id=>ids[id];
function emit(target,type,props={}){
 const event={type,target:doc.body,defaultPrevented:false,cancelable:true,preventDefault(){this.defaultPrevented=true;},...props};
 target.dispatchEvent(event);return event;
}
function advance(ms){const end=now+ms;while(now<end){now=Math.min(end,now+16);const queue=[...rafs.values()];rafs.clear();for(const fn of queue)fn(now);}}
let enabled=true;
const nav=initSectionNavigation({isEnabled:()=>enabled});
assert.equal(nav.active,0,'an old heading hash opens at the first section');
assert.equal(scrollY,0,'restored scroll position cannot select a later slide');
assert.equal(location.href,'http://localhost/?preview=1','initial hash removal preserves path and query');
assert.deepEqual(historyChanges,[['replace','/?preview=1']]);
nav.goTo(2,{immediate:true});assert.equal(scrollY,1650.125,'fractional section heights retain precise center positions');
nav.goTo(0,{immediate:true});assert.equal(scrollY,0,'opening pose leaves header visible');
nav.goTo(1);assert.equal(nav.goTo(2),false,'transitions cannot be interrupted by another gesture');
advance(transitionDuration/2);assert.ok(Math.abs(scrollY-849.25/2)<1e-9,'the longer transition is only halfway through at 4 seconds');
advance(transitionDuration/2);assert.equal(scrollY,849.25);
assert.equal(emit(win,'keydown',{key:'ArrowDown',repeat:true}).defaultPrevented,true);assert.equal(nav.active,1);
const link=new Target('a');
for(const key of [' ','PageDown','PageUp','Home','End']){
 assert.equal(emit(win,'keydown',{key,target:link}).defaultPrevented,true,'native scrolling shortcuts are suppressed');
 assert.equal(nav.active,1,`${key} must not change the section`);
}
assert.equal(emit(win,'keydown',{key:'Enter',target:link}).defaultPrevented,false,'links retain keyboard activation');
const button=new Target('button');
assert.equal(emit(win,'keydown',{key:' ',target:button}).defaultPrevented,false,'explicit controls retain Space activation');
assert.equal(emit(win,'keydown',{key:'Tab'}).defaultPrevented,false,'Tab retains accessible focus navigation');
for(const [key,index] of [['ArrowDown',2],['ArrowUp',1],['ArrowRight',2],['ArrowLeft',1]]){
 emit(win,'keydown',{key,target:link});assert.equal(nav.active,index,`${key} selects the adjacent section`);advance(12000);
}
emit(doc,'click',{button:0});assert.equal(nav.active,1,'a blank-page mouse click does not advance');
emit(doc,'click',{button:0,pointerType:'pen'});assert.equal(nav.active,1,'non-touch pointer clicks do not advance');
emit(win,'wheel',{deltaY:100,deltaX:0});assert.equal(nav.active,2,'wheel navigation remains available');advance(12000);
const input=new Target('input');assert.equal(emit(win,'keydown',{key:'Home',target:input}).defaultPrevented,false);assert.equal(nav.active,2);
assert.equal(emit(win,'wheel',{deltaY:100,deltaX:0,ctrlKey:true}).defaultPrevented,false,'pinch/zoom is not intercepted');
assert.equal(emit(win,'wheel',{deltaY:40,deltaX:100}).defaultPrevented,true,'diagonal wheel motion cannot scroll the document out of sync');
assert.equal(nav.active,2,'predominantly horizontal wheel motion does not select a section');
geometry[1][0]+=.25;nav.goTo(1,{immediate:true});globalThis.scrollY=849;nav.goTo(2);advance(12000);
assert.equal(scrollY,1650.125,'pixel rounding at a settled anchor must not create an extra near-stationary leg');
geometry[1][0]-=.25;
// Multi-section requests visit every anchor, easing to rest before changing route legs.
nav.goTo(0,{immediate:true});nav.goTo(3);assert.equal(nav.active,3);
advance(transitionDuration-10);const before10=scrollY;
advance(5);const before5=scrollY;
advance(5);const firstStop=scrollY;assert.equal(firstStop,849.25,'A multi-section jump pauses precisely at the first intermediate anchor');
assert.equal(nav.goTo(0),false,'a multi-leg transition remains atomic between legs');
advance(5);const after5=scrollY;
advance(5);const after10=scrollY;
assert.ok(Math.abs(firstStop-before5)/5<.001&&Math.abs(after5-firstStop)/5<.001,'speed vanishes on both sides of an intermediate anchor');
assert.ok(Math.abs(firstStop-2*before5+before10)/25<.0002&&Math.abs(after10-2*after5+firstStop)/25<.0002,'acceleration vanishes before and after changing route legs');
assert.ok(before10<before5&&before5<firstStop&&firstStop<after5&&after5<after10,'there is no overshoot or reversal at the stop');
advance(12000-10);assert.equal(scrollY,1650.125,'A multi-section jump reaches the next anchor after another full leg');
advance(transitionDuration);assert.equal(scrollY,2450,'A multi-section jump completes only after all three legs');
nav.goTo(0);
for(const [y,ms] of [[1650.125,8000],[849.25,12000],[0,8000]]){advance(ms);assert.equal(scrollY,y,'A reverse multi-section jump traverses the same anchors in reverse');}
const distantLink=new Target('a');distantLink.href='http://localhost/?preview=1#elsewhere';distantLink.attributes.href='#elsewhere';
assert.equal(emit(doc,'click',{target:distantLink,button:0}).defaultPrevented,true);
for(const [y,ms] of [[849.25,8000],[1650.125,12000],[2450,8000]]){advance(ms);assert.equal(scrollY,y,'an internal link traverses consecutive legs');}
const homeLink=new Target('a');homeLink.href='http://localhost/?preview=1#name';homeLink.attributes.href='#name';
emit(doc,'pointerdown',{target:homeLink});emit(doc,'focusin',{target:new Target('header')});
assert.equal(nav.active,3,'pointer focus must not bypass a link transition');
emit(doc,'click',{target:homeLink,button:0});
for(const [y,ms] of [[1650.125,8000],[849.25,12000],[0,8000]]){advance(ms);assert.equal(scrollY,y,'the header home link traverses every reverse leg');}
advance(16);
assert.equal(doc.activeElement,ids.name,'rewinding to the first slide transfers keyboard focus to the name');
assert.equal(ids.name.focusOptions.preventScroll,true,'focus does not disturb the calibrated camera stop');
nav.goTo(3,{immediate:true});
const rewind=new Target('a');rewind.href=homeLink.href;rewind.attributes.href='#name';rewind.attributes['data-rewind']='';
doc.activeElement=rewind;
emit(doc,'click',{target:rewind,button:0});
assert.equal(nav.active,0,'Rewind selects the opening slide');
assert.equal(scrollY,2450,'Rewind starts at the current camera position');
advance(28000);assert.equal(scrollY,0,'navigation without a media driver traverses the route');
assert.equal(nav.progress,0,'Rewind restores the calibrated camera pose');
advance(16);
assert.equal(doc.activeElement,ids.name,'Rewind restores keyboard focus to the name');
nav.goTo(2,{immediate:true});

// Actual touch taps advance, without a synthetic click advancing a second time.
emit(win,'touchstart',{touches:[{clientX:100,clientY:100}]});
emit(win,'touchend',{touches:[],changedTouches:[{clientX:100,clientY:100}]});
assert.equal(nav.active,3,'a blank-page touch tap still advances');advance(transitionDuration);
nav.goTo(2,{immediate:true});emit(doc,'click',{button:0});assert.equal(nav.active,2,'a delayed synthetic click cannot advance');

// Starting a swipe over a link must not escape into native document scrolling.
const externalLink=new Target('a');externalLink.href='https://example.com/';externalLink.attributes.href=externalLink.href;
emit(win,'touchstart',{target:externalLink,touches:[{clientX:100,clientY:100}]});
assert.equal(emit(win,'touchmove',{target:externalLink,touches:[{clientX:100,clientY:10}]}).defaultPrevented,true);
emit(win,'touchend',{target:externalLink,touches:[],changedTouches:[{clientX:100,clientY:10}]});
assert.equal(nav.active,3,'a swipe starting over a link advances one section');advance(transitionDuration);
emit(win,'touchstart',{target:externalLink,touches:[{clientX:100,clientY:100}]});
emit(win,'touchend',{target:externalLink,touches:[],changedTouches:[{clientX:100,clientY:100}]});
assert.equal(emit(doc,'click',{target:externalLink,button:0}).defaultPrevented,false,'an ordinary link tap retains its normal action');
emit(win,'touchstart',{target:input,touches:[{clientX:100,clientY:100}]});
assert.equal(emit(win,'touchmove',{target:input,touches:[{clientX:100,clientY:10}]}).defaultPrevented,false,'editable controls retain native touch behavior');
emit(win,'touchcancel');nav.goTo(2,{immediate:true});

// A second finger invalidates the first-finger swipe through all touchend events.
emit(win,'touchstart',{touches:[{clientX:100,clientY:100}]});
emit(win,'touchstart',{touches:[{clientX:100,clientY:100},{clientX:150,clientY:100}]});
emit(win,'touchend',{touches:[{clientX:100,clientY:10}],changedTouches:[{clientX:150,clientY:10}]});
emit(win,'touchend',{touches:[],changedTouches:[{clientX:100,clientY:10}]});assert.equal(nav.active,2);
emit(win,'touchstart',{touches:[{clientX:100,clientY:100}]});emit(win,'touchcancel');
emit(win,'touchend',{touches:[],changedTouches:[{clientX:100,clientY:10}]});assert.equal(nav.active,2);
emit(win,'hashchange');emit(win,'popstate');assert.equal(nav.active,2,'browser history events do not select slides');
assert.deepEqual(historyChanges,[['replace','/?preview=1']],'slide gestures and internal links never alter history');
assert.equal(location.href,'http://localhost/?preview=1','slide selection leaves the URL unchanged');
nav.goTo(1,{immediate:true});
geometry[1][0]=880;emit(win,'resize');advance(16);assert.equal(scrollY,880.75,'resize reanchors the current section');
emit(doc,'focusin',{target:new Target('footer')});assert.equal(nav.active,3,'footer focus synchronizes the selected section');
emit(doc,'focusin',{target:new Target('header')});assert.equal(nav.active,0,'header focus restores the opening section');
enabled=false;nav.refresh();assert.equal(emit(win,'wheel',{deltaY:100,deltaX:0}).defaultPrevented,false,'static fallback keeps ordinary scrolling');
assert.equal(doc.body.children[0].hidden,true);
enabled=true;nav.refresh();media.matches=true;emit(media,'change');nav.goTo(3);assert.equal(scrollY,2450,'reduced-motion navigation is immediate');
nav.destroy();assert.equal(history.scrollRestoration,'auto');

// An external media clock owns progress completely, including multi-leg jumps.
media.matches=false;location.hash='#elsewhere';globalThis.scrollY=2450;
const requests=[],reported=[];
const mediaNav=initSectionNavigation({isEnabled:()=>enabled,onProgress:value=>reported.push(value),animateTransition(callbacks){
 const request={...callbacks,cancellations:0};requests.push(request);
 return ()=>{
  ++request.cancellations;
  // Even callbacks dispatched by the player's cancellation cannot revive it.
  request.onProgress(.42);request.onComplete();
 };
}});
const mediaControls=doc.body.children.at(-1);
assert.equal(requests.length,0,'initial settlement does not start media playback');
assert.equal(mediaNav.active,0,'refreshing an old final-slide URL starts at slide one');
assert.equal(scrollY,0);assert.equal(location.hash,'');
assert.equal(mediaNav.goTo(3),true);
assert.deepEqual([requests[0].from,requests[0].to],[0,3]);
assert.equal(mediaControls.children[0].disabled,true);assert.equal(mediaControls.children[2].disabled,true);
requests[0].onProgress(.5);assert.equal(scrollY,880.75/2);assert.equal(mediaNav.progress,.5);
advance(1000);assert.equal(mediaNav.progress,.5,'wall-clock animation cannot run ahead of a stalled video');
assert.equal(mediaNav.goTo(1),false,'external playback retains the atomic gesture lock');
requests[0].onProgress(1);assert.equal(scrollY,880.75,'media progress may reach an intermediate station');
requests[0].onProgress(1.5);assert.equal(scrollY,(880.75+1650.125)/2,'logical progress interpolates between the appropriate section anchors');
requests[0].onComplete();assert.equal(scrollY,2450);assert.equal(mediaNav.progress,3,'completion restores the exact target even without a final progress frame');
assert.equal(mediaControls.children[0].disabled,false);assert.equal(mediaControls.children[2].disabled,true);
const afterCompletion=reported.length;
requests[0].onProgress(2.9);requests[0].onComplete();assert.equal(reported.length,afterCompletion,'duplicate and late frame callbacks after completion are ignored');

mediaNav.goTo(0);assert.deepEqual([requests[1].from,requests[1].to],[3,0]);
requests[1].onProgress(2.25);assert.equal(scrollY,1650.125+(2450-1650.125)*.25,'reverse clips use the same logical position convention');
requests[1].onComplete();assert.equal(scrollY,0);
mediaNav.goTo(2);requests[2].onProgress(.25);
emit(win,'resize');advance(16);
assert.equal(requests[2].cancellations,1,'resize cancels external playback');
assert.equal(scrollY,1650.125);assert.equal(mediaNav.progress,2,'resize settles the selected destination');
const afterResize=reported.length;
requests[2].onProgress(1);requests[2].onComplete();assert.equal(reported.length,afterResize,'late canceled callbacks cannot overwrite a resize settlement');

mediaNav.goTo(0);requests[3].onProgress(1.75);
media.matches=true;emit(media,'change');
assert.equal(requests[3].cancellations,1,'enabling reduced motion cancels external playback');
assert.equal(scrollY,0);assert.equal(mediaNav.progress,0);
const beforeReduced=requests.length;mediaNav.goTo(3);
assert.equal(requests.length,beforeReduced,'reduced-motion navigation bypasses the media driver');
assert.equal(scrollY,2450);
media.matches=false;emit(media,'change');
const beforeRewind=requests.length;
emit(doc,'click',{target:rewind,button:0});
assert.equal(requests.length,beforeRewind+1,'Rewind starts one media request');
assert.equal(requests.at(-1).reset,true,'final-slide Rewind requests the dedicated reset clip');
assert.deepEqual([requests.at(-1).from,requests.at(-1).to],[3,0]);
requests.at(-1).onComplete();
assert.equal(scrollY,0);assert.equal(mediaNav.progress,0);advance(16);
assert.equal(doc.activeElement,ids.name,'completed rewind retains focus transfer with a media driver installed');

mediaNav.goTo(2,{immediate:true});
emit(doc,'click',{target:rewind,button:0});assert.equal(requests.at(-1).reset,false,'Rewind outside the last slide uses ordinary playback');requests.at(-1).onComplete();
mediaNav.goTo(3);const interrupted=requests.at(-1);interrupted.onProgress(.1);
const beforeDestroy=reported.length,destroyedPosition=scrollY;
mediaNav.destroy();assert.equal(interrupted.cancellations,1,'destroy cancels external playback');
interrupted.onProgress(2);interrupted.onComplete();advance(32);
assert.equal(reported.length,beforeDestroy);assert.equal(scrollY,destroyedPosition,'destroyed navigation ignores every late player callback');
assert.equal(history.scrollRestoration,'auto');

// Autoplay rejection may complete immediately, before the cancel function is returned.
location.hash='#name';let synchronousCleanup=0,synchronousPlays=0;
const synchronousNav=initSectionNavigation({animateTransition({to,onProgress,onComplete}){
 ++synchronousPlays;onProgress(to);onComplete();return ()=>{++synchronousCleanup;};
}});
synchronousNav.goTo(1);assert.equal(synchronousNav.progress,1);assert.equal(scrollY,880.75);
assert.equal(synchronousPlays,1);assert.equal(synchronousCleanup,1,'a synchronously completed driver is cleaned up immediately');
synchronousNav.goTo(0,{immediate:true});synchronousNav.destroy();
assert.equal(synchronousCleanup,1,'its returned cancellation must not be retained as an active transition');
console.log('Section navigation: precise poses, multi-leg stops, atomic gestures, momentum, hashes, touch cancellation, keyboard, resize, static/reduced-motion fallbacks and externally clocked media playback passed.');
