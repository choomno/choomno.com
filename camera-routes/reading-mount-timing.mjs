// Extend the reading intervals while leaving the intervening flight clock at unit rate.
// The positive clock rate eases to 1 with zero acceleration at each flight join.
const integralSmooth=x=>x*x*x*x*(2.5+x*(-3+x));
export const readingTextDuration=1.6;
function mountTime(seconds,sourceDuration,targetDuration){
 if(seconds<=0)return 0;
 if(seconds>=targetDuration)return sourceDuration;
 if(sourceDuration===targetDuration)return seconds;
 const ramp=sourceDuration,begin=targetDuration-ramp;
 const slow=(sourceDuration-ramp/2)/(targetDuration-ramp/2);
 const elapsed=Math.max(0,seconds-begin),u=elapsed/ramp;
 return slow*seconds+(1-slow)*ramp*integralSmooth(u);
}
function dimensions(leg,target){
 const duration=leg.duration,departure=leg.departureDuration,arrival=leg.arrivalDuration;
 if(![duration,departure,arrival,target].every(x=>Number.isFinite(x)&&x>0)||departure+arrival>=duration)throw Error('Reading timing requires positive durations and a nonempty flight');
 if(target<departure||target<arrival)throw Error('Reading intervals can only be extended');
 return{duration,departure,arrival,total:duration+2*target-departure-arrival};
}
export function readingMountSourceTime(seconds,leg,target=readingTextDuration){
 const{duration,departure,arrival,total}=dimensions(leg,target);
 if(seconds<=0)return 0;
 if(seconds>=total)return duration;
 if(seconds<=target)return mountTime(seconds,departure,target);
 if(seconds>=total-target)return duration-mountTime(total-seconds,arrival,target);
 return departure+seconds-target;
}
export function wrapReadingMounts(leg,target=readingTextDuration){
 const{duration,departure,arrival,total}=dimensions(leg,target);
 if(departure===target&&arrival===target)return leg;
 if(typeof leg.pose!=='function')throw Error('Reading timing requires a camera pose function');
 return{...leg,duration:total,departureDuration:target,arrivalDuration:target,
  pose:progress=>leg.pose(readingMountSourceTime(progress*total,leg,target)/duration)};
}
