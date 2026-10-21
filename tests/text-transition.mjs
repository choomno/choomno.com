import assert from 'node:assert/strict';
import {transitionProgress,textSlideDuration,transitionDurationForLeg} from '../transition-timing.js';
import {readingPhase,routeJoinPhases} from '../camera-path.js';
import {projectReadingPlaneWithDepth} from '../projection.js';
import {videoFramesPerSecond as fps} from '../media-settings.js';
const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const pixel=(m,x,y)=>[(m[0]*x+m[4]*y+m[12])/(m[3]*x+m[7]*y+1),(m[1]*x+m[5]*y+m[13])/(m[3]*x+m[7]*y+1)];
for(let leg=0;leg<3;leg++){
 const transitionDuration=transitionDurationForLeg(leg);
 const travelDuration=transitionDuration-2*textSlideDuration;
 const side=routeJoinPhases[2*leg]/readingPhase(1)-leg;
 close(transitionProgress(0,leg),0);close(transitionProgress(transitionDuration,leg),1);
 close(transitionProgress(textSlideDuration,leg),side);
 close(transitionProgress(textSlideDuration+travelDuration,leg),1-side);
 let previous=-1;
 for(let time=0;time<=transitionDuration;time+=10){
  const progress=transitionProgress(time,leg);assert.ok(progress>=previous);previous=progress;
  close(progress,1-transitionProgress(transitionDuration-time,leg));
 }
 for(const time of [0,transitionDuration]){
  const center=transitionProgress(time,leg),left=transitionProgress(time-1,leg),right=transitionProgress(time+1,leg);
  assert.ok(Math.abs(right-left)<1e-8,'Only the reading stops ease to rest');
  assert.ok(Math.abs(right-2*center+left)<1e-8,'Acceleration tends to zero at reading stops');
 }
 if(leg===1){
  // The saved gallery uses a quintic lateral displacement, unlike the outer
  // legs' nonzero-speed handoff. Its middle phase is only a hidden text clock.
  for(const u of [0,.1,.25,.5,.75,.9,1]){
   const eased=u*u*u*(10+u*(-15+6*u));
   close(transitionProgress(u*textSlideDuration,leg),side*eased);
   close(transitionProgress(transitionDuration-u*textSlideDuration,leg),1-side*eased);
  }
 }
 for(const time of leg===1?[]:[textSlideDuration,textSlideDuration+travelDuration]){
  const center=transitionProgress(time,leg),left=transitionProgress(time-1,leg),right=transitionProgress(time+1,leg);
  const speed=1.25*side/textSlideDuration;
  close(center-left,speed,1e-10);close(right-center,speed,1e-10);
  assert.ok(right>center&&center>left,'Sidesteps join travel without stopping');
  assert.ok(Math.abs(right-2*center+left)<1e-10,'Acceleration is continuous at both handoffs');
 }

}
// At the encoded frame rate, the final lateral approach must visibly slide across the viewport
// for long enough to read as motion. It must already be opaque at the edge,
// rather than appearing through an opacity/near-clip change in the middle.
let minimumVisible=Infinity,maximumStep=0;
for(const [vw,vh,width,height] of [[1440,900,620,330],[625,780,360,360],[390,844,343.2,400],[320,568,281.6,390]]){
 for(let leg=0;leg<3;leg++)for(const direction of [1,-1]){
  const transitionDuration=transitionDurationForLeg(leg),travelDuration=transitionDuration-2*textSlideDuration;
  const station=direction===1?leg+1:leg;
  let first=null,last=null;
  for(let t=textSlideDuration+travelDuration;t<=transitionDuration+1;t+=1000/fps){
   const fraction=transitionProgress(Math.min(t,transitionDuration),leg);
   const phase=readingPhase(leg+(direction===1?fraction:1-fraction));
   const projection=projectReadingPlaneWithDepth(phase,readingPhase(station),width,height,vw,vh);
   assert.ok(projection.matrix,'The entire lateral arrival stays in front of the camera');
   const corners=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>pixel(projection.matrix,x,y));
   const left=Math.min(...corners.map(p=>p[0])),right=Math.max(...corners.map(p=>p[0]));
   if(left>=vw||right<=0)continue;
   assert.equal(projection.nearOpacity,1,'Text is fully opaque as it slides into view');
   if(first===null){first=t;assert.ok(direction===1?left>vw-45:right<45,'The text enters through the side of the viewport');}
   const center=pixel(projection.matrix,width/2,height/2);
   if(last){const displacement=Math.hypot(center[0]-last[0],center[1]-last[1]);maximumStep=Math.max(maximumStep,displacement);assert.ok(displacement<55*30/fps,'Text must not jump between encoded frames');}
   last=center;
  }
  assert.ok(first!==null);minimumVisible=Math.min(minimumVisible,transitionDuration-first);
  assert.ok(transitionDuration-first>600,'The visible approach takes at least 0.6 seconds');
 }
}
console.log(`Text transition checks passed: reversible per-leg reading timelines, fully opaque edge entry, at least ${minimumVisible.toFixed(0)}ms visible approach, at most ${maximumStep.toFixed(1)}px per frame at ${fps}fps.`);
