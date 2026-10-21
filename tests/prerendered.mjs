import assert from 'node:assert/strict';
import {createPrerenderedPlayer,stationImage,transitionVideo,rewindVideo} from '../prerendered.js';
import {transitionDuration,transitionDurationForLeg,transitionProgress} from '../transition-timing.js';
import {portraitAspect,videoFramesPerSecond} from '../media-settings.js';
import {createVideoCache} from '../video-cache.js';
import {rewindProgress,rewindDuration} from '../rewind-timing.js';

let now=0,nextId=0,rafs=new Map(),timers=new Map();
Object.defineProperty(globalThis,'navigator',{value:{connection:{saveData:false}},configurable:true});
globalThis.requestAnimationFrame=fn=>{rafs.set(++nextId,fn);return nextId;};
globalThis.cancelAnimationFrame=id=>rafs.delete(id);
globalThis.setTimeout=(fn,ms)=>{timers.set(++nextId,{fn,at:now+ms});return nextId;};
globalThis.clearTimeout=id=>timers.delete(id);
function advance(ms){
 const end=now+ms;
 while(now<end){
  now=Math.min(end,now+16);
  for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
  const queue=[...rafs.values()];rafs.clear();for(const fn of queue)fn(now);
 }
}
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
class Video {
 constructor({mp4=true,av1=!mp4,frameCallbacks=true}={}){
  this.mp4=mp4;this.av1=av1;this.frames=new Map();this.loads=[];this.plays=[];this.currentTime=0;this.paused=true;this.readyState=4;this.hidden=true;
  if(!frameCallbacks)this.requestVideoFrameCallback=undefined;
 }
 canPlayType(type){return (this.mp4&&type.startsWith('video/mp4')||this.av1&&type==='video/webm; codecs="av01.0.09M.10"')?'probably':'';}
 abortPending(){for(const play of this.plays)if(play.pending){play.pending=false;play.reject(new DOMException('Interrupted media request','AbortError'));}}
 load(){this.abortPending();this.loads.push(this.src);this.currentTime=0;}
 pause(){this.paused=true;this.abortPending();}
 play(){
  this.paused=false;let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  this.plays.push({resolve,reject,pending:true});return promise;
 }
 requestVideoFrameCallback(fn){const id=++nextId;this.frames.set(id,fn);return id;}
 cancelVideoFrameCallback(id){this.frames.delete(id);}
 present(seconds,{expectedDisplayTime=now}={}){
  const [id,fn]=this.frames.entries().next().value??[];assert.ok(fn,'a decoded frame must have a subscriber');
  this.frames.delete(id);fn(now,{mediaTime:seconds,expectedDisplayTime});
 }
}
function fixture(options){
 const still={},portraitSource={},video=new Video(options),progress=[],stillWrites=[],portraitWrites=[],decodes=[];
 Object.defineProperty(still,'src',{get:()=>stillWrites.at(-1),set:value=>stillWrites.push(value)});
 Object.defineProperty(portraitSource,'srcset',{get:()=>portraitWrites.at(-1),set:value=>portraitWrites.push(value)});
 if(options?.decodePoster)still.decode=()=>new Promise((resolve,reject)=>decodes.push({resolve,reject,src:still.src,portrait:portraitSource.srcset}));
 const cache=options?.cache??{configure(){},request(url,ready){ready(url);return()=>{};},setHidden(){},destroy(){}};
 const player=createPrerenderedPlayer({still,video,portraitSource,cache});let completions=0;
 const navigate=(from,to,options={})=>player.navigate({from,to,...options,onProgress:value=>progress.push(value),onComplete:()=>++completions});
 return {still,portraitSource,stillWrites,portraitWrites,decodes,video,player,progress,navigate,get completions(){return completions;}};
}

// Both responsive families contain all six directions and the independent return.
{
 const media=new Set();
 for(const portrait of [false,true])for(const format of ['mp4','webm']){
  for(let leg=0;leg<3;leg++)for(const direction of [-1,1])media.add(transitionVideo(leg,direction,format,portrait));
  media.add(rewindVideo(format,portrait));
 }
 assert.equal(media.size,28);
}
// Unequal leg durations must remain synchronized in either direction, including
// the extra encoded endpoint frame after the logical timeline has reached rest.
for(let leg=0;leg<3;leg++)for(const direction of [-1,1]){
 const from=direction>0?leg:leg+1,to=from+direction,duration=transitionDurationForLeg(leg);
 const f=fixture();f.navigate(from,to);
 for(const ms of [0,800,1600,duration/2,duration-1600,duration-800,duration,duration+1000/60]){
  f.video.present(ms/1000);
  assert.equal(f.progress.at(-1),from+direction*transitionProgress(ms,leg));
 }
 assert.equal(f.progress.at(-1),to);assert.equal(f.completions,0,'only the ended event hands off the poster');
 f.video.onended();assert.equal(f.completions,1);assert.equal(f.still.src,stationImage(to));f.player.destroy();
}

