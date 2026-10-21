import {flightLegs,flightPose} from './flight-path.js';
import {readingFrames,readingPhase} from './camera-path.js?v=final-flight-11';
import {dot,multiply} from './intrinsic.js';

const leg=flightLegs[3],endpoint=flightPose(3,1);
const column=(frame,index)=>frame.map(row=>row[index]);
// The return ends at a deck-equivalent lift of the opening station. Express
// its final reading approach in that station's canonical frame.
export function returnTextPose(phase){
 const remaining=Math.max(0,phase/readingPhase(3))*leg.duration;
 if(remaining>leg.arrivalDuration+1e-10)return null;
 const camera=flightPose(3,Math.max(0,Math.min(1,1-remaining/leg.duration)));
 const relative=endpoint.map((_,i)=>camera[0].map((_,j)=>(i===0?-1:1)*dot(column(endpoint,i),column(camera,j))));
 return multiply(readingFrames[0],relative);
}
