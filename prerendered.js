import {transitionProgress,transitionDurationForLeg} from './transition-timing.js?v=final-flight-11';
import {portraitAspect,videoFramesPerSecond} from './media-settings.js';
import {createVideoCache} from './video-cache.js';
import {rewindProgress} from './rewind-timing.js?v=final-flight-11';
export {masterAspect} from './media-settings.js';

export const stationImage=(index,portrait=false)=>`./media/station-${index}${portrait?'-portrait':''}.webp`;
export const transitionVideo=(leg,direction,format,portrait=false)=>`./media/transition-${leg}-${direction>0?'forward':'reverse'}${portrait?'-portrait':''}.${format}?v=final-flight-13`;
export const rewindVideo=(format,portrait=false)=>`./media/rewind${portrait?'-portrait':''}.${format}?v=final-flight-13`;

// Presented frames anchor the text clock. Display-refresh interpolation is
// limited to one encoded frame, so a stall cannot let text run away from video.
export function createPrerenderedPlayer({still,video,portraitSource,cache=createVideoCache()}){
 let cancelCurrent=null,playing=false,hidden=false;
 video.muted=true;video.playsInline=true;video.loop=false;
 video.preload=navigator.connection?.saveData?'metadata':'auto';
 const supported={webm:!!video.canPlayType('video/webm; codecs="av01.0.09M.10"'),mp4:!!video.canPlayType('video/mp4; codecs="avc1.42E029"')};
 let preferred=supported.webm?'webm':'mp4';
 let shown=-1,readyPoster='',posterGeneration=0,posterTimer=0;
 const portraitViewport=()=>typeof innerWidth==='number'&&typeof innerHeight==='number'&&innerWidth/innerHeight<=portraitAspect;
 const allowPreload=()=>!navigator.connection?.saveData&&!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 function configureCache(portrait=portraitViewport(),preload=allowPreload()){
  const urls=[];for(let leg=0;leg<3;leg++)urls.push(transitionVideo(leg,1,preferred,portrait));
  urls.push(rewindVideo(preferred,portrait));
  for(let leg=2;leg>=0;leg--)urls.push(transitionVideo(leg,-1,preferred,portrait));
  cache.configure(urls,{preload:preload&&supported[preferred]});
 }
 function cancelPoster(){++posterGeneration;clearTimeout(posterTimer);posterTimer=0;}
 function showStill(index,onReady=()=>{}){
  cancelPoster();
  const generation=posterGeneration,key=`${index}:${portraitViewport()}`;
  if(shown!==index){
   shown=index;readyPoster='';
   if(portraitSource)portraitSource.srcset=stationImage(index,true);
   still.src=stationImage(index);
  }
  const finish=decoded=>{
   if(generation!==posterGeneration)return;
   clearTimeout(posterTimer);posterTimer=0;++posterGeneration;
   // Keep the completed video frame above the picture until the newly selected
   // picture source is decoded. Changing src alone can still paint the old image.
   if(decoded){readyPoster=key;video.hidden=true;}
   onReady(decoded);
  };
  if(readyPoster===key||typeof still.decode!=='function'){finish(true);return;}
  // A missing image must not leave the section navigation locked indefinitely.
  posterTimer=setTimeout(()=>finish(false),12000);
  try{still.decode().then(()=>finish(true),()=>finish(false));}catch{finish(false);}
 }
 function showStation(index,{preload=true}={}){cancelCurrent?.();showStill(index,decoded=>{if(decoded)configureCache(portraitViewport(),preload&&allowPreload());});}
 function navigate({from,to,reset=false,onProgress,onComplete}){
  cancelCurrent?.();
  let cancelled=false,playbackReady=false,frame=0,raf=0,watchdog=0,current=from,attempt=0,playId=0,legId=0,lastTime=-1,lastFrameTime=-1,anchor=null,cancelDownload=null;
  const direction=Math.sign(to-from);
  const rewinding=reset&&from===3&&to===0;
  const portrait=portraitViewport();
  playing=true;
  function clearFrames(){
   if(frame)video.cancelVideoFrameCallback?.(frame);
   cancelAnimationFrame(raf);clearTimeout(watchdog);frame=raf=watchdog=0;anchor=null;
  }
  function stopTextClock(){anchor=null;cancelAnimationFrame(raf);raf=0;}
  function pause(){++playId;stopTextClock();video.pause();}
  function cancel(){
   if(cancelled)return;
   cancelled=true;playbackReady=false;cancelDownload?.();cancelDownload=null;clearFrames();cancelPoster();video.onended=video.onerror=video.onwaiting=video.onplaying=video.onpause=null;pause();
   playing=false;if(cancelCurrent===cancel)cancelCurrent=null;
  }
  cancelCurrent=cancel;
  function fallback(){
   if(cancelled)return;
   playbackReady=false;cancelDownload?.();cancelDownload=null;++legId;clearFrames();pause();video.onended=video.onerror=video.onwaiting=video.onplaying=video.onpause=null;
   showStill(to,()=>{if(cancelled)return;cancel();onProgress(to);onComplete();});
  }
  function guardDownload(){
   clearTimeout(watchdog);
   if(!hidden)watchdog=setTimeout(fallback,12000);
  }
  function report(seconds){
   if(cancelled||seconds<=lastTime)return;
   lastTime=seconds;
   if(rewinding){onProgress(rewindProgress(seconds*1000));return;}
   const leg=Math.min(current,current+direction);
   const fraction=transitionProgress(Math.min(transitionDurationForLeg(leg),Math.max(0,seconds*1000)),leg);
   onProgress(current+direction*fraction);
  }
  function followDisplay(){
   if(raf||!anchor||cancelled||hidden||video.paused)return;
   const id=legId;
   raf=requestAnimationFrame(timestamp=>{
    raf=0;if(cancelled||id!==legId||hidden||video.paused||!anchor)return;
    const elapsed=Math.max(0,(timestamp-anchor.displayTime)/1000)*(video.playbackRate||1);
    const offset=Math.min(1/videoFramesPerSecond,elapsed);
    report(anchor.mediaTime+offset);
    // A missing next video frame stops this loop after one frame of motion.
    // Only a newly presented frame can extend the interpolation interval.
    if(offset<1/videoFramesPerSecond)followDisplay();
   });
  }
  function presented(seconds,displayTime){
   if(cancelled||hidden||video.paused)return;
   if(seconds!==lastFrameTime){lastFrameTime=seconds;guardDownload();video.hidden=false;}
   report(seconds);
   if(video.requestVideoFrameCallback){anchor={mediaTime:seconds,displayTime};followDisplay();}
  }
  function followFrames(){
   const id=legId;
   if(video.requestVideoFrameCallback){
    frame=video.requestVideoFrameCallback((timestamp,metadata)=>{if(cancelled||id!==legId)return;frame=0;presented(metadata.mediaTime,Number.isFinite(metadata.expectedDisplayTime)?metadata.expectedDisplayTime:timestamp);followFrames();});
   }else{
    const tick=timestamp=>{if(cancelled||id!==legId)return;if(video.readyState>=2&&!video.paused)presented(video.currentTime,timestamp);raf=requestAnimationFrame(tick);};
    raf=requestAnimationFrame(tick);
   }
  }
  function play(){
   // Returning to a visible tab must not replay the previous clip while the
   // source or destination poster is still being decoded.
   if(hidden||cancelled||!playbackReady)return;
   if(!video.requestVideoFrameCallback&&!raf)followFrames();
   guardDownload();
   const id=++playId,leg=legId,promise=video.play();
   promise?.catch(error=>{
    if(cancelled||hidden||id!==playId)return;
    if(error?.name==='NotSupportedError')retry(leg);else fallback();
   });
  }
  function retry(id){
   if(cancelled||id!==legId)return;
   const alternate=preferred==='mp4'?'webm':'mp4';
   if(attempt++===0&&supported[alternate]){preferred=alternate;startLeg();}else fallback();
  }
  function startLeg(){
   if(cancelled)return;
   if(!supported[preferred]){fallback();return;}
   playbackReady=false;cancelDownload?.();cancelDownload=null;++legId;lastTime=lastFrameTime=-1;clearFrames();pause();
   const id=legId;
   const leg=Math.min(current,current+direction),format=preferred;
   showStill(current,decoded=>{
    if(cancelled||id!==legId)return;
    if(!decoded){fallback();return;}
    // A codec retry restarts at the source poster, so text must restart there too.
    if(attempt>0)onProgress(current);
    video.onwaiting=()=>{if(cancelled||id!==legId)return;stopTextClock();guardDownload();};
    video.onplaying=()=>{if(cancelled||id!==legId)return;guardDownload();if(!video.requestVideoFrameCallback&&!raf)followFrames();};
    video.onpause=()=>{if(cancelled||id!==legId)return;stopTextClock();clearTimeout(watchdog);watchdog=0;};
    video.onerror=()=>retry(id);
    video.onended=()=>{
     if(cancelled||id!==legId)return;
     playbackReady=false;++legId;clearFrames();pause();current=rewinding?to:current+direction;
     showStill(current,()=>{
      if(cancelled)return;
      onProgress(current);
      if(current===to){cancel();onComplete();}
      else{attempt=0;startLeg();}
     });
    };
    if(typeof Image==='function'){
     const nextPoster=new Image();nextPoster.fetchPriority='low';nextPoster.src=stationImage(rewinding?to:current+direction,portrait);
    }
    configureCache(portrait);
    cancelDownload=cache.request(rewinding?rewindVideo(format,portrait):transitionVideo(leg,direction,format,portrait),url=>{
     if(cancelled||id!==legId)return;
     video.src=url;video.load();playbackReady=true;followFrames();play();
    },()=>{if(!cancelled&&id===legId)retry(id);});
   });
  }
  // Keep the current frame when leaving the tab; resume the same media clock.
  cancel.setHidden=value=>{hidden=value;if(value){pause();clearTimeout(watchdog);}else play();};
  if(direction)startLeg();else showStill(to,()=>{if(cancelled)return;cancel();onProgress(to);onComplete();});
  return cancel;
 }
 function setHidden(value){hidden=value;cache.setHidden(value);cancelCurrent?.setHidden(value);}
 function freeze(){cancelCurrent?.();cancelPoster();video.pause();configureCache(portraitViewport(),false);}
 function destroy(){freeze();cache.destroy();}
 return {navigate,showStation,setHidden,freeze,get playing(){return playing;},destroy};
}