// Frame presentation timestamps, not wall time or the separate playback clock,
// drive every route leg. A dropped frame advances both layers together.
{
 const f=fixture();assert.equal(f.video.muted,true);assert.equal(f.video.playsInline,true);assert.equal(f.video.loop,false);assert.equal(f.video.preload,'auto');
 f.navigate(0,3);assert.equal(f.player.playing,true);assert.equal(f.still.src,stationImage(0));
 assert.equal(f.video.src,transitionVideo(0,1,'mp4'));assert.equal(f.video.hidden,true);
 advance(1500);assert.deepEqual(f.progress,[],'no progress is invented while the decoder has not presented a frame');
 f.video.currentTime=5;f.video.present(.4);
 assert.equal(f.progress.at(-1),transitionProgress(400,0),'the presented PTS wins over currentTime');
 assert.equal(f.video.hidden,false);
 advance(2000);assert.equal(f.progress.at(-1),transitionProgress(1000*(.4+1/videoFramesPerSecond),0),'stall extrapolation is bounded by one video frame');
 const count=f.progress.length;advance(2000);assert.equal(f.progress.length,count,'a stalled clock stops after that bounded interval');
 f.video.present(4.3);assert.equal(f.progress.at(-1),transitionProgress(4300,0));
 const oldFrame=[...f.video.frames.values()][0],oldEnded=f.video.onended;f.video.onended();
 assert.equal(f.progress.at(-1),1);assert.equal(f.still.src,stationImage(1));assert.equal(f.video.src,transitionVideo(1,1,'mp4'));
 const atHandoff=f.progress.length;oldEnded();assert.equal(f.progress.length,atHandoff,'an old ended event cannot skip the next clip');oldFrame(now,{mediaTime:6});assert.equal(f.progress.length,atHandoff,'an old leg callback cannot update the next leg');
 await flush();assert.equal(f.player.playing,true,'load-induced rejection from the previous leg cannot abort the next leg');
 f.video.present(.4);assert.equal(f.progress.at(-1),1+transitionProgress(400,1));
 f.video.present(10.8);assert.equal(f.progress.at(-1),1+transitionProgress(10800,1),'the longer gallery must retain its final text arrival after eight seconds');
 f.video.onended();assert.equal(f.progress.at(-1),2);assert.equal(f.completions,0);
 f.video.present((transitionDuration-16)/1000);f.video.onended();
 assert.equal(f.progress.at(-1),3);assert.equal(f.completions,1);assert.equal(f.player.playing,false);
 assert.equal(f.video.hidden,true);assert.equal(f.still.src,stationImage(3),'the endpoint is exact even if the last encoded frame precedes it');
 await flush();assert.equal(f.completions,1);f.player.destroy();
}

// Text moves at display refresh between presented video frames, using the
// expected display instant rather than callback delivery time as its anchor.
{
 const f=fixture();f.navigate(0,1);advance(100);assert.deepEqual(f.progress,[]);
 f.video.present(.4,{expectedDisplayTime:now+8});const startCount=f.progress.length;
 advance(4);assert.equal(f.progress.length,startCount,'a future display anchor does not advance text early');
 advance(8);assert.ok(Math.abs(f.progress.at(-1)-transitionProgress(404,0))<1e-12,'text advances by four milliseconds between video frames');
 advance(4);assert.ok(Math.abs(f.progress.at(-1)-transitionProgress(408,0))<1e-12);
 advance(100);assert.equal(f.progress.at(-1),transitionProgress((.4+1/videoFramesPerSecond)*1000,0));
 const bounded=f.progress.at(-1),count=f.progress.length;advance(500);assert.equal(f.progress.length,count);assert.equal(f.progress.at(-1),bounded);
 f.video.present(1);advance(4);const moving=f.progress.at(-1);assert.ok(moving>transitionProgress(1000,0));
 f.video.onwaiting();advance(100);assert.equal(f.progress.at(-1),moving,'waiting freezes interpolation immediately');
 f.video.onplaying();advance(100);assert.equal(f.progress.at(-1),moving,'playing alone cannot invent a new presented-frame anchor');
 f.video.present(1.1);advance(4);const ahead=f.progress.at(-1);
 f.video.present(1.1);assert.equal(f.progress.at(-1),ahead,'a fresh timing anchor cannot correct the text backwards');
 advance(2);assert.equal(f.progress.at(-1),ahead);advance(4);assert.ok(f.progress.at(-1)>ahead,'the next anchor catches up without reversing');
 f.video.paused=true;f.video.onpause();const paused=f.progress.at(-1);advance(13000);assert.equal(f.progress.at(-1),paused);assert.equal(f.completions,0,'a deliberate pause suspends the frame-stall timeout');
 f.video.paused=false;f.video.onplaying();advance(100);assert.equal(f.progress.at(-1),paused);
 f.video.present(1.2);advance(4);const visible=f.progress.at(-1);f.player.setHidden(true);advance(1000);assert.equal(f.progress.at(-1),visible);
 f.player.setHidden(false);advance(100);assert.equal(f.progress.at(-1),visible,'visibility resume awaits the next actual video presentation');
 f.video.present(1.3);const lateDisplay=[...rafs.values()][0],lateFrame=[...f.video.frames.values()][0];
 const beforeCancel=f.progress.length;f.player.freeze();lateDisplay(now+8);lateFrame(now,{mediaTime:2,expectedDisplayTime:now});advance(100);
 assert.equal(f.progress.length,beforeCancel,'canceled display and media callbacks cannot resume text');f.player.destroy();await flush();
}
{
 const f=fixture();f.navigate(0,1);f.video.present(.4);advance(12016);
 assert.equal(f.completions,1,'display-refresh updates never extend the actual-frame stall watchdog');
 assert.equal(f.still.src,stationImage(1));f.player.destroy();await flush();
}

