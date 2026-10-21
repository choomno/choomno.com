// Edge-following return study with independent early timing and gradual look-up.
import {returnPose as previousPose} from './return-composition-before-edge-redesign.mjs';
import {readingFrames} from './camera-baseline.mjs';
import {returnEarlyClock} from './return-early-speed.mjs';
const ip=(a,b)=>a.slice(1).reduce((s,x,i)=>s+x*b[i+1],-a[0]*b[0]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]),scale=(a,s)=>a.map(x=>x*s),col=(m,k)=>m.map(r=>r[k]);
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const ja=(a,b)=>a.map((x,i)=>x+b[i]),js=(a,s)=>a.map(x=>x*s),jm=(a,b)=>[a[0]*b[0],a[1]*b[0]+a[0]*b[1],a[2]*b[0]+2*a[1]*b[1]+a[0]*b[2]],ji=a=>[1/a[0],-a[1]/a[0]**2,2*a[1]**2/a[0]**3-a[2]/a[0]**2],jd=(a,b)=>jm(a,ji(b));
const sinh=a=>[Math.sinh(a[0]),Math.cosh(a[0])*a[1],Math.sinh(a[0])*a[1]**2+Math.cosh(a[0])*a[2]],cosh=a=>[Math.cosh(a[0]),Math.sinh(a[0])*a[1],Math.cosh(a[0])*a[1]**2+Math.sinh(a[0])*a[2]],sqrt=a=>[Math.sqrt(a[0]),a[1]/(2*Math.sqrt(a[0])),a[2]/(2*Math.sqrt(a[0]))-a[1]**2/(4*a[0]**1.5)];
const start=readingFrames[3],target=readingFrames[0],sideDistance=.012,micro=.9,finish=23.1;
function sideFrame(m,d){let c=Math.cosh(d),s=Math.sinh(d);return m.map(r=>[c*r[0]+s*r[1],s*r[0]+c*r[1],r[2],r[3]]);}
const endFrame=sideFrame(target,-sideDistance),endEye=col(endFrame,0),endV=scale(col(endFrame,1),sideDistance/micro),endA=scale(endEye,(sideDistance/micro)**2);
function kleinJets(p,v,a){return p.slice(1).map((_,i)=>jd([p[i+1],v[i+1],a[i+1]],[p[0],v[0],a[0]]));}
const toK=p=>p.slice(1).map(x=>x/p[0]);
function oldK(t){return toK(col(previousPose(t/24),0));}
function finiteJets(fn,t,h=.0005){let a=fn(t-h),p=fn(t),b=fn(t+h);return p.map((x,i)=>[x,(b[i]-a[i])/(2*h),(b[i]-2*x+a[i])/(h*h)]);}
const A=[2.8025170768881464,2.6180339887498945,0,0],T=[0,0,0,1],N=[-2.618033988749893,-2.8025170768881456,0,0],rho=.25,edgeStart=11,edgeEnd=15.5,sStart=.3,speedS=1.7/4.5;
function edgeK(t){const s=[sStart+speedS*(t-edgeStart),speedS,0],p=A.map((x,i)=>ja(js(ja(js(cosh(s),x),js(sinh(s),T[i])),Math.cosh(rho)),[Math.sinh(rho)*N[i],0,0]));return p.slice(1).map(x=>jd(x,p[0]));}
const axis=col(target,0).slice(1).map(x=>x/Math.sinh(2.54)),vertical=col(target,2).slice(1),mirror=[0,0,1,0];
function polarK(theta,r){let a=theta*Math.PI/180;return axis.map((x,i)=>Math.tanh(r)*(-Math.cos(a)*x+Math.sin(a)*vertical[i]));}
const middleTime=19,middleK=polarK(163,1.7),middle=middleK.map((x,i)=>[x,[-.04,0,.045][i],0]);
const begin=finiteJets(oldK,8),edgeIn=edgeK(edgeStart),edgeOut=edgeK(edgeEnd),end=kleinJets(endEye,endV,endA);
function bezier(p,t){while(p.length>1)p=p.slice(1).map((q,i)=>ja(jm(p[i],ja([1,0,0],js(t,-1))),jm(q,t)));return p[0];}
function segment(a,b,ta,tb,t){const h=tb-ta;return a.map(([p,v,acc],i)=>{const[q,w,dd]=b[i],c=[p,p+h*v/5,p+2*h*v/5+h*h*acc/20,q-2*h*w/5+h*h*dd/20,q-h*w/5,q];return bezier(c.map(x=>[x,0,0]),[(t-ta)/h,1/h,0]);});}
function curve(t){let k=t<=edgeStart?segment(begin,edgeIn,8,edgeStart,t):t<=edgeEnd?edgeK(t):t<=middleTime?segment(edgeOut,middle,edgeEnd,middleTime,t):segment(middle,end,middleTime,finish,t);if(t>edgeEnd&&t<middleTime){const q=[(t-edgeEnd)/(middleTime-edgeEnd),1/(middleTime-edgeEnd),0],r=ja([1,0,0],js(q,-1)),b=js(jm(jm(jm(q,q),q),jm(jm(r,r),r)),64*.04);k=k.map((x,i)=>ja(x,js(b,[-.4,0,1][i])));}const den=sqrt(ja([1,0,0],js(k.reduce((s,x)=>ja(s,jm(x,x)),[0,0,0]),-1))),p=[[1,0,0],...k].map(x=>jd(x,den));return{eye:p.map(x=>x[0]),velocity:p.map(x=>x[1]),acceleration:p.map(x=>x[2])};}
function basis(p){let right=add(mirror,p,ip(mirror,p));right=scale(right,1/Math.sqrt(ip(right,right)));let sh=Math.hypot(...p.slice(1)),radial=[-sh,...p.slice(1).map(x=>-p[0]*x/sh)];radial=add(radial,right,-ip(radial,right));radial=scale(radial,1/Math.sqrt(ip(radial,radial)));const d=p.slice(1),theta=Math.atan2(dot(d,vertical),-dot(d,axis)),q=[0,...axis.map((x,i)=>Math.sin(theta)*x+Math.cos(theta)*vertical[i])];let angular=add(q,p,ip(q,p));angular=add(angular,right,-ip(angular,right));angular=add(angular,radial,-ip(angular,radial));angular=scale(angular,1/Math.sqrt(ip(angular,angular)));return{right,radial,angular};}
function rawBeta(t){const{eye,velocity}=curve(t),{radial,angular}=basis(eye);return Math.atan2(ip(velocity,radial),ip(velocity,angular));}
function oldBetaAt(t){let m=previousPose(t/24),b=basis(col(m,0));return Math.atan2(ip(col(m,3),b.radial),ip(col(m,3),b.angular));}
const entryGazeJet=finiteJets(t=>[oldBetaAt(t)],8)[0];
const headingStart=edgeEnd;
function edgeBeta(t){let s=sStart+speedS*(t-edgeStart),p=A.map((x,i)=>Math.cosh(rho)*(Math.cosh(s)*x+Math.sinh(s)*T[i])+Math.sinh(rho)*N[i]),v=A.map((x,i)=>Math.sinh(s)*x+Math.cosh(s)*T[i]),{radial,angular}=basis(p);return Math.atan2(ip(v,radial),ip(v,angular));}
const entryTargetGazeJet=finiteJets(t=>[edgeBeta(t)],edgeStart)[0],headingJet=finiteJets(t=>[edgeBeta(t)],headingStart)[0],headingEnd=[[Math.PI/2,0,0]];
function baseBeta(t){if(t<edgeStart)return segment([entryGazeJet],[entryTargetGazeJet],8,edgeStart,t)[0][0];if(t<headingStart)return rawBeta(t);return segment([headingJet],headingEnd,headingStart,finish,t)[0][0];}
// Raise the gaze before the closest cusp pass, then merge into the existing ending.
// The compact pitch offset has zero velocity and acceleration at both ends and its crest.
export function earlyLookUp(t){
 const start=11.5,crest=15,release=15.5,end=19,angle=Math.PI/3;
 if(t<=start||t>=end)return 0;
 return angle*(t<crest?smooth((t-start)/(crest-start)):t<release?1:1-smooth((t-release)/(end-release)));
}
function beta(t){return baseBeta(t)+earlyLookUp(t);}
function transport(m,p){const q=col(m,0),axes=[1,2,3].map(k=>add(col(m,k),add(q,p),ip(col(m,k),p)/(1-ip(q,p))));return p.map((x,i)=>[x,...axes.map(v=>v[i])]);}
function mountedFrame(t){const{eye}=curve(t),{right,radial,angular}=basis(eye),b=beta(t),f=add(scale(angular,Math.cos(b)),radial,Math.sin(b)),up=add(scale(radial,Math.cos(b)),angular,-Math.sin(b));let frame=eye.map((x,i)=>[x,right[i],up[i],f[i]]);if(t>21){const w=smooth((t-21)/(finish-21)),desired=transport(endFrame,eye);let rr=add(scale(col(frame,1),1-w),col(desired,1),w);rr=add(rr,eye,ip(rr,eye));rr=scale(rr,1/Math.sqrt(ip(rr,rr)));let ff=add(scale(col(frame,3),1-w),col(desired,3),w);ff=add(ff,eye,ip(ff,eye));ff=add(ff,rr,-ip(ff,rr));ff=scale(ff,1/Math.sqrt(ip(ff,ff)));let uu=add(scale(col(frame,2),1-w),col(desired,2),w);uu=add(uu,eye,ip(uu,eye));uu=add(uu,rr,-ip(uu,rr));uu=add(uu,ff,-ip(uu,ff));uu=scale(uu,1/Math.sqrt(ip(uu,uu)));frame=eye.map((x,i)=>[x,rr[i],uu[i],ff[i]]);}return frame;}
function microDistance(t){return bezier([[0,0,0],[0,0,0],[0,0,0],[.6*sideDistance,0,0],[.8*sideDistance,0,0],[sideDistance,0,0]],[t,0,0])[0];}
export const returnDuration=24,returnDepartureDuration=micro,returnArrivalDuration=micro,returnReadingMount={departureDuration:micro,arrivalDuration:micro,sideDistance};
export function returnPose(t){const sec=returnEarlyClock(t*24);if(sec<=8)return previousPose(sec/24);if(sec>=24)return target.map(r=>r.slice());if(sec>finish)return sideFrame(target,-microDistance((24-sec)/micro));return mountedFrame(sec);}
export const returnMetrics={description:'Forward edge pass with an early gradual look upward, merging into the existing final pentagon approach',readingMount:returnReadingMount};
export const returnCompositionTimes=[{seconds:12,kind:'edge',vertices:[13,15]},{seconds:15.5,kind:'cusp',index:15}];
export const returnCompositionKeyframes=returnCompositionTimes.map(x=>({...x,frame:returnPose(x.seconds/24)}));
