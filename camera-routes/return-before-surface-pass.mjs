// Unified Fermi-coordinate return: broad descent, a close edge-floor pass,
// and a continuous climbing turn toward the first reading station.
import {returnPose as previousPose} from './return-before-unified-floor.mjs';
import {readingFrames} from './camera-baseline.mjs';
const ip=(a,b)=>a.slice(1).reduce((s,x,i)=>s+x*b[i+1],-a[0]*b[0]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]),scale=(a,s)=>a.map(x=>x*s),col=(m,k)=>m.map(r=>r[k]);
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
const ja=(a,b)=>a.map((x,i)=>x+b[i]),js=(a,s)=>a.map(x=>x*s),jm=(a,b)=>[a[0]*b[0],a[1]*b[0]+a[0]*b[1],a[2]*b[0]+2*a[1]*b[1]+a[0]*b[2]],ji=a=>[1/a[0],-a[1]/a[0]**2,2*a[1]**2/a[0]**3-a[2]/a[0]**2],jd=(a,b)=>jm(a,ji(b));
const sinh=a=>[Math.sinh(a[0]),Math.cosh(a[0])*a[1],Math.sinh(a[0])*a[1]**2+Math.cosh(a[0])*a[2]],cosh=a=>[Math.cosh(a[0]),Math.sinh(a[0])*a[1],Math.cosh(a[0])*a[1]**2+Math.sinh(a[0])*a[2]],sqrt=a=>[Math.sqrt(a[0]),a[1]/(2*Math.sqrt(a[0])),a[2]/(2*Math.sqrt(a[0]))-a[1]**2/(4*a[0]**1.5)];
const A=[2.8025170768881464,2.6180339887498945,0,0],T=[0,0,0,1],N=[-2.618033988749893,-2.8025170768881456,0,0],Y=[0,0,1,0],start=readingFrames[3],target=readingFrames[0],micro=.9,sideDistance=.012,duration=34,finish=duration-micro;
function sideFrame(m,d){const c=Math.cosh(d),s=Math.sinh(d);return m.map(r=>[c*r[0]+s*r[1],s*r[0]+c*r[1],r[2],r[3]]);}
function finiteJets(fn,t,h=.0005){const a=fn(t-h),p=fn(t),b=fn(t+h);return p.map((x,i)=>[x,(b[i]-a[i])/(2*h),(b[i]-2*x+a[i])/(h*h)]);}
function oldFermi(t){const p=col(previousPose(t/24),0);return[Math.asinh(ip(p,N)),Math.atanh(ip(p,T)/-ip(p,A))];}
const initial=finiteJets(oldFermi,2),lastRho=2.7016114545681966,lastS=.6657126775661373;
const rhoNodes=[[2,...initial[0]],[4,3.05,-.5,0],[12.5,.05,0,0],[15,0.05,0,0],[16.5,0.05,0,0],[17.25,0.04,0,0],[18,0.055,0.08,0],[18.7,0.13,0.14,0],[22,0.38,0.1,0],[27,1.2,0.4,0],[finish,lastRho,0,0]];
const sNodes=[[2,...initial[1]],[4,-.20,.015,0],[12.5,1.0093841552734375,.2867443847656249,-.025048828124999964],[15,1.7,0.2799999999999997,0],[16.5,2.12,0.28000000000000025,2.942091015256665e-15],[17.25,2.28,0.18,-0.2],[18,2.4,0.14,-0.1],[18.7,2.46,0,-0.35],[22,1.85,-0.2,0],[27,1.05,-0.12,0],[finish,lastS,0,0]];
function bezier(p,t){while(p.length>1)p=p.slice(1).map((q,i)=>ja(jm(p[i],ja([1,0,0],js(t,-1))),jm(q,t)));return p[0];}
function hermite(a,b,ta,tb,t){const h=tb-ta;return a.map(([p,v,acc],i)=>{const[q,w,dd]=b[i],c=[p,p+h*v/5,p+2*h*v/5+h*h*acc/20,q-2*h*w/5+h*h*dd/20,q-h*w/5,q];return bezier(c.map(x=>[x,0,0]),[(t-ta)/h,1/h,0]);});}
function scalar(nodes,t){let i=0;while(i<nodes.length-2&&t>nodes[i+1][0])i++;const value=hermite([nodes[i].slice(1)],[nodes[i+1].slice(1)],nodes[i][0],nodes[i+1][0],t)[0];if(nodes===rhoNodes&&t>=27&&t<=finish){const h=finish-27,u=(t-27)/h,c=4.5;return value.map((x,k)=>x+c*[u**3*(1-u)**3,(3*u**2-12*u**3+15*u**4-6*u**5)/h,(6*u-36*u**2+60*u**3-30*u**4)/h**2][k]);}return value;}
function fermiJets(t){const r=scalar(rhoNodes,t),s=scalar(sNodes,t);return A.map((x,i)=>ja(jm(cosh(r),ja(js(cosh(s),x),js(sinh(s),T[i]))),js(sinh(r),N[i])));}