// Reverse clips have positive playback time and the opposite route orientation.
{
 const f=fixture({mp4:false});f.navigate(3,0);
 for(let leg=2;leg>=0;leg--){
  assert.equal(f.video.src,transitionVideo(leg,-1,'webm'));
  f.video.present(.4);assert.equal(f.progress.at(-1),leg+1-transitionProgress(400,leg));
  f.video.onended();assert.equal(f.progress.at(-1),leg);
 }
 assert.equal(f.completions,1);assert.equal(f.still.src,stationImage(0));await flush();f.player.destroy();
}

// Loading a codec fallback rejects the old play promise in real browsers.
{
 const f=fixture({mp4:true,av1:true});f.navigate(0,1);
 const oldFrame=[...f.video.frames.values()][0];f.video.onerror();
 assert.equal(f.video.src,transitionVideo(0,1,'mp4'));
 await flush();assert.equal(f.player.playing,true);assert.equal(f.completions,0,'the aborted AV1 play promise cannot cancel the H.264 attempt');
 oldFrame(now,{mediaTime:3});assert.deepEqual(f.progress,[0],'retry aligns the text with its source poster while the alternate clip loads');
 f.video.present(.4);assert.equal(f.progress.at(-1),transitionProgress(400,0));
 f.video.onerror();assert.equal(f.player.playing,false);assert.equal(f.completions,1);assert.equal(f.still.src,stationImage(1));
 await flush();assert.equal(f.completions,1);f.player.destroy();
}

// A hidden tab suspends both the player and its download timeout. Its pending
// play rejection is deliberate; returning to the tab resumes the same clip.
{
 const f=fixture();f.navigate(1,2);f.video.present(.4);
 const before=f.progress.at(-1),source=f.video.src,loadCount=f.video.loads.length;
 f.player.setHidden(true);await flush();assert.equal(f.video.paused,true);assert.equal(f.player.playing,true);
 advance(20000);assert.equal(f.completions,0);assert.equal(f.progress.at(-1),before);
 f.player.setHidden(false);assert.equal(f.video.paused,false);assert.equal(f.video.src,source);assert.equal(f.video.loads.length,loadCount,'resuming never reloads or seeks the media');
 f.video.present(.6);assert.equal(f.progress.at(-1),1+transitionProgress(600,1));
 f.video.onended();await flush();assert.equal(f.completions,1);f.player.destroy();
}

// Canceling, changing station, and destroying invalidate every queued callback.
{
 const f=fixture();const cancel=f.navigate(0,1);f.video.present(.4);
 const frame=[...f.video.frames.values()][0],ended=f.video.onended,error=f.video.onerror;
 const count=f.progress.length;cancel();cancel();frame(now,{mediaTime:3});ended();error();await flush();advance(14000);
 assert.equal(f.progress.length,count);assert.equal(f.completions,0);assert.equal(f.player.playing,false);
 f.navigate(1,2);const replacedFrame=[...f.video.frames.values()][0];f.player.showStation(3);
 replacedFrame(now,{mediaTime:4});assert.equal(f.still.src,stationImage(3));assert.equal(f.video.hidden,true);assert.equal(f.completions,0);
 f.navigate(3,2);const destroyedFrame=[...f.video.frames.values()][0];f.player.destroy();destroyedFrame(now,{mediaTime:7});await flush();
 assert.equal(f.player.playing,false);assert.equal(f.completions,0);
}

// Autoplay rejection and a download that never produces a frame settle the
// requested still exactly once, so navigation can release its gesture lock.
{
 const f=fixture();f.navigate(0,2);f.video.plays.at(-1).reject(new DOMException('Playback denied','NotAllowedError'));await flush();
 assert.deepEqual(f.progress,[2]);assert.equal(f.completions,1);assert.equal(f.still.src,stationImage(2));assert.equal(f.video.hidden,true);
 f.navigate(2,3);advance(12016);assert.equal(f.progress.at(-1),3);assert.equal(f.completions,2);assert.equal(f.still.src,stationImage(3));await flush();f.player.destroy();
}

