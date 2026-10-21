// Approved camera flights, including the reading departure and arrival intervals.
import {readingPose,readingPhase,routeJoinPhases} from './camera-baseline.mjs';
import {returnSourcePose} from './return-source-flight.mjs';
import {fastReturnDuration,fastReturnMountDuration,fastReturnClock} from './return-fast-clock-study.mjs';
import {wrapReadingMounts} from './reading-mount-timing.mjs';
const textSlideDuration=1600,travelDuration=4800,transitionDuration=8000;
const departure=t=>t*t*t*(5+t*(-6.25+2.25*t));
const integral=t=>t*t*t*t*(2.5+t*(-3+t));
function bridge(u,side){
 const ramp=.2,join=1.25*side*travelDuration/textSlideDuration;
 const area=u<ramp?ramp*integral(u/ramp):u>1-ramp?1-ramp-ramp*integral((1-u)/ramp):u-ramp/2;
 return side+join*u+(1-2*side-join)*area/(1-ramp);
}
function transitionProgress(elapsed,leg){
 const time=Math.max(0,Math.min(transitionDuration,elapsed));
 const side=routeJoinPhases[2*leg]/readingPhase(1)-leg;
 if(time<=textSlideDuration)return side*departure(time/textSlideDuration);
 if(time<=textSlideDuration+travelDuration)return bridge((time-textSlideDuration)/travelDuration,side);
 return 1-side*departure((transitionDuration-time)/textSlideDuration);
}
const outerPose=leg=>t=>readingPose(readingPhase(leg+transitionProgress(Math.max(0,Math.min(1,t))*transitionDuration,leg)));
import * as proposed from './inertial-gallery.mjs';
const sourceLegs=[
 {id:'leg-0',label:'1 · Name → Background',duration:8,departureDuration:1.6,arrivalDuration:1.6,pose:outerPose(0)},
 {id:'leg-1',label:'2 · Background → Research',duration:proposed.galleryDuration,departureDuration:proposed.galleryDepartureDuration??1.2,arrivalDuration:proposed.galleryArrivalDuration??1.2,pose:proposed.galleryPose},
 {id:'leg-2',label:'3 · Research → Elsewhere',duration:8,departureDuration:1.6,arrivalDuration:1.6,pose:outerPose(2)},
 {id:'return',label:'4 · Elsewhere → Name',duration:fastReturnDuration,departureDuration:fastReturnMountDuration,arrivalDuration:fastReturnMountDuration,pose:t=>returnSourcePose(fastReturnClock(t*fastReturnDuration))}
];
export const flightLegs=sourceLegs.map(leg=>wrapReadingMounts(leg));
for(const leg of flightLegs)if(typeof leg.pose!=='function'||!(leg.duration>0))throw Error(`Invalid camera route ${leg.id}`);
export default flightLegs;
