// Independent clock for the early return. Input/output are seconds, not phase.
// The path and gaze are unchanged; the clock is exactly identity outside [2,10].
import {returnPose as baselinePose} from './return-before-early-look-up.mjs';
const start=2,end=10,count=2400,step=(end-start)/count;
const inner=(a,b)=>a.slice(1).reduce((s,x,i)=>s+x*b[i+1],-a[0]*b[0]),col=(m,k)=>m.map(r=>r[k]);
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
const entryShoulder=1.3,exitShoulder=3,weight=s=>smooth((s-start)/entryShoulder)*smooth((end-s)/exitShoulder);
function speedAt(s){const h=.0002,a=col(baselinePose((s-h)/24),0),b=col(baselinePose((s+h)/24),0),v=b.map((x,i)=>(x-a[i])/(2*h));return Math.sqrt(Math.max(0,inner(v,v)));}
const speeds=Array.from({length:count+1},(_,i)=>speedAt(start+i*step));
let areaWeight=0,areaWeightedSpeed=0;
for(let i=0;i<=count;i++){const trap=(i===0||i===count?.5:1)*step,w=weight(start+i*step);areaWeight+=trap*w;areaWeightedSpeed+=trap*w*speeds[i];}
const densityScale=areaWeight/areaWeightedSpeed;
const density=speeds.map((v,i)=>{const w=weight(start+i*step);return 1-w+w*densityScale*v;});
const densityDerivative=density.map((_,i)=>i===0||i===count?0:(density[i+1]-density[i-1])/(2*step));
const cumulative=[start];for(let i=1;i<=count;i++)cumulative.push(cumulative[i-1]+step*(density[i-1]+density[i])/2);
function value(points,x){while(points.length>1)points=points.slice(1).map((q,i)=>(1-x)*points[i]+x*q);return points[0];}
// Each cumulative-time interval matches its value, slope and curvature at both
// ends. Its inverse is consequently C2, rather than a linear lookup clock.
export function returnEarlyClockJet(seconds){
 if(seconds<=start||seconds>=end)return[seconds,1,0];
 let lo=0,hi=count;while(hi-lo>1){const mid=(lo+hi)>>1;if(cumulative[mid]<seconds)lo=mid;else hi=mid;}
 const a=cumulative[lo],b=cumulative[hi],c=[a,a+step*density[lo]/5,a+2*step*density[lo]/5+step*step*densityDerivative[lo]/20,b-2*step*density[hi]/5+step*step*densityDerivative[hi]/20,b-step*density[hi]/5,b],d=c.slice(1).map((q,i)=>5*(q-c[i])),dd=d.slice(1).map((q,i)=>4*(q-d[i]));
 let x=Math.max(0,Math.min(1,(seconds-a)/(b-a)));
 for(let iteration=0;iteration<5;iteration++)x=Math.max(0,Math.min(1,x-(value(c,x)-seconds)/value(d,x)));
 const first=value(d,x)/step,second=value(dd,x)/(step*step);
 return[start+(lo+x)*step,1/first,-second/(first*first*first)];
}
export const returnEarlyClock=seconds=>returnEarlyClockJet(seconds)[0];
export const returnEarlySpeedMetrics={interval:[start,end],shoulderDurations:[entryShoulder,exitShoulder],cruiseSpeed:1/densityScale,description:'Arc-length timing through the middle with C2 joins to the original clock'};