// Browsers without frame callbacks still use the media clock, and honor data
// saving preference without requiring video playback for a station still.
{
 navigator.connection.saveData=true;
 const f=fixture({frameCallbacks:false});assert.equal(f.video.preload,'metadata');f.player.showStation(0);assert.equal(f.video.plays.length,0);
 f.navigate(0,1);f.video.currentTime=.4;advance(16);assert.equal(f.progress.at(-1),transitionProgress(400,0));
 const fixed=f.progress.at(-1);advance(1000);assert.equal(f.progress.at(-1),fixed,'RAF fallback samples currentTime without integrating wall time');
 f.video.readyState=1;f.video.currentTime=.8;advance(16);assert.equal(f.progress.at(-1),fixed,'an unavailable frame cannot advance the fallback clock');
 f.video.readyState=4;f.video.currentTime=.4;advance(12016);
 assert.equal(f.completions,1,'duplicate RAF samples of a stalled media clock must not postpone the download timeout');
 assert.equal(f.still.src,stationImage(1));
 f.player.destroy();await flush();navigator.connection.saveData=false;
}
// Portrait selection agrees with the picture breakpoint, including its exact
// boundary. Poster preloads always match the active clip's crop and direction.
{
 const preloads=[];
 globalThis.Image=class {constructor(){preloads.push(this);}};
 assert.equal(portraitAspect,3/4);
 for(const [width,height,portrait] of [[390,844,true],[600,800,true],[601,800,false],[1280,800,false]]){
  globalThis.innerWidth=width;globalThis.innerHeight=height;
  const f=fixture({mp4:true,av1:true});f.player.showStation(0);
  assert.equal(f.still.src,stationImage(0));assert.equal(f.portraitSource.srcset,stationImage(0,true),'picture sources identify the same station for either viewport');
  f.player.showStation(0);assert.equal(f.stillWrites.length,1);assert.equal(f.portraitWrites.length,1,'repeated station updates avoid restarting image selection');
  f.navigate(0,2);assert.equal(f.video.src,transitionVideo(0,1,'webm',portrait));
  assert.equal(preloads.at(-1).src,stationImage(1,portrait));assert.equal(preloads.at(-1).fetchPriority,'low');
  f.video.onerror();assert.equal(f.video.src,transitionVideo(0,1,'mp4',portrait),'format retry preserves the selected responsive variant');
  f.video.present(.4);assert.equal(f.progress.at(-1),transitionProgress(400,0),'responsive crops share the same camera clock');
  f.video.onended();assert.equal(f.still.src,stationImage(1));assert.equal(f.portraitSource.srcset,stationImage(1,true));
  assert.equal(f.video.src,transitionVideo(1,1,'mp4',portrait));assert.equal(preloads.at(-1).src,stationImage(2,portrait));
  f.video.onended();assert.equal(f.portraitSource.srcset,stationImage(2,true));
  f.navigate(2,1);assert.equal(f.video.src,transitionVideo(1,-1,'mp4',portrait));assert.equal(preloads.at(-1).src,stationImage(1,portrait));
  f.video.onended();assert.equal(f.portraitSource.srcset,stationImage(1,true));await flush();f.player.destroy();
 }
 // The app settles on resize, then the next navigation chooses the new master.
 globalThis.innerWidth=390;globalThis.innerHeight=844;
 const f=fixture();f.navigate(0,1);const oldFrame=[...f.video.frames.values()][0];
 globalThis.innerWidth=1280;globalThis.innerHeight=800;f.player.showStation(1);
 const settled=f.progress.length;oldFrame(now,{mediaTime:5});assert.equal(f.progress.length,settled);
 f.navigate(1,2);assert.equal(f.video.src,transitionVideo(1,1,'mp4',false));assert.equal(preloads.at(-1).src,stationImage(2,false));
 f.player.destroy();await flush();delete globalThis.Image;delete globalThis.innerWidth;delete globalThis.innerHeight;
}

