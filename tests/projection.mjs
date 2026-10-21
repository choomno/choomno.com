import assert from 'node:assert/strict';
import {projectReadingPlane, projectReadingPlaneWithDepth, nearPlaneOpacity, readingPhase, projectionPose as readingPose} from '../projection.js';
import {textPlaneDepth} from '../camera-path.js';
import {dot, apply} from '../rhombic.js';
const project = (m,x,y) => [(m[0]*x+m[4]*y+m[12])/(m[3]*x+m[7]*y+1),(m[1]*x+m[5]*y+m[13])/(m[3]*x+m[7]*y+1)];
const close = (actual, expected, tolerance=1e-8) => assert.ok(Math.abs(actual-expected)<tolerance, `${actual} != ${expected}`);
for (const [vw,vh,width,height] of [[5120,1440,620,330],[3440,1440,620,330],[1440,900,440,280],[625,780,440,300],[390,844,343.2,345],[320,568,281.6,390]]) {
 for(let i=0;i<4;i++) {
  const p=readingPhase(i), m=projectReadingPlane(p,p,width,height,vw,vh);
  const projection=projectReadingPlaneWithDepth(p,p,width,height,vw,vh);
  assert.deepEqual(projection.matrix,m);close(projection.minimumDepth,textPlaneDepth);assert.equal(projection.nearOpacity,1,'reading stills retain full opacity');
  for(const [x,y] of [[0,0],[width,0],[width,height],[0,height],[width/2,height/2]]) {
   const [u,v]=project(m,x,y); close(u,(vw-width)/2+x); close(v,(vh-height)/2+y);
  }
  if(i<3){
   const next=readingPhase(i+1);
   const departing=project(projectReadingPlane(p+.0005,p,width,height,vw,vh),width/2,height/2);
   const arriving=project(projectReadingPlane(next-.0005,next,width,height,vw,vh),width/2,height/2);
   assert.ok(departing[0]<vw/2 && arriving[0]>vw/2,'Forward motion must carry text right to left');
  }
 }
}
// Near text must move much more than distant scenery during the sidestep.
assert.ok(textPlaneDepth<.01,'The text is intrinsically small and close to the portal');
for(let i=0;i<3;i++){
 const p=readingPhase(i),phase=p+.0002,vw=625,vh=780;
 const station=readingPose(p),camera=readingPose(phase);
 const text=project(projectReadingPlane(phase,p,360,300,vw,vh),180,150);
 const distant=apply(station,[Math.cosh(2),0,0,Math.sinh(2)]);
 const x=dot(camera.map(row=>row[1]),distant),z=dot(camera.map(row=>row[3]),distant);
 const ambientShift=Math.abs(vh*x/(2*.82*z));
 assert.ok(Math.abs(text[0]-vw/2)>50*ambientShift,'Text parallax must dominate the ambient view');
 assert.ok(ambientShift<2,'The opening sidestep barely moves the distant reference');
}
// Independent incidence test: the rendered pixel's hyperbolic ray must meet
// the stationary totally geodesic text plane at the selected text coordinate.
for (const [vw,vh] of [[1440,900],[3440,1440],[5120,1440]]) for (const offset of [-.0003, -.00015, 0, .00015, .0003]) {
 const stationPhase=readingPhase(1),phase=stationPhase+offset;
 const camera=readingPose(phase),station=readingPose(stationPhase);
 const width=440,height=280,z=textPlaneDepth;
 // Independent CSS cover calculation: the displayed 2:1 image must cover both axes.
 const displayedHeight=Math.max(vh,vw/2),focal=displayedHeight/(2*.82);
 const half=z*width/(2*focal),vertical=half*height/width;
 const time=Math.sqrt(1+half*half+vertical*vertical+z*z);
 const x=.23*width,y=.67*height;
 const expectedRaw=apply(station,[time,-half+2*half*x/width,vertical-2*vertical*y/height,z]);
 const norm=Math.sqrt(-dot(expectedRaw,expectedRaw)),expected=expectedRaw.map(v=>v/norm);
 const projection=projectReadingPlaneWithDepth(phase,stationPhase,width,height,vw,vh);
 assert.ok(projection.nearOpacity>0&&projection.matrix,'incidence sample must be visibly in front of the camera');
 const [u,v]=project(projection.matrix,x,y);
 const direction=[(u-vw/2)/focal,(vh/2-v)/focal,1];
 const length=Math.hypot(...direction),d=apply(camera,[0,...direction.map(v=>v/length)]);
 const eye=camera.map(row=>row[0]),normal=apply(station,[z,0,0,time]);
 const q=-dot(eye,normal)/dot(d,normal);assert.ok(q>0&&q<1);
 const actual=eye.map((v,i)=>(v+q*d[i])/Math.sqrt(1-q*q));
 actual.forEach((v,i)=>close(v,expected[i]));
}
// Locate a real clip crossing independently of the projection helper and
// without assuming when the camera passes a now much nearer text plane.
{
 const stationPhase=readingPhase(1),station=readingPose(stationPhase);
 const width=440,height=280,vw=1440,vh=900,z=textPlaneDepth;
 const half=z*.82*width/vh,vertical=half*height/width,time=Math.sqrt(1+half*half+vertical*vertical+z*z);
 const points=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>
  apply(station,[time,-half+2*half*x/width,vertical-2*vertical*y/height,z]));
 const depths=phase=>{const forward=readingPose(phase).map(row=>row[3]);return points.map(p=>dot(forward,p));};
 let low=stationPhase,high;
 for(let i=1;i<=2000;i++){
  const phase=stationPhase+readingPhase(1)*i/2000;
  if(Math.min(...depths(phase))<=z*.025){high=phase;break;}
  low=phase;
 }
 assert.ok(high,'The route must exercise a real clip crossing');
 for(let i=0;i<45;i++){
  const middle=(low+high)/2;
  if(Math.min(...depths(middle))>z*.025)low=middle;else high=middle;
 }
 const before=projectReadingPlaneWithDepth(low-1e-7,stationPhase,width,height,vw,vh);
 const after=projectReadingPlaneWithDepth(high+1e-7,stationPhase,width,height,vw,vh);
 assert.ok(before.matrix);assert.equal(after.matrix,null);
 assert.equal(before.nearOpacity,0);assert.equal(after.nearOpacity,0,'The hard clip occurs only after a complete fade');
 assert.equal(projectReadingPlane(high+1e-7,stationPhase,width,height,vw,vh),null);
 close(after.minimumDepth,Math.min(...depths(high+1e-7)),1e-10);
}
// The fade is monotone and C2 where it joins fully hidden/fully opaque states.
assert.equal(nearPlaneOpacity(-1),0);assert.equal(nearPlaneOpacity(textPlaneDepth*.25),0);
assert.equal(nearPlaneOpacity(textPlaneDepth*.875),1);assert.equal(nearPlaneOpacity(textPlaneDepth),1);
let previous=0;
for(let i=0;i<=100;i++){const opacity=nearPlaneOpacity(textPlaneDepth*(.25+i*.00625));assert.ok(opacity>=previous-1e-14);previous=opacity;}
const epsilon=1e-5;
const relativeOpacity=x=>nearPlaneOpacity(textPlaneDepth*x);
for(const [boundary,direction,level] of [[.25,1,0],[.875,-1,1]]){
 const first=relativeOpacity(boundary+direction*epsilon),second=relativeOpacity(boundary+direction*2*epsilon);
 assert.ok(Math.abs(first-level)/epsilon<1e-6,'opacity speed vanishes at the fade boundary');
 assert.ok(Math.abs(second-2*first+level)/(epsilon*epsilon)<.01,'opacity acceleration vanishes at the fade boundary');
}
console.log('All four text planes match their centered reading rectangles across desktop/mobile sizes; right-to-left travel, ray incidence and continuous near-plane fading verified.');

// Camera-relative text transforms must match the actual gallery mount frames,
// including its deck-transformed arrival, throughout both 1.6-second intervals.
{
 const {flightPose}=await import('../flight-path.js');
 const {transitionProgress}=await import('../transition-timing.js');
 const relative=(a,b)=>[0,1,2,3].map(i=>[0,1,2,3].map(j=>(i===0?-1:1)*dot(a.map(r=>r[i]),b.map(r=>r[j]))));
 for(const sec of [0,.2,.8,1.2,1.59,10.41,10.8,11.2,11.8,12]){
  const endpoint=sec>6?1:0;
  const actual=relative(flightPose(1,endpoint),flightPose(1,sec/12));
  const projected=relative(readingPose(readingPhase(1+endpoint)),readingPose(readingPhase(1+transitionProgress(sec*1000,1))));
  actual.flat().forEach((value,i)=>close(value,projected.flat()[i],3e-9));
 }
}
