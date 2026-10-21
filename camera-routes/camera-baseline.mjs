// Intrinsic viewing stations and a route that passes beside their text planes.
// The ray tracer and the stationary text sprites use these same frames.
export const readingPhase=index=>index*Math.PI/4;
export const readingRadii=[2.54,3.4,1.35,2.54];
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const unit=v=>v.map(x=>x/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const phi=(1+Math.sqrt(5))/2,scale=Math.sqrt(phi+2);
const axis=[1/scale,0,phi/scale],cusp=unit([1,1,1]);
const tangent=unit(cusp.map((x,i)=>x-dot(cusp,axis)*axis[i]));
const normal=cross(tangent,axis),angular=cross(cusp,normal);
const directions=[axis,cusp,[.5,phi/2,1/(2*phi)],axis.map(x=>-x)];
const stationUps=[
 [phi/scale,0,-1/scale],
 angular.map((x,i)=>.5*x+Math.sqrt(3)/2*normal[i]),
 [phi/2,-1/(2*phi),-.5],
 tangent.map((x,i)=>-Math.sin(3*Math.PI/10)*x+Math.cos(3*Math.PI/10)*normal[i])
];
function frameAt(radial,up,radius){
 const right=cross(radial,up),ch=Math.cosh(radius),sh=Math.sinh(radius);
 return [[ch,0,0,-sh],...radial.map((v,i)=>[sh*v,right[i],up[i],-ch*v])];
}
// The first two approved stills are unchanged. The third is a twofold view
// across edge (7,19); the final regular pentagon has a downward vertex.
export const readingFrames=directions.map((v,i)=>frameAt(v,stationUps[i],readingRadii[i]));
const eyes=readingFrames.map(frame=>frame.map(row=>row[0]));
const klein=p=>p.slice(1).map(x=>x/p[0]);
const hyperboloid=p=>[1,...p].map(x=>x/Math.sqrt(1-dot(p,p)));
// Keep text tiny in curvature units while preserving its angular reading size.
// A correspondingly small sidestep clears it with very little ambient parallax.
export const textPlaneDepth=.005;
const sideDistance=2.4*textPlaneDepth,handleDistance=.25;
function sidePoint(station,distance){
 const ch=Math.cosh(distance),sh=Math.sinh(distance);
 return eyes[station].map((x,i)=>ch*x+sh*readingFrames[station][i][1]);
}
function bezier(controls,u){
 let points=controls;
 while(points.length>1)points=points.slice(0,-1).map((p,i)=>p.map((x,j)=>(1-u)*x+u*points[i+1][j]));
 return points[0];
}
// Leave each text plane laterally, then turn inward. The bridge shares the
// geodesic sidesteps' tangent lines, so arclength parameterization joins C1.
const bridges=[0,1,2].map(i=>{
 const start=klein(sidePoint(i,sideDistance)),end=klein(sidePoint(i+1,-sideDistance));
 // A shallow inward arc spreads the center-facing turn over more of the route.
 const middle=unit(start.map((x,k)=>x+end[k])).map(x=>.8*x);
 return [start,klein(sidePoint(i,sideDistance+handleDistance)),middle,
  klein(sidePoint(i+1,-sideDistance-handleDistance)),end];
});
// The middle journey takes a gallery excursion, while the reading stations
// remain fixed. Parabolic gallery knots lie on the chosen cusp horosphere; smooth
// connecting curves may retreat slightly inward between those knots.
const inner=(a,b)=>dot(a.slice(1),b.slice(1))-a[0]*b[0];
const add=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]);
const column=(frame,k)=>frame.map(row=>row[k]);
const galleryRadius=1.85,galleryLateral=-.3,galleryRadial=cusp;
const galleryBase=[Math.cosh(galleryRadius),...galleryRadial.map(x=>Math.sinh(galleryRadius)*x)];
const galleryUp=[-Math.sinh(galleryRadius),...galleryRadial.map(x=>-Math.cosh(galleryRadius)*x)];
const galleryDirection=column(readingFrames[1],2).map(x=>-x);
const cuspVector=[1,...cusp];
function galleryEye(s){
 const q=(s*s+galleryLateral*galleryLateral)/2;
 return galleryBase.map((x,i)=>(1+q)*x-q*galleryUp[i]+s*galleryDirection[i]+galleryLateral*readingFrames[1][i][1]);
}
function galleryVelocity(s){
 return galleryBase.map((x,i)=>s*x-s*galleryUp[i]+galleryDirection[i]);
}
function kleinTangent(p,v){return p.slice(1).map((x,i)=>(v[i+1]*p[0]-x*v[0])/(p[0]*p[0]));}
// Quintic Hermite pieces have matching tangent lines and zero normal
// acceleration at their joins; reparameterization by arclength is C2 there.
const galleryKnots=[
 {p:sidePoint(1,sideDistance),v:column(readingFrames[1],1),handle:.08},
 ...[-.15,.65,1.45].map(s=>({p:galleryEye(s),v:galleryVelocity(s),handle:.32})),
 {p:sidePoint(2,-sideDistance),v:column(readingFrames[2],1),handle:.15}
];
const galleryPieces=galleryKnots.slice(0,-1).map((a,i)=>{
 const b=galleryKnots[i+1],p=klein(a.p),q=klein(b.p);
 const v=kleinTangent(a.p,a.v).map(x=>x*a.handle),w=kleinTangent(b.p,b.v).map(x=>x*b.handle);
 return [p,add(p,v),add(p,v,2),add(q,w,-2),add(q,w,-1),q];
});
function bridgePoint(leg,u){
 if(leg!==1)return bezier(bridges[leg],u);
 const s=u*galleryPieces.length,index=Math.min(galleryPieces.length-1,Math.floor(s));
 return bezier(galleryPieces[index],s-index);
}
// Near the ideal boundary, Klein-coordinate speed differs sharply from
// hyperbolic speed. The sidesteps have known arclength; only bridges need LUTs.
const samples=8192;
// Cluster samples at the tangent joins: near a cusp the bridge initially
// changes direction much faster than it does in the middle of its interval.
const parameters=Array.from({length:samples+1},(_,i)=>(1-Math.cos(Math.PI*i/samples))/2);
const bridgeLengths=bridges.map(controls=>{
 const leg=bridges.indexOf(controls),table=[0];let previous=hyperboloid(bridgePoint(leg,0));
 for(let i=1;i<=samples;i++){
  const next=hyperboloid(bridgePoint(leg,parameters[i])),delta=next.map((x,k)=>x-previous[k]);
  const norm2=dot(delta.slice(1),delta.slice(1))-delta[0]*delta[0];
  table.push(table[i-1]+2*Math.asinh(Math.sqrt(Math.max(0,norm2))/2));previous=next;
 }
 return table;
});
export const routeLengths=bridgeLengths.map(table=>2*sideDistance+table[samples]);
export const routeJoinPhases=routeLengths.flatMap((length,i)=>[
 readingPhase(i+sideDistance/length),readingPhase(i+1-sideDistance/length)
]);
// Internal gallery turns are useful for rendering and continuity audits. Keep
// them separate from the established sidestep joins used by text timing.
export const galleryJoinPhases=[.25,.5,.75,.8].map(u=>{
 const index=parameters.findIndex(parameter=>parameter>=u),low=Math.max(0,index-1);
 const fraction=(u-parameters[low])/(parameters[index]-parameters[low]);
 const distance=bridgeLengths[1][low]+fraction*(bridgeLengths[1][index]-bridgeLengths[1][low]);
 return readingPhase(1+(sideDistance+distance)/routeLengths[1]);
});
function bridgeParameter(leg,distance){
 const table=bridgeLengths[leg];let low=0,high=samples;
 while(high-low>1){const middle=(low+high)>>1;if(table[middle]<distance)low=middle;else high=middle;}
 return parameters[low]+(distance-table[low])/(table[high]-table[low])*(parameters[high]-parameters[low]);
}
function routePoint(leg,fraction){
 const distance=fraction*routeLengths[leg],bridgeLength=bridgeLengths[leg][samples];
 if(distance<=sideDistance)return sidePoint(leg,distance);
 if(distance>=sideDistance+bridgeLength)return sidePoint(leg+1,distance-routeLengths[leg]);
 return hyperboloid(bridgePoint(leg,bridgeParameter(leg,distance-sideDistance)));
}
// Transport both endpoint up vectors to the current radial direction, then
// interpolate their roll. Endpoint derivatives agree with the next sidestep.
function transportedUp(start,up,radial){
 const factor=dot(up,radial)/(1+dot(start,radial));
 return unit(up.map((x,i)=>x-factor*(start[i]+radial[i])));
}
const rollChanges=[0,1,2].map(i=>{
 const up=transportedUp(directions[i],stationUps[i],directions[i+1]);
 return Math.atan2(dot(stationUps[i+1],cross(directions[i+1],up)),dot(stationUps[i+1],up));
});
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
function rotationQuaternion(m){
 const trace=m[0][0]+m[1][1]+m[2][2];let q;
 if(trace>0){const s=2*Math.sqrt(1+trace);q=[s/4,(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s];}
 else {
  let i=0;if(m[1][1]>m[i][i])i=1;if(m[2][2]>m[i][i])i=2;
  const j=(i+1)%3,k=(i+2)%3,s=2*Math.sqrt(1+m[i][i]-m[j][j]-m[k][k]);q=[(m[k][j]-m[j][k])/s,0,0,0];
  q[i+1]=s/4;q[j+1]=(m[j][i]+m[i][j])/s;q[k+1]=(m[k][i]+m[i][k])/s;
 }
 return q;
}
function blendGallery(frame,weight){
 if(weight<=0)return frame;
 const eye=column(frame,0),up=add(eye,cuspVector,-1/(-inner(eye,cuspVector)));
 let forward=add(galleryDirection,eye,inner(galleryDirection,eye));
 forward=add(forward,up,-inner(forward,up));forward=forward.map(x=>x/Math.sqrt(inner(forward,forward)));
 let right=add(column(readingFrames[1],1),eye,inner(column(readingFrames[1],1),eye));
 right=add(right,up,-inner(right,up));right=add(right,forward,-inner(right,forward));right=right.map(x=>x/Math.sqrt(inner(right,right)));
 // Compare orientations in the canonical Lorentz boost's Euclidean rest frame.
 const rest=v=>v.slice(1).map((x,i)=>x-eye[i+1]*v[0]/(1+eye[0]));
 const a=rotationQuaternion([1,2,3].map(k=>rest(column(frame,k))).reduce((rows,v,k)=>rows.map((row,i)=>[...row,v[i]]),[[],[],[]]));
 let b=rotationQuaternion([right,up,forward].reduce((rows,v)=>{const r=rest(v);return rows.map((row,i)=>[...row,r[i]]);},[[],[],[]]));
 let cosine=dot(a,b);if(cosine<0){b=b.map(x=>-x);cosine=-cosine;}
 const angle=Math.acos(Math.min(1,cosine)),sine=Math.sin(angle);
 const q=sine<1e-8?a.map((x,i)=>(1-weight)*x+weight*b[i]):a.map((x,i)=>(Math.sin((1-weight)*angle)*x+Math.sin(weight*angle)*b[i])/sine);
 const [w,x,y,z]=q,m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
 const axes=[0,1,2].map(k=>{const v=m.map(row=>row[k]),t=dot(eye.slice(1),v);return [t,...v.map((a,i)=>a+eye[i+1]*t/(1+eye[0]))];});
 return eye.map((x,i)=>[x,...axes.map(v=>v[i])]);
}
export function readingPose(phase){
 const progress=Math.max(0,Math.min(3,phase/readingPhase(1)));
 if(Number.isInteger(progress))return readingFrames[progress].map(row=>row.slice());
 const leg=Math.min(2,Math.floor(progress)),fraction=progress-leg,eye=routePoint(leg,fraction);
 const radial=unit(eye.slice(1)),up=transportedUp(directions[leg],stationUps[leg],radial);
 const right=cross(radial,up),ease=fraction**3*(10+fraction*(-15+6*fraction));
 const endUp=transportedUp(directions[leg+1],stationUps[leg+1],radial);
 let difference=Math.atan2(dot(endUp,right),dot(endUp,up));
 difference+=2*Math.PI*Math.round((rollChanges[leg]-difference)/(2*Math.PI));
 const roll=difference*ease,c=Math.cos(roll),s=Math.sin(roll);
 const screenRight=right.map((x,i)=>c*x-s*up[i]),screenUp=up.map((x,i)=>c*x+s*right[i]);
 const ch=eye[0],sh=Math.hypot(...eye.slice(1));
 const frame=[[ch,0,0,-sh],...radial.map((v,i)=>[eye[i+1],screenRight[i],screenUp[i],-ch*v])];
 if(leg!==1)return frame;
 const distance=fraction*routeLengths[leg]-sideDistance;
 if(distance<=0||distance>=bridgeLengths[leg][samples])return frame;
 const u=bridgeParameter(leg,distance),weight=smooth(u/.25)*smooth((1-u)/.20);
 return blendGallery(frame,weight);
}

// Close the viewing loop through the hemisphere opposite the gallery. This is
// a separate flight, so returning home does not revisit intermediate slides.
const loopAxis=normal.map(x=>-x);
function rotateAround(v,n,angle){
 const c=Math.cos(angle),s=Math.sin(angle),perpendicular=cross(n,v),along=dot(n,v);
 return v.map((x,i)=>c*x+s*perpendicular[i]+(1-c)*along*n[i]);
}
const loopEndUp=rotateAround(stationUps[3],loopAxis,Math.PI);
const loopRoll=Math.atan2(dot(stationUps[0],cross(axis,loopEndUp)),dot(stationUps[0],loopEndUp));
export function loopPose(progress){
 if(progress<=0)return readingFrames[3].map(row=>row.slice());
 if(progress>=1)return readingFrames[0].map(row=>row.slice());
 const u=smooth(progress),angle=Math.PI*u;
 const radial=axis.map((x,i)=>-Math.cos(angle)*x-Math.sin(angle)*tangent[i]);
 const transported=rotateAround(stationUps[3],loopAxis,angle);
 const up=rotateAround(transported,radial,loopRoll*smooth(u));
 const radius=2.54-1.4*Math.sin(angle)**2;
 return frameAt(radial,up,radius);
}