// Unsupported codecs may surface through play() before, or together with, an
// error event. Either ordering must spend exactly one alternate-format retry.
{
 const f=fixture({mp4:true,av1:true});f.navigate(0,1);
 const firstError=f.video.onerror;
 f.video.plays.at(-1).reject(new DOMException('Unsupported media format','NotSupportedError'));await flush();
 assert.equal(f.video.src,transitionVideo(0,1,'mp4'),'an unsupported play promise should try the supported alternate codec');
 assert.equal(f.completions,0);firstError();
 assert.equal(f.completions,0,'a duplicate event from the first codec cannot consume the alternate attempt');
 f.video.present(.4);assert.equal(f.progress.at(-1),transitionProgress(400,0));
 f.video.plays.at(-1).reject(new DOMException('Alternate codec unsupported','NotSupportedError'));await flush();
 assert.equal(f.completions,1);assert.equal(f.still.src,stationImage(1));f.player.destroy();

 const g=fixture({mp4:true,av1:true});g.navigate(0,1);
 g.video.plays.at(-1).reject(new DOMException('Unsupported media format','NotSupportedError'));g.video.onerror();await flush();
 assert.equal(g.video.src,transitionVideo(0,1,'mp4'));assert.equal(g.completions,0,'an error event before rejection handling must not retry twice');
 g.video.onended();await flush();assert.equal(g.completions,1);g.player.destroy();
}
// Updating a picture URL does not mean that its new image can be painted yet.
// Hold the completed video, and its text pose, until destination decoding ends.
{
 const f=fixture({decodePoster:true});f.navigate(0,1);
 assert.equal(f.video.loads.length,0,'the source station decodes before loading a clip can clear the retained video');
 f.decodes.at(-1).resolve();await flush();assert.equal(f.video.loads.length,1);
 f.video.present(7.9);const priorPose=f.progress.at(-1),lateFrame=[...f.video.frames.values()][0],lateEnded=f.video.onended;
 f.video.onended();assert.equal(f.still.src,stationImage(1));assert.equal(f.video.hidden,false,'the previous decoded poster stays covered during the handoff');
 assert.equal(f.progress.at(-1),priorPose);assert.equal(f.completions,0,'completion waits for the destination picture');
 lateFrame(now,{mediaTime:2});lateEnded();assert.equal(f.progress.at(-1),priorPose,'late callbacks cannot inject an old video pose during poster decoding');
 assert.equal(f.decodes.length,2,'a duplicate ended callback cannot restart the handoff');
 f.decodes.at(-1).resolve();await flush();
 assert.equal(f.video.hidden,true);assert.equal(f.progress.at(-1),1);assert.equal(f.completions,1);
 f.player.destroy();
}

// A multi-leg jump must not call video.load() until its intermediate poster is
// ready: load clears the very video frame that hides the previous poster.
{
 const f=fixture({decodePoster:true});f.navigate(0,2);f.decodes.at(-1).resolve();await flush();
 f.video.present(7.9);f.video.onended();assert.equal(f.video.loads.length,1);assert.equal(f.video.hidden,false);
 f.decodes.at(-1).resolve();await flush();assert.equal(f.video.loads.length,2);assert.equal(f.video.hidden,true);
 assert.equal(f.progress.at(-1),1);assert.equal(f.completions,0);
 f.video.present(.4);assert.equal(f.video.hidden,false);f.video.onended();
 assert.equal(f.video.hidden,false);f.decodes.at(-1).resolve();await flush();assert.equal(f.video.hidden,true);assert.equal(f.completions,1);
 f.player.destroy();
}

// Decode promises cannot be canceled, so a completed stale request must never
// expose a picture or resume playback after a newer station has been selected.
{
 const f=fixture({decodePoster:true});f.navigate(0,1);f.decodes.at(-1).resolve();await flush();
 f.video.present(7.9);f.video.onended();const obsolete=f.decodes.at(-1);
 f.player.showStation(3);const current=f.decodes.at(-1);
 obsolete.resolve();await flush();assert.equal(f.video.hidden,false);assert.equal(f.completions,0);assert.equal(f.still.src,stationImage(3));
 current.resolve();await flush();assert.equal(f.video.hidden,true);assert.equal(f.completions,0);
 f.navigate(3,2);f.video.present(.4);f.video.onended();const canceled=f.decodes.at(-1);f.player.freeze();
 canceled.resolve();await flush();assert.equal(f.video.hidden,false,'freezing keeps the chosen video frame even if a canceled image later decodes');
 assert.equal(f.completions,0);f.player.destroy();
}

// Visibility changes may occur while any station poster is still decoding.
// Resuming at those boundaries must not replay the video element's old source.
{
 const f=fixture({decodePoster:true});f.video.src='./media/previous-navigation.mp4';f.navigate(0,2);
 f.player.setHidden(true);f.player.setHidden(false);await flush();
 assert.equal(f.video.plays.length,0,'showing the tab during initial poster decoding cannot replay a previously loaded source');
 assert.equal(f.video.loads.length,0);
 f.decodes.at(-1).resolve();await flush();assert.equal(f.video.plays.length,1);assert.equal(f.video.loads.length,1);
 f.video.present(7.9);f.video.onended();
 const firstClip=f.video.src;f.player.setHidden(true);f.player.setHidden(false);await flush();
 assert.equal(f.video.plays.length,1,'showing the tab during an intermediate poster handoff cannot restart the ended clip');
 assert.equal(f.video.src,firstClip);assert.equal(f.video.loads.length,1);
 f.decodes.at(-1).resolve();await flush();assert.equal(f.video.plays.length,2);assert.equal(f.video.loads.length,2);
 assert.equal(f.video.src,transitionVideo(1,1,'mp4'));
 f.video.present(7.9);f.video.onended();f.player.setHidden(true);f.player.setHidden(false);await flush();
 assert.equal(f.video.plays.length,2,'showing the tab during final poster decoding cannot replay the final clip');
 assert.equal(f.completions,0);f.decodes.at(-1).resolve();await flush();
 assert.equal(f.completions,1);assert.equal(f.video.hidden,true);assert.equal(f.video.plays.length,2);f.player.destroy();
}

