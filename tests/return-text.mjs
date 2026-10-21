import assert from 'node:assert/strict';
import {returnTextPose} from '../return-text-projection.js';
import {flightLegs,flightPose} from '../flight-path.js';
import {readingPhase,readingFrames} from '../camera-path.js';
import {projectReadingPlaneWithDepth} from '../projection.js';
import {dot} from '../intrinsic.js';

const leg=flightLegs[3],end=flightPose(3,1),column=(m,i)=>m.map(row=>row[i]);
const phaseAt=t=>readingPhase(3*(1-t/leg.duration));
assert.equal(returnTextPose(phaseAt(leg.duration-leg.arrivalDuration-.01)),null);
for(const [vw,vh,width,height] of [[1280,720,620,302],[625,780,550,240],[390,844,343.2,185],[320,568,281.6,185]]){
 let previous=Infinity,visible=0;
 for(let frame=0;frame<=96;frame++){
  const time=leg.duration-leg.arrivalDuration+frame/60,phase=phaseAt(time);
  const camera=returnTextPose(phase);assert.ok(camera);
  const actual=flightPose(3,time/leg.duration);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
   const canonical=dot(column(readingFrames[0],i),column(camera,j));
   const expected=dot(column(end,i),column(actual,j));
   assert.ok(Math.abs(canonical-expected)<1e-8,'text camera follows the actual return relative to its endpoint');
  }
  const p=projectReadingPlaneWithDepth(phase,0,width,height,vw,vh,camera);
  assert.equal(p.nearOpacity,1);assert.ok(p.matrix);
  const m=p.matrix,x=width/2,y=height/2;
  const center=(m[0]*x+m[4]*y+m[12])/(m[3]*x+m[7]*y+1);
  assert.ok(center<=previous+1e-7,'name moves continuously from right to center');
  if(center-width/2<vw)visible++;
  previous=center;
 }
 assert.ok(Math.abs(previous-vw/2)<1e-7,'name finishes centered');
 assert.ok(visible>=36,'arrival stays visible for at least 0.6 seconds');
}
console.log('Return text follows the final camera mount, enters from the right, stays opaque and settles centered across desktop and phone viewports.');
