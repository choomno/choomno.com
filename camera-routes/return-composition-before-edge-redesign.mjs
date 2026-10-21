// Independent continuously moving return study. Browser-importable; no media edits.
import {readingFrames} from './camera-baseline.mjs';
const inner=(a,b)=>a.slice(1).reduce((s,x,i)=>s+x*b[i+1],-a[0]*b[0]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]),scale=(v,s)=>v.map(x=>x*s),col=(m,k)=>m.map(r=>r[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
// Second-order dual numbers give exact path velocity and acceleration through
// the Riemannian de Casteljau construction, without differencing a lookup table.
const ja=(a,b)=>a.map((x,i)=>x+b[i]),js=(a,s)=>a.map(x=>x*s),jm=(a,b)=>[a[0]*b[0],a[1]*b[0]+a[0]*b[1],a[2]*b[0]+2*a[1]*b[1]+a[0]*b[2]];
const unary=(a,f,df,ddf)=>[f(a[0]),df(a[0])*a[1],ddf(a[0])*a[1]*a[1]+df(a[0])*a[2]];
const ji=a=>unary(a,x=>1/x,x=>-1/(x*x),x=>2/(x*x*x)),jd=(a,b)=>jm(a,ji(b));
const sinh=a=>unary(a,Math.sinh,Math.cosh,Math.sinh),sqrt=a=>unary(a,Math.sqrt,x=>.5/Math.sqrt(x),x=>-.25/(x*Math.sqrt(x)));
const acosh=a=>unary(a,Math.acosh,x=>1/Math.sqrt(x*x-1),x=>-x/(x*x-1)**1.5);
const jinner=(a,b)=>a.reduce((s,x,i)=>ja(s,js(jm(x,b[i]),i===0?-1:1)),[0,0,0]);
function lerpH(a,b,t){
 const c=js(jinner(a,b),-1);if(c[0]<1+1e-10){const p=a.map((v,i)=>ja(jm(v,ja([1,0,0],js(t,-1))),jm(b[i],t))),n=sqrt(js(jinner(p,p),-1));return p.map(v=>jd(v,n));}
 const d=acosh(c),den=sinh(d),wa=jd(sinh(jm(ja([1,0,0],js(t,-1)),d)),den),wb=jd(sinh(jm(t,d)),den);
 return a.map((v,i)=>ja(jm(v,wa),jm(b[i],wb)));
}
const cosh=a=>unary(a,Math.cosh,Math.sinh,Math.cosh),sin=a=>unary(a,Math.sin,Math.cos,x=>-Math.sin(x)),cos=a=>unary(a,Math.cos,x=>-Math.sin(x),x=>-Math.cos(x));
const start=readingFrames[3],target=readingFrames[0],sideDistance=.012,endpointSpeed=1;
function sideFrame(frame,distance){const c=Math.cosh(distance),s=Math.sinh(distance);return frame.map(row=>[c*row[0]+s*row[1],s*row[0]+c*row[1],row[2],row[3]]);}
const coreStart=sideFrame(start,sideDistance),coreEnd=sideFrame(target,-sideDistance);
const axis=col(target,0).slice(1).map(x=>x/Math.sinh(2.54)),vertical=col(target,2).slice(1),mirrorNormal=[0,0,1,0];
const nodes=[
 [0,0,2.54,0],[.14,40,1.1,0],[.24,99.5,1.5,8],
 [.40,100.3,3.15,0],[.48,100.812316963572,3.1,-1.5],
 [.64,104,1.1,0],[.75,121.717474411461,1.35,0],
 [.89,175,1.35,0],[1,180,2.54,0]
];
function thetaSlope(i){if(i===0||i===nodes.length-1)return 0;const a=nodes[i-1],b=nodes[i],c=nodes[i+1],p=(b[1]-a[1])/(b[0]-a[0])*Math.PI/180,q=(c[1]-b[1])/(c[0]-b[0])*Math.PI/180;return 2*p*q/(p+q);}
function jetBezier(points,t){let p=points;while(p.length>1)p=p.slice(1).map((q,i)=>ja(jm(p[i],ja([1,0,0],js(t,-1))),jm(q,t)));return p[0];}
function scalarCurve(t,index){
 let i=0;while(i<nodes.length-2&&t>nodes[i+1][0])i++;const a=nodes[i],b=nodes[i+1],h=b[0]-a[0],theta=index===1,va=a[index]*(theta?Math.PI/180:1),vb=b[index]*(theta?Math.PI/180:1),da=theta?thetaSlope(i):a[3],db=theta?thetaSlope(i+1):b[3];
 const controls=[va,va+h*da/7,va+2*h*da/7,va+3*h*da/7,vb-3*h*db/7,vb-2*h*db/7,vb-h*db/7,vb];
 return jetBezier(controls.map(x=>[x,0,0]),[(t-a[0])/h,1/h,0]);
}
function baseKlein(t){const a=scalarCurve(t,1),r=scalarCurve(t,2),D=axis.map((x,i)=>ja(js(cos(a),-x),js(sin(a),vertical[i]))),time=cosh(r),spatial=D.map(x=>jm(sinh(r),x));return spatial.map(x=>jd(x,time));}
const pointToKlein=(p,v,a)=>p.slice(1).map((_,i)=>jd([p[i+1],v[i+1],a[i+1]],[p[0],v[0],a[0]]));
function endpointOffset(frame,t){const p=col(frame,0),v=scale(col(frame,1),endpointSpeed),a=scale(p,endpointSpeed**2),desired=pointToKlein(p,v,a),base=baseKlein(t);return desired.map((j,i)=>j.map((x,k)=>x-base[i][k]));}
const firstOffset=endpointOffset(coreStart,0),lastOffset=endpointOffset(coreEnd,1),entryWidth=.12,exitWidth=.12;
function offset(t,atEnd){const width=atEnd?exitWidth:entryWidth,x=atEnd?(t-1+width)/width:t/width;if(x<0||x>1)return [[0,0,0],[0,0,0],[0,0,0]];const data=atEnd?lastOffset:firstOffset;return data.map(([p,v,a])=>{let c=atEnd?[0,0,0,0,p-3*width*v/7+width**2*a/14,p-2*width*v/7+width**2*a/42,p-width*v/7,p]:[p,p+width*v/7,p+2*width*v/7+width**2*a/42,p+3*width*v/7+width**2*a/14,0,0,0,0];return jetBezier(c.map(x=>[x,0,0]),[x,1/width,0]);});}
export function returnCurve(t){const k=baseKlein(t),a=offset(t,false),b=offset(t,true),v=k.map((x,i)=>ja(ja(x,a[i]),b[i])),den=sqrt(ja([1,0,0],js(v.reduce((sum,x)=>ja(sum,jm(x,x)),[0,0,0]),-1))),jets=[[1,0,0],...v].map(x=>jd(x,den)),eye=jets.map(x=>x[0]),velocity=jets.map(x=>x[1]),acceleration=jets.map(x=>x[2]),tangent=add(velocity,eye,inner(velocity,eye)),speed=Math.sqrt(Math.max(1e-20,inner(tangent,tangent))),forward=scale(tangent,1/speed);return{eye,velocity,acceleration,forward,speed};}
const rest=(p,v)=>v.slice(1).map((x,i)=>x-p[i+1]*v[0]/(1+p[0]));
function fromRest(p,v){let time=dot(p.slice(1),v);return[time,...v.map((x,i)=>x+p[i+1]*time/(1+p[0]))];}
const headingNodes=[[0,Math.PI/2],[.15,.2],[.25,-.2],[.40,Math.PI/2],[1,Math.PI/2]];
function heading(u){let i=0;while(i<headingNodes.length-2&&u>headingNodes[i+1][0])i++;const[a,x]=headingNodes[i],[b,y]=headingNodes[i+1];return x+(y-x)*smooth((u-a)/(b-a));}
function mainFrame(u){
 const{eye}=returnCurve(u),a=scalarCurve(u,1)[0],sh=Math.hypot(...eye.slice(1)),inward=[-sh,...eye.slice(1).map(x=>-eye[0]*x/sh)];
 let right=add(mirrorNormal,eye,inner(mirrorNormal,eye));right=scale(right,1/Math.sqrt(inner(right,right)));
 let radial=add(inward,right,-inner(inward,right));radial=scale(radial,1/Math.sqrt(inner(radial,radial)));
 const angular0=[0,...axis.map((x,i)=>Math.sin(a)*x+Math.cos(a)*vertical[i])];let angular=add(angular0,eye,inner(angular0,eye));angular=add(angular,right,-inner(angular,right));angular=add(angular,radial,-inner(angular,radial));angular=scale(angular,1/Math.sqrt(inner(angular,angular)));
 const beta=heading(u),c=Math.cos(beta),s=Math.sin(beta),look=add(scale(angular,c),radial,s),up=add(scale(radial,c),angular,-s);
 return eye.map((x,i)=>[x,right[i],up[i],look[i]]);
}
function quaternion(m){let tr=m[0][0]+m[1][1]+m[2][2],q;if(tr>0){let s=2*Math.sqrt(1+tr);q=[s/4,(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s];}else{let i=0;if(m[1][1]>m[i][i])i=1;if(m[2][2]>m[i][i])i=2;let j=(i+1)%3,k=(i+2)%3,s=2*Math.sqrt(1+m[i][i]-m[j][j]-m[k][k]);q=[(m[k][j]-m[j][k])/s,0,0,0];q[i+1]=s/4;q[j+1]=(m[j][i]+m[i][j])/s;q[k+1]=(m[k][i]+m[i][k])/s;}return scale(q,1/Math.hypot(...q));}
const orientation=m=>quaternion([0,1,2].map(i=>[1,2,3].map(k=>rest(col(m,0),col(m,k))[i])));
function frameFromQuaternion(p,q){let[w,x,y,z]=q,m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];let axes=[0,1,2].map(k=>fromRest(p,m.map(r=>r[k])));return p.map((x,i)=>[x,...axes.map(v=>v[i])]);}
function transportFrame(frame,p){const a=col(frame,0),axes=[1,2,3].map(k=>add(col(frame,k),add(a,p),inner(col(frame,k),p)/(1-inner(a,p))));return p.map((x,i)=>[x,...axes.map(v=>v[i])]);}
function blendFrames(a,b,w){if(w<=0)return a;if(w>=1)return b;let qa=orientation(a),qb=orientation(b);if(dot(qa,qb)<0)qb=scale(qb,-1);const angle=Math.acos(Math.max(-1,Math.min(1,dot(qa,qb)))),s=Math.sin(angle),q=s<1e-8?add(scale(qa,1-w),qb,w):add(scale(qa,Math.sin((1-w)*angle)/s),qb,Math.sin(w*angle)/s);return frameFromQuaternion(col(a,0),q);}
function corePose(u){let frame=mainFrame(u),p=col(frame,0);if(u<.2)frame=blendFrames(transportFrame(coreStart,p),frame,smooth(u/.2));if(u>.88)frame=blendFrames(frame,transportFrame(coreEnd,p),smooth((u-.88)/.12));return frame;}
function bezier(a,t){while(a.length>1)a=a.slice(1).map((v,i)=>v.map((x,k)=>(1-t)*a[i][k]+t*x));return a[0];}
function cruise(t){const r=.2,I=x=>2.5*x**4-3*x**5+x**6;if(t<r)return r*I(t/r)/(1-r);if(t>1-r)return 1-r*I((1-t)/r)/(1-r);return(t-r/2)/(1-r);}
export const returnDuration=24,returnReadingMount={departureDuration:.9,arrivalDuration:.9,sideDistance};
const micro=.9,coreDuration=returnDuration-2*micro,clockSlope=coreDuration*(sideDistance/micro)/endpointSpeed;
function coreClock(t){return clockSlope*t+(1-clockSlope)*cruise(t);}
function microDistance(t){return bezier([[0],[0],[0],[.6*sideDistance],[.8*sideDistance],[sideDistance]],t)[0];}
export const returnMetrics={description:'Symmetry plane journey past a close ideal point and an adjacent edge, finishing at the pentagon',readingMount:returnReadingMount,compositions:[{u:.48,kind:'cusp',index:13},{u:.75,kind:'edge',vertices:[13,15]}]};
export const returnCompositionKeyframes=returnMetrics.compositions.map(({u,...label})=>({...label,u,frame:corePose(u)}));
// Smooth positive time density distributes a fixed duration over the composed
// sweeps. Quintic Hermite inversion preserves velocity and acceleration at table boundaries.
const timeCount=1800,timeRaw=[];
for(let i=0;i<=timeCount;i++){
 const x=i/timeCount,h=1/timeCount,a=corePose(coreClock(Math.max(0,x-h))),b=corePose(coreClock(Math.min(1,x+h))),m=corePose(coreClock(x)),den=(Math.min(1,x+h)-Math.max(0,x-h)),derivative=b.map((r,j)=>r.map((v,k)=>(v-a[j][k])/den));
 const omega=Math.hypot(inner(col(m,3),col(derivative,2)),inner(col(m,1),col(derivative,3)),inner(col(m,2),col(derivative,1)));
 const v=col(derivative,0),speed=Math.sqrt(Math.max(0,inner(v,v)));timeRaw.push(omega+2.0*speed);
}
const meanCost=timeRaw.reduce((a,b)=>a+b,0)/timeRaw.length,timeDensity=timeRaw.map((_,i)=>{let sum=0,weight=0;for(let j=Math.max(0,i-150);j<=Math.min(timeCount,i+150);j++){const g=Math.exp(-.5*((i-j)/45)**2);sum+=g*timeRaw[j];weight+=g;}return .35*meanCost+sum/weight;});
const edgeWeight=x=>smooth(x/.1)*smooth((1-x)/.1);
let baseIntegral=0,weightedIntegral=0;for(let i=0;i<=timeCount;i++){const trap=(i===0||i===timeCount?.5:1)/timeCount,w=edgeWeight(i/timeCount);baseIntegral+=trap*(1-w);weightedIntegral+=trap*w*timeDensity[i];}
const densityScale=(1-baseIntegral)/weightedIntegral,timeRho=timeDensity.map((q,i)=>1+edgeWeight(i/timeCount)*(densityScale*q-1)),timeIntegral=[0];for(let i=1;i<=timeCount;i++)timeIntegral.push(timeIntegral[i-1]+(timeRho[i-1]+timeRho[i])/(2*timeCount));
const timeRhoPrime=timeRho.map((q,i)=>i===0||i===timeCount?0:(timeRho[i+1]-timeRho[i-1])*timeCount/2);
function timeWarp(t){let lo=0,hi=timeCount;while(hi-lo>1){const mid=(lo+hi)>>1;if(timeIntegral[mid]<t)lo=mid;else hi=mid;}const a=timeIntegral[lo],b=timeIntegral[hi],h=1/timeCount,c=[a,a+h*timeRho[lo]/5,a+2*h*timeRho[lo]/5+h*h*timeRhoPrime[lo]/20,b-2*h*timeRho[hi]/5+h*h*timeRhoPrime[hi]/20,b-h*timeRho[hi]/5,b],dc=c.slice(1).map((q,i)=>5*(q-c[i]));let x=(t-a)/(b-a);for(let k=0;k<4;k++){const y=bezier(c.map(q=>[q]),x)[0],d=bezier(dc.map(q=>[q]),x)[0];x=Math.max(0,Math.min(1,x-(y-t)/d));}return(lo+x)/timeCount;}
export function returnPose(t){if(t<=0)return start.map(row=>row.slice());if(t>=1)return target.map(row=>row.slice());const elapsed=t*returnDuration;if(elapsed<micro)return sideFrame(start,microDistance(elapsed/micro));if(elapsed>returnDuration-micro)return sideFrame(target,-microDistance((returnDuration-elapsed)/micro));return corePose(coreClock(timeWarp((elapsed-micro)/coreDuration)));}

export const returnDepartureDuration=micro,returnArrivalDuration=micro;
export const returnCompositionTimes=returnMetrics.compositions.map(item=>{let lo=0,hi=1;for(let k=0;k<45;k++){const mid=(lo+hi)/2;if(coreClock(timeWarp(mid))<item.u)lo=mid;else hi=mid;}return {...item,seconds:micro+coreDuration*(lo+hi)/2};});