// A failed or stalled poster still releases navigation and leaves the retained
// video visible; it must never reveal an old picture while pretending it is new.
{
 const f=fixture({decodePoster:true});f.navigate(0,1);f.decodes.at(-1).resolve();await flush();
 f.video.present(7.9);f.video.onended();f.decodes.at(-1).reject(new Error('Image could not decode'));await flush();
 assert.equal(f.video.hidden,false);assert.equal(f.progress.at(-1),1);assert.equal(f.completions,1);f.player.destroy();
 const g=fixture({decodePoster:true});g.navigate(0,1);g.decodes.at(-1).resolve();await flush();
 g.video.present(7.9);g.video.onended();advance(12016);
 assert.equal(g.video.hidden,false);assert.equal(g.progress.at(-1),1);assert.equal(g.completions,1,'a stalled poster cannot lock the page indefinitely');
 g.decodes.at(-1).resolve();await flush();assert.equal(g.completions,1);g.player.destroy();
}
// Real download scheduling is exercised separately from the immediate cache
// used above, including the interval between response headers and full body.
{
 const originalFetch=globalThis.fetch,originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 const downloads=[],created=[],revoked=[];
 globalThis.fetch=(url,{signal})=>new Promise((resolve,reject)=>{
  let finishBody;
  const body=new Promise(yes=>finishBody=yes);
  const item={url,signal,headers(){resolve({ok:true,blob:()=>body});},finish(){finishBody(new Blob(['encoded video']));},fail(){reject(new Error('Network failure'));}};
  signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});downloads.push(item);
 });
 URL.createObjectURL=blob=>{const url='blob:test-'+created.length;created.push({url,blob});return url;};
 URL.revokeObjectURL=url=>revoked.push(url);
 const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 const urls=['a','b','c','d','e','f'];
 try{
  // Landing waits for the first still, then starts one download. Navigation
  // reuses that in-flight fetch and does not play after only its headers arrive.
  const cache=createVideoCache(),f=fixture({cache,decodePoster:true});
  f.player.showStation(0);assert.equal(downloads.length,0,'the initial image decodes before eager video traffic starts');
  f.decodes.at(-1).resolve();await settle();assert.equal(downloads.length,1);assert.equal(downloads.at(-1).url,transitionVideo(0,1,'mp4'));
  f.navigate(0,1);assert.equal(downloads.length,1,'navigation joins the first eager download');
  downloads.at(-1).headers();await settle();assert.equal(f.video.loads.length,0,'HTTP headers do not mean the complete clip is buffered');
  downloads.at(-1).finish();await settle();assert.equal(f.video.loads.length,1);assert.equal(f.video.src,created[0].url);
  assert.equal(downloads.length,2,'only after one complete clip does the next eager download start');
  f.video.present(.4);assert.equal(f.progress.at(-1),transitionProgress(400,0),'buffering does not replace the presented-frame clock');
  f.player.destroy();assert.equal(downloads.at(-1).signal.aborted,true);assert.ok(revoked.includes(created[0].url));await settle();

  // A requested clip takes precedence over speculative background work;
  // no second request for the same clip or codec family is started.
  const c=createVideoCache();let readyURL,errors=0;const start=downloads.length;
  c.configure(urls,{preload:true});assert.equal(downloads.length,start+1);assert.equal(downloads.at(-1).url,'a');
  c.request('d',url=>readyURL=url,()=>++errors);assert.equal(downloads[start].signal.aborted,true);assert.equal(downloads.at(-1).url,'d');
  c.request('d',()=>{},()=>++errors);assert.equal(downloads.length,start+2,'two consumers share one fetch');
  downloads.at(-1).headers();downloads.at(-1).finish();await settle();assert.ok(readyURL?.startsWith('blob:'));assert.equal(errors,0);
  const beforeCached=downloads.length;c.request('d',url=>assert.equal(url,readyURL),()=>++errors);assert.equal(downloads.length,beforeCached);
  // Pause speculative downloads after the in-flight fetch finishes.
  c.setHidden(true);downloads.at(-1).headers();downloads.at(-1).finish();await settle();const hiddenCount=downloads.length;
  await settle();assert.equal(downloads.length,hiddenCount);c.setHidden(false);assert.equal(downloads.length,hiddenCount+1);
  while(downloads.at(-1).url!=='f'){downloads.at(-1).headers();downloads.at(-1).finish();await settle();}
  downloads.at(-1).headers();downloads.at(-1).finish();await settle();
  const completeCount=downloads.length;for(const url of urls)c.request(url,()=>{},()=>++errors);
  assert.equal(downloads.length,completeCount,'all six clips reuse retained complete files');
  c.destroy();await settle();

  // Changing responsive sets releases all previous objects, aborts the active
  // fetch, and never turns an obsolete response into another cached object.
  const responsive=createVideoCache();responsive.configure(urls,{preload:true});
  downloads.at(-1).headers();downloads.at(-1).finish();await settle();
  const obsolete=downloads.at(-1),oldReady=created.at(-1).url,createdCount=created.length;
  responsive.configure(urls.map(url=>'portrait-'+url),{preload:true});
  assert.equal(obsolete.signal.aborted,true);assert.ok(revoked.includes(oldReady));
  obsolete.headers();obsolete.finish();await settle();assert.equal(created.length,createdCount,'a canceled family cannot allocate a late Blob URL');
  assert.equal(downloads.at(-1).url,'portrait-a');responsive.destroy();await settle();

  // Data saver and reduced-motion users do not eagerly download six videos.
  navigator.connection.saveData=true;
  const saver=fixture({cache:createVideoCache()});const saverStart=downloads.length;
  saver.player.showStation(0);assert.equal(downloads.length,saverStart);
  const stop=saver.navigate(0,1);assert.equal(downloads.length,saverStart+1);stop();assert.equal(downloads.at(-1).signal.aborted,true);
  saver.player.destroy();await settle();navigator.connection.saveData=false;
  globalThis.matchMedia=()=>({matches:true});
  const reduced=fixture({cache:createVideoCache()}),reducedStart=downloads.length;
  reduced.player.showStation(0);assert.equal(downloads.length,reducedStart);reduced.player.destroy();delete globalThis.matchMedia;

  const staticPlayer=fixture({cache:createVideoCache()}),staticStart=downloads.length;
  staticPlayer.player.showStation(0,{preload:false});assert.equal(downloads.length,staticStart,'explicit static mode loads its poster without videos');
  staticPlayer.player.showStation(0);assert.equal(downloads.length,staticStart+1);
  staticPlayer.player.freeze();assert.equal(downloads.at(-1).signal.aborted,true,'switching to static mode cancels a speculative transfer');
  staticPlayer.player.showStation(1,{preload:false});await settle();assert.equal(downloads.length,staticStart+1,'selecting static sections cannot restart the preload queue');
  staticPlayer.player.showStation(1);assert.equal(downloads.length,staticStart+2,'animated mode can resume the paused preload queue');staticPlayer.player.destroy();await settle();

  // A failed background fetch can be retried on demand without poisoning the
  // cache. A canceled subscriber must not receive completion or failure.
  const retryCache=createVideoCache();retryCache.configure(urls,{preload:false});
  let delivered=0;const unsubscribe=retryCache.request('a',()=>++delivered,()=>++delivered);unsubscribe();await settle();assert.equal(delivered,0);
  retryCache.request('a',()=>++delivered,()=>++delivered);downloads.at(-1).fail();await settle();assert.equal(delivered,1);
  retryCache.request('a',()=>++delivered,()=>++delivered);downloads.at(-1).headers();downloads.at(-1).finish();await settle();assert.equal(delivered,2);
  retryCache.destroy();await settle();
  const stalled=createVideoCache();stalled.configure(urls,{preload:false});let timedOut=0;
  stalled.request('a',()=>assert.fail('stalled request cannot succeed'),()=>++timedOut);
  advance(30016);await settle();assert.equal(timedOut,1,'a download with no progress cannot lock navigation forever');stalled.destroy();
  // Streaming responses retain their actual MIME type, including servers that
  // omit Content-Type for WebM, rather than silently labelling every Blob MP4.
  globalThis.fetch=async()=>({ok:true,headers:{get:()=>null},body:{getReader(){let sent=false;return {async read(){if(sent)return {done:true};sent=true;return {done:false,value:new Uint8Array([1,2,3])};}};}}});
  const streaming=createVideoCache();streaming.configure(['clip.webm?v=test'],{preload:false});let streamed=false;
  streaming.request('clip.webm?v=test',()=>streamed=true,()=>assert.fail('stream download failed'));await settle();assert.equal(streamed,true);assert.equal(created.at(-1).blob.type,'video/webm');streaming.destroy();await settle();
  assert.equal(revoked.length,created.length);assert.equal(new Set(revoked).size,created.length,'every retained Blob URL is eventually revoked exactly once');
 }finally{globalThis.fetch=originalFetch;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;delete globalThis.matchMedia;navigator.connection.saveData=false;}
}
// Prefer the actual 10-bit AV1 profile when both codecs are supported, and
// keep H.264 available for a browser that advertises AV1 but fails to decode it.
{
 const f=fixture({mp4:true,av1:true});f.navigate(0,1);
 assert.equal(f.video.src,transitionVideo(0,1,'webm'));
 f.video.onerror();assert.equal(f.video.src,transitionVideo(0,1,'mp4'));
 f.player.destroy();
}

