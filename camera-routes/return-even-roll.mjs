// Redistribute the early roll while preserving the eye and viewing direction.
import {returnPose as referencePose} from './return-before-continuous-flight.mjs';
const start=2,end=10,Y=[0,0,1,0];
const inner=(a,b)=>a.slice(1).reduce((s,x,i)=>s+x*b[i+1],-a[0]*b[0]),col=(m,k)=>m.map(r=>r[k]);
function rollAngle(frame){
 const eye=col(frame,0),forward=col(frame,3);
 let right=Y.map((x,i)=>x+inner(Y,eye)*eye[i]-inner(Y,forward)*forward[i]);
 const length=Math.sqrt(inner(right,right));right=right.map(x=>x/length);
 return Math.atan2(-inner(col(frame,2),right),inner(col(frame,1),right));
}
function jet(t){const h=.001,a=rollAngle(referencePose((t-h)/24)),b=rollAngle(referencePose(t/24)),c=rollAngle(referencePose((t+h)/24));return[b,(c-a)/(2*h),(c-2*b+a)/(h*h)];}
const [a,v,acc]=jet(start),[b,w,dd]=[0,0,0],entryEnd=3.5,exitStart=6;
const entrySpan=entryEnd-start,exitSpan=end-exitStart,middleSpan=exitStart-entryEnd;
const rate=(b-a-entrySpan*v/2-entrySpan*entrySpan*acc/10)/(middleSpan+(entrySpan+exitSpan)/2);
const entryRates=[v,v+entrySpan*acc/5,v+2*entrySpan*acc/5,rate,rate,rate],exitRates=[rate,rate,rate,0,0,0];
function value(points,x){while(points.length>1)points=points.slice(1).map((q,i)=>(1-x)*points[i]+x*q);return points[0];}
function integral(points,x){const controls=[0];for(const q of points)controls.push(controls.at(-1)+q/points.length);return value(controls,x);}
const entryArea=entrySpan*integral(entryRates,1);
function desiredRoll(t){
 if(t<entryEnd)return a+entrySpan*integral(entryRates,(t-start)/entrySpan);
 if(t<exitStart)return a+entryArea+rate*(t-entryEnd);
 return a+entryArea+rate*middleSpan+exitSpan*integral(exitRates,(t-exitStart)/exitSpan);
}
export function evenReturnRoll(frame,seconds){
 if(seconds<=start||seconds>=end)return frame;
 const desired=desiredRoll(seconds),difference=desired-rollAngle(frame),c=Math.cos(difference),s=Math.sin(difference);
 return frame.map(row=>[row[0],c*row[1]+s*row[2],-s*row[1]+c*row[2],row[3]]);
}
export const returnRollMetrics={interval:[start,end],constantRateInterval:[entryEnd,exitStart],constantRate:rate,startJet:[a,v,acc],endJet:[b,w,dd]};
