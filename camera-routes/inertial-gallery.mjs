// Preview study: a hypercycle with concurrent horizontal travel and gradual rise.
import {readingFrames} from './camera-baseline.mjs';
import {sideFrame,readingSideDistance} from './reading-sidestep.mjs';
const generator=[[11.281152949374526, -9.60436890357368, -4.534567884457025, -3.6685424806725857], [2.267283942228512, -2.4270509831248424, -0.5000000000000001, 5.551115123125783e-17], [7.33708496134517, -6.3541019662496865, -2.4270509831248406, -2.9270509831248424], [8.20311036512961, -6.854101966249684, -3.9270509831248424, -2.4270509831248424]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),ld=(a,b)=>dot(a.slice(1),b.slice(1))-a[0]*b[0];
const add=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]),scale=(v,s)=>v.map(x=>x*s),unit=v=>scale(v,1/Math.hypot(...v));
const col=(m,k)=>m.map(r=>r[k]),multiply=(a,b)=>a.map(row=>b[0].map((_,j)=>row.reduce((s,x,k)=>s+x*b[k][j],0)));
const identity=()=>Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j)));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Parabolic powers are quadratic, avoiding drift from repeated products.
const power=14,I=identity(),nil=generator.map((r,i)=>r.map((x,j)=>x-I[i][j])),nil2=multiply(nil,nil);
const lift=I.map((r,i)=>r.map((x,j)=>x+power*nil[i][j]+power*(power-1)/2*nil2[i][j]));
const initial=readingFrames[1],final=multiply(lift,readingFrames[2]);
const departureFrame=sideFrame(initial,readingSideDistance),arrivalFrame=sideFrame(final,-readingSideDistance);
const [E,R,U,F]=[0,1,2,3].map(k=>col(initial,k)),N=add(E,F,-1);
function upper(p){const d=-ld(p,N);return[ld(p,R)/d,ld(p,U)/d,1/d];}
const origin=upper(col(departureFrame,0)),target=upper(col(arrivalFrame,0)),delta=add(target,origin,-1),logRise=Math.log(target[2]/origin[2]),bearing=unit(delta.slice(0,2)),D=add(scale(R,bearing[0]),U,bearing[1]);
function fromUpper([x,y,z]){const a=(1+x*x+y*y+z*z)/(2*z),b=(1-x*x-y*y-z*z)/(2*z);return add(add(add(scale(E,a),F,b),R,x/z),U,y/z);}
const rest=(eye,v)=>v.slice(1).map((x,i)=>x-eye[i+1]*v[0]/(1+eye[0]));
function basis(s){
 const z=origin[2]*Math.exp(logRise*s),fraction=(z-origin[2])/(target[2]-origin[2]);
 const coordinates=[origin[0]+delta[0]*fraction,origin[1]+delta[1]*fraction,z];
 // Ease the initial tangent from forward/up into the original gallery orbit.
 const join=.18;
 if(s<join){
  const base=[delta[0]*origin[2]*logRise/(target[2]-origin[2]),delta[1]*origin[2]*logRise/(target[2]-origin[2]),origin[2]*logRise];
  const desired=[0,.65,-3],weight=s*(1-s/join)**3;
  for(let i=0;i<3;i++)coordinates[i]+=(desired[i]-base[i])*weight;
 }
 const eye=fromUpper(coordinates),d=-ld(eye,N);
 const up=add(eye,N,-1/d),forward=add(D,N,ld(D,eye)/d);
 const rr=cross(rest(eye,up),rest(eye,forward)),rt=dot(eye.slice(1),rr),right=[rt,...rr.map((x,i)=>x+eye[i+1]*rt/(1+eye[0]))];
 const pitch=6*Math.PI/180,c=Math.cos(pitch),sn=Math.sin(pitch);
 return eye.map((x,i)=>[x,right[i],c*up[i]-sn*forward[i],sn*up[i]+c*forward[i]]);
}
function quaternion(m){let tr=m[0][0]+m[1][1]+m[2][2],q;
 if(tr>0){let s=2*Math.sqrt(1+tr);q=[s/4,(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s];}
 else{let i=0;if(m[1][1]>m[i][i])i=1;if(m[2][2]>m[i][i])i=2;let j=(i+1)%3,k=(i+2)%3,s=2*Math.sqrt(1+m[i][i]-m[j][j]-m[k][k]);q=[(m[k][j]-m[j][k])/s,0,0,0];q[i+1]=s/4;q[j+1]=(m[j][i]+m[i][j])/s;q[k+1]=(m[k][i]+m[i][k])/s;}return unit(q);
}
const relative=(a,b)=>quaternion([1,2,3].map(i=>[1,2,3].map(j=>ld(col(a,i),col(b,j)))));
function slerp(a,b,t){let c=dot(a,b);if(c<0){b=scale(b,-1);c=-c;}const angle=Math.acos(Math.min(1,c));return angle<1e-8?unit(add(scale(a,1-t),b,t)):add(scale(a,Math.sin((1-t)*angle)/Math.sin(angle)),b,Math.sin(t*angle)/Math.sin(angle));}
const q0=relative(basis(0),departureFrame),q1=relative(basis(1),arrivalFrame),qI=[1,0,0,0];
const qmul=(a,b)=>[a[0]*b[0]-dot(a.slice(1),b.slice(1)),...add(add(scale(b.slice(1),a[0]),a.slice(1),b[0]),cross(a.slice(1),b.slice(1)))];
const endTwist=unit([q1[0],0,0,q1[3]]),endSwing=qmul(q1,[endTwist[0],0,0,-endTwist[3]]);
function arrivalCorrection(s,elapsed){
 const turn=smooth((elapsed-4.9)/3.7),bank=smooth((elapsed-6.0)/2.8);
 return qmul(slerp(qI,endSwing,turn),slerp(qI,endTwist,bank));
}
function rotate(m,q,bank){const[w,x,y,z]=q,A=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
 const c=Math.cos(bank),s=Math.sin(bank),B=[[c,-s,0],[s,c,0],[0,0,1]],rot=A.map(r=>B[0].map((_,j)=>dot(r,B.map(v=>v[j]))));
 return m.map(row=>[row[0],...rot[0].map((_,j)=>row.slice(1).reduce((sum,v,k)=>sum+v*rot[k][j],0))]);
}
export function inertialClock(t){t=Math.max(0,Math.min(1,t));const r=.22,integral=x=>2.5*x**4-3*x**5+x**6;if(t<r)return r*integral(t/r)/(1-r);if(t>1-r)return 1-r*integral((1-t)/r)/(1-r);return(t-r/2)/(1-r);}
export const galleryDepartureDuration=1.6,galleryPanDuration=2.5,galleryArrivalDuration=1.6,galleryFlightDuration=6.3;
export const galleryDuration=galleryDepartureDuration+galleryPanDuration+galleryFlightDuration+galleryArrivalDuration;
export const galleryMetrics={baseline:'Original18-second hypercycle',pitchDegrees:6,maximumBankDegrees:0,trimmedRepetitions:2,liftPower:power,origin,target,pan:[galleryDepartureDuration,galleryDepartureDuration+galleryPanDuration],departureTangent:[0,.65,-3],departureJoin:.18,exitSwingSeconds:[6.5,10.2],exitLevelSeconds:[7.6,10.4],description:'Forward/up departure into the gallery, then a turn followed by leveling and lateral text arrival',horizontalFraction:Math.hypot(...delta.slice(0,2))/Math.hypot(...delta)};
export function galleryStage(t){const sec=Math.max(0,Math.min(1,t))*galleryDuration;return sec<galleryDepartureDuration?'text-departure':sec<galleryDepartureDuration+galleryPanDuration?'gallery-pan':sec<galleryDuration-galleryArrivalDuration?'flight':'text-arrival';}
// One progress clock spans the reveal and flight; there is no new start at the pan boundary.
export function galleryTravelClock(seconds){
 const duration=galleryPanDuration+galleryFlightDuration,t=Math.max(0,Math.min(duration,seconds));
 const rampIn=4.2,rampOut=2.2,area=duration-(rampIn+rampOut)/2;
 const integral=x=>2.5*x**4-3*x**5+x**6;
 if(t<rampIn)return rampIn*integral(t/rampIn)/area;
 if(t>duration-rampOut)return 1-rampOut*integral((duration-t)/rampOut)/area;
 return(t-rampIn/2)/area;
}
export function galleryPose(t){
 if(t<=0)return initial.map(r=>r.slice());if(t>=1)return final.map(r=>r.slice());
 const sec=t*galleryDuration;
 if(sec<galleryDepartureDuration)return sideFrame(initial,readingSideDistance*smooth(sec/galleryDepartureDuration));
 if(sec>=galleryDuration-galleryArrivalDuration)return sideFrame(final,-readingSideDistance*(1-smooth((sec-(galleryDuration-galleryArrivalDuration))/galleryArrivalDuration)));
 const elapsed=sec-galleryDepartureDuration,s=galleryTravelClock(elapsed),pan=smooth(elapsed/galleryPanDuration);
 const correction=elapsed<galleryPanDuration?slerp(q0,qI,pan):arrivalCorrection(s,elapsed);
 const bank=0*Math.sin(2*Math.PI*s)*smooth(s/.12)*smooth((1-s)/.12)*pan;
 return rotate(basis(s),correction,bank);
}