// An unsupported alternate must not trigger another complete download or a
// speculative six-file preload after the only supported codec fails.
for(const options of [{mp4:true,av1:false},{mp4:false,av1:true}]){
 const configurations=[],requests=[];
 const cache={configure(urls,options){configurations.push({urls,options});},request(url,ready){requests.push(url);ready('blob:'+url);return()=>{};},setHidden(){},destroy(){}};
 const f=fixture({...options,cache});f.player.showStation(0);f.navigate(0,1);
 assert.equal(f.video.loads.length,1);f.video.onerror();await flush();
 assert.equal(f.completions,1);assert.equal(f.still.src,stationImage(1));assert.equal(requests.length,1,'known-unsupported codec is never requested');
 const extension=options.mp4?'.mp4?':'.webm?';
 assert.ok(configurations.every(({urls})=>urls.every(url=>url.includes(extension))),'unsupported codec family is never preloaded');
 f.player.destroy();
}
{
 const configurations=[];
 const cache={configure(urls,options){configurations.push(options);},request(){assert.fail('no advertised codec should be downloaded');},setHidden(){},destroy(){}};
 const f=fixture({mp4:false,av1:false,cache});f.player.showStation(0);f.navigate(0,1);
 assert.equal(f.completions,1);assert.equal(f.video.loads.length,0);assert.equal(f.still.src,stationImage(1));
 assert.ok(configurations.every(({preload})=>preload===false),'no eager downloads when neither codec is supported');f.player.destroy();
}

