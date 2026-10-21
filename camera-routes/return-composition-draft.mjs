// Preserve the approved flight, with a local floor pass on its outgoing cylinder.
import {returnPose as baselinePose,returnDuration,returnCompositionTimes as baselineTimes,returnMetrics as baselineMetrics} from './return-before-surface-pass.mjs';
import {secondCylinderGeometry,secondCylinderFloorFrame,secondCylinderTimes} from './return-second-cylinder-study.mjs';
import {candidatePitch,pitchNodes} from './second-cylinder-pitch-study.mjs';
export {returnDuration,returnDepartureDuration,returnArrivalDuration,returnReadingMount} from './return-before-surface-pass.mjs';
export {secondCylinderGeometry as returnGeometry} from './return-second-cylinder-study.mjs';
const inner=(a,b)=>a.slice(1).reduce((s,x,i)=>s+x*b[i+1],-a[0]*b[0]),column=(m,k)=>m.map(row=>row[k]),add=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]),scale=(v,s)=>v.map(x=>x*s);
function transport(frame,eye){const source=column(frame,0),sum=add(source,eye),axes=[1,2,3].map(k=>{const axis=column(frame,k);return add(axis,sum,inner(axis,eye)/(1-inner(source,eye)));});return eye.map((x,i)=>[x,...axes.map(v=>v[i])]);}
const cameraTimes={start:14.0,arrive:19.8,leave:20.5,end:pitchNodes.at(-1)[0]};
export function returnPose(progress){
 const seconds=progress*returnDuration;
 if(seconds<=cameraTimes.start||seconds>=cameraTimes.end)return baselinePose(progress);
 const geometry=secondCylinderGeometry(seconds),base=transport(baselinePose(progress),geometry.eye),floor=secondCylinderFloorFrame(geometry.eye,0);
 // Prescribe one pitch curve in the outgoing cylinder frame, retaining the
 // orthonormal transported axes rather than blending two moving orientations.
 const right=column(base,1),up=column(base,2),forward=column(base,3),basePitch=Math.atan2(inner(forward,column(floor,2)),inner(forward,column(floor,3))),angle=candidatePitch(seconds)-basePitch,c=Math.cos(angle),s=Math.sin(angle),F=add(scale(forward,c),up,s),U=add(scale(up,c),forward,-s);
 return geometry.eye.map((x,i)=>[x,right[i],U[i],F[i]]);
}
export const returnMetrics={...baselineMetrics,description:'Direction-aware turn onto the outgoing second cylinder, then a continuous upward pitch',secondCylinder:secondCylinderTimes,camera:cameraTimes,pitchNodes};
export const returnCompositionTimes=[{seconds:19.5,kind:'floor',cell:1,vertices:[9,11]},{seconds:23,kind:'cusp',index:15}];
export const returnCompositionKeyframes=returnCompositionTimes.map(x=>({...x,frame:returnPose(x.seconds/returnDuration)}));