const toK=p=>p.slice(1).map(x=>x/p[0]);
function baseK(t){const p=fermiJets(t);return p.slice(1).map(x=>jd(x,p[0]));}
function desiredK(m,v,a){const p=col(m,0);return p.slice(1).map((_,i)=>jd([p[i+1],v[i+1],a[i+1]],[p[0],v[0],a[0]]));}
const initialK=finiteJets(t=>toK(col(previousPose(t/24),0)),2),initialOffset=initialK.map((j,i)=>j.map((x,k)=>x-baseK(2)[i][k])),endFrame=sideFrame(target,-sideDistance),endEye=col(endFrame,0),endSpeed=sideDistance/micro,endDesired=desiredK(endFrame,scale(col(endFrame,1),endSpeed),scale(endEye,endSpeed**2)),endOffset=endDesired.map((j,i)=>j.map((x,k)=>x-baseK(finish)[i][k]));
function offset(t){if(t<5)return hermite(initialOffset,[[0,0,0],[0,0,0],[0,0,0]],2,5,t);if(t>30.5)return hermite([[0,0,0],[0,0,0],[0,0,0]],endOffset,30.5,finish,t);return[[0,0,0],[0,0,0],[0,0,0]];}
export function returnGeometry(seconds){const k=baseK(seconds),o=offset(seconds),v=k.map((x,i)=>ja(x,o[i])),den=sqrt(ja([1,0,0],js(v.reduce((s,x)=>ja(s,jm(x,x)),[0,0,0]),-1))),jets=[[1,0,0],...v].map(x=>jd(x,den));return{eye:jets.map(x=>x[0]),velocity:jets.map(x=>x[1]),acceleration:jets.map(x=>x[2]),rho:scalar(rhoNodes,seconds),s:scalar(sNodes,seconds)};}
function transport(m,p){const q=col(m,0),axes=[1,2,3].map(k=>add(col(m,k),add(q,p),ip(col(m,k),p)/(1-ip(q,p))));return p.map((x,i)=>[x,...axes.map(v=>v[i])]);}
function basis(t){const{eye}=returnGeometry(t),s=scalar(sNodes,t)[0],r=scalar(rhoNodes,t)[0],E=A.map((x,i)=>Math.cosh(s)*x+Math.sinh(s)*T[i]);let right=add(Y,eye,ip(Y,eye));right=scale(right,1/Math.sqrt(ip(right,right)));let forward=A.map((x,i)=>Math.sinh(s)*x+Math.cosh(s)*T[i]);forward=add(forward,eye,ip(forward,eye));forward=add(forward,right,-ip(forward,right));forward=scale(forward,1/Math.sqrt(ip(forward,forward)));let up=E.map((x,i)=>Math.sinh(r)*x+Math.cosh(r)*N[i]);up=add(up,eye,ip(up,eye));up=add(up,right,-ip(up,right));up=add(up,forward,-ip(up,forward));up=scale(up,1/Math.sqrt(ip(up,up)));return{eye,right,forward,up};}
const floorPitch=-Math.PI/24;
function approachAngles(t){const b=basis(t),m=transport(previousPose(t/24),b.eye),f=col(m,3);return[Math.atan2(ip(f,b.up),ip(f,b.forward)),Math.asin(Math.max(-1,Math.min(1,ip(f,b.right))))];}
const approachStart=finiteJets(approachAngles,2);
const approachPitchNodes=[[2,...approachStart[0]],[3,-1.55,.10,.08],[12.5,floorPitch,0,0]];
function approachGaze(t){return[scalar(approachPitchNodes,t)[0],t<4?hermite([approachStart[1]],[[0,0,0]],2,4,t)[0][0]:0];}
function referenceFrame(b,F){
 let R=add(b.right,F,-ip(b.right,F));R=scale(R,1/Math.sqrt(ip(R,R)));
 const rest=v=>v.slice(1).map((x,i)=>x-b.eye[i+1]*v[0]/(1+b.eye[0]));
 const f=rest(F),r=rest(R),u=[f[1]*r[2]-f[2]*r[1],f[2]*r[0]-f[0]*r[2],f[0]*r[1]-f[1]*r[0]],ut=dot(b.eye.slice(1),u),U=[ut,...u.map((x,i)=>x+b.eye[i+1]*ut/(1+b.eye[0]))];
 return b.eye.map((x,i)=>[x,R[i],U[i],F[i]]);
}
function oldBank(t){const b=basis(t),m=transport(previousPose(t/24),b.eye),ref=referenceFrame(b,col(m,3));return Math.atan2(-ip(col(m,2),col(ref,1)),ip(col(m,1),col(ref,1)));}
const approachBank=finiteJets(t=>[oldBank(t)],2)[0];
// A broad lead into the climbing turn avoids waiting for its spatial apex.
const climbPitchNodes=[[15,floorPitch,0,0],[17.2,.55,.60,0],[18.8,1.6,.45,-.20],[20.8,2.2,.15,-.08],[22.6,2.42,.08,0],[27,2.85,.12,0]];
function finalPitch(t){const b=basis(t),m=transport(endFrame,b.eye);let angle=Math.atan2(ip(col(m,3),b.up),ip(col(m,3),b.forward));while(angle<Math.PI)angle+=2*Math.PI;return angle;}
const finalPitchEnd=finiteJets(t=>[finalPitch(t)],finish)[0];
function pitch(t){if(t<12.5)return approachGaze(t)[0];if(t<15)return floorPitch;if(t<27)return scalar(climbPitchNodes,t)[0];return hermite([[2.85,.12,0]],[finalPitchEnd],27,finish,t)[0][0];}
function frameAt(t){
 const b=basis(t),p=pitch(t),l=t<12.5?approachGaze(t)[1]:0;
 const F=add(scale(add(scale(b.forward,Math.cos(p)),b.up,Math.sin(p)),Math.cos(l)),b.right,Math.sin(l));
 const m=referenceFrame(b,F);
 if(t>=8)return m;
 const bank=hermite([approachBank],[[0,0,0]],2,8,t)[0][0],c=Math.cos(bank),s=Math.sin(bank);
 return m.map(row=>[row[0],c*row[1]+s*row[2],-s*row[1]+c*row[2],row[3]]);
}
function microDistance(t){return bezier([[0,0,0],[0,0,0],[0,0,0],[.6*sideDistance,0,0],[.8*sideDistance,0,0],[sideDistance,0,0]],[t,0,0])[0];}
export const returnDuration=duration,returnDepartureDuration=micro,returnArrivalDuration=micro,returnReadingMount={departureDuration:micro,arrivalDuration:micro,sideDistance};
export function returnPose(t){const sec=t*duration;if(sec<=2)return previousPose(sec/24);if(sec>=duration)return target.map(r=>r.slice());if(sec>finish)return sideFrame(target,-microDistance((duration-sec)/micro));return frameAt(sec);}
export const returnMetrics={description:'Unified close edge-floor passage followed by a continuous climbing return',readingMount:returnReadingMount,tubeRadius:.025,floorOffset:.05};
export const returnCompositionTimes=[{seconds:16,kind:'floor',vertices:[13,15]},{seconds:22,kind:'cusp',index:15}];
export const returnCompositionKeyframes=returnCompositionTimes.map(x=>({...x,frame:returnPose(x.seconds/duration)}));