// A full reset uses one closing-loop movie following its own physical path.
// The route coordinate below is only for navigation/scroll while text is hidden.
{
 assert.equal(rewindProgress(-1),3);assert.equal(rewindProgress(0),3);assert.equal(rewindProgress(rewindDuration),0);assert.equal(rewindProgress(rewindDuration+1),0);
 assert.equal(rewindProgress(rewindDuration/2),1.5);
 assert.ok(Math.abs(rewindProgress(rewindDuration/3)-2)<1e-12);assert.ok(Math.abs(rewindProgress(2*rewindDuration/3)-1)<1e-12);
 let previous=3;for(let elapsed=1;elapsed<=rewindDuration;elapsed++){
  const coordinate=rewindProgress(elapsed);assert.ok(coordinate<=previous&&coordinate>=0);previous=coordinate;
 }
 const configurations=[];
 const cache={configure(urls){configurations.push(urls);},request(url,ready){ready(url);return()=>{};},setHidden(){},destroy(){}};
 const f=fixture({cache});f.navigate(3,0,{reset:true});
 assert.equal(f.video.src,rewindVideo('mp4'));assert.ok(f.video.src.endsWith('?v=final-flight-13'),'new return path cannot reuse the old reverse-route movie cache');assert.equal(f.video.loads.length,1);
 assert.equal(configurations.at(-1).length,7);assert.equal(configurations.at(-1)[3],rewindVideo('mp4'),'reset preloads after the forward route and before reverse legs');
 for(const seconds of [.4,2.7,4,5.5,7.9,12,18,21.9,22.3,22.3+1/60]){
  f.video.present(seconds);assert.equal(f.progress.at(-1),rewindProgress(seconds*1000));
 }
 const oldFrame=[...f.video.frames.values()][0],oldEnded=f.video.onended;f.video.onended();
 assert.equal(f.progress.at(-1),0);assert.equal(f.completions,1);assert.equal(f.video.loads.length,1);
 assert.deepEqual(f.stillWrites,[stationImage(3),stationImage(0)],'reset has no intermediate poster/video handoffs');
 const count=f.progress.length;oldEnded();oldFrame(now,{mediaTime:4});assert.equal(f.progress.length,count);f.player.destroy();await flush();
}
{
 globalThis.innerWidth=390;globalThis.innerHeight=844;
 const f=fixture({mp4:true,av1:true,decodePoster:true});f.navigate(3,0,{reset:true});f.decodes.at(-1).resolve();await flush();
 assert.equal(f.video.src,rewindVideo('webm',true));f.video.present(4);
 f.player.setHidden(true);await flush();advance(20000);assert.equal(f.completions,0);f.player.setHidden(false);
 f.video.present(5);assert.equal(f.progress.at(-1),rewindProgress(5000));
 f.video.onerror();await flush();assert.equal(f.video.src,rewindVideo('mp4',true),'reset retries the same responsive movie in the supported fallback codec');
 assert.equal(f.progress.at(-1),3,'retry returns text to the reset movie starting point');
 f.video.present(7.9);f.video.onended();assert.equal(f.video.hidden,false);assert.equal(f.completions,0);
 f.decodes.at(-1).resolve();await flush();assert.equal(f.video.hidden,true);assert.equal(f.completions,1);assert.equal(f.progress.at(-1),0);f.player.destroy();
 const failed=fixture();failed.navigate(3,0,{reset:true});failed.video.onerror();assert.equal(failed.still.src,stationImage(0));assert.equal(failed.completions,1);failed.player.destroy();
 const ordinary=fixture();ordinary.navigate(2,0,{reset:true});assert.equal(ordinary.video.src,transitionVideo(1,-1,'mp4',true),'a reset request outside the closing station keeps its actual ordinary route');ordinary.player.destroy();
 delete globalThis.innerWidth;delete globalThis.innerHeight;await flush();
}
console.log('Prerendered player: display-refresh text, bounded presented-frame interpolation, complete-clip buffering, serial seven-clip preload, priority/deduplication, responsive cache eviction, data saver/reduced motion, supported-codec retry, one-movie compressed rewind, cancellation, decoded poster handoffs and playback races passed.');
