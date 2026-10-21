import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {flightLegs} from '../flight-path.js';
import {flightLegs as originals} from '../camera-routes/flight-legs.mjs';
import {dot} from '../intrinsic.js';
import {advance,identity,beamData} from '../polyhedral.js';
const leg=flightLegs[3],old=originals[3],spec=leg.departureCorrection,T=spec.join;
const column=(frame,index)=>frame.map(row=>row[index]);
const start=old.pose(0),right=column(start,1),up=column(start,2),forward=column(start,3);
const at=seconds=>leg.pose(seconds/leg.duration),oldAt=seconds=>old.pose(seconds/old.duration);
const distance=(a,b)=>Math.max(...a.flat().map((x,i)=>Math.abs(x-b.flat()[i])));
assert.equal(leg.duration,22.3);assert.equal(T,3.1);
assert.ok(spec.velocityControls.every(value=>value<=0));
assert.deepEqual(at(0),oldAt(0));assert.deepEqual(at(T),oldAt(T));
for(let k=0;k<3;k++)assert.equal(flightLegs[k],originals[k]);
for(let i=0;i<=1000;i++){
 const seconds=T+(leg.duration-T)*i/1000;
 assert.deepEqual(at(seconds),oldAt(seconds),'every frame after the local correction is exact');
}
const data=JSON.parse(await readFile(new URL('../dodecahedral-data.json',import.meta.url))),beams=data.cells.map(beamData);
let previous=0,maxGramError=0,minGap=Infinity,maxOtherDisplacementError=0;
for(let i=0;i<=2400;i++){
 const seconds=T*i/2400,frame=at(seconds),eye=column(frame,0),originalEye=column(oldAt(seconds),0);
 const lateral=dot(right,eye);
 assert.ok(lateral<=previous+1e-10,`rightward motion at ${seconds}`);previous=lateral;
 for(const axis of [up,forward])maxOtherDisplacementError=Math.max(maxOtherDisplacementError,Math.abs(dot(axis,eye)-dot(axis,originalEye)));
 for(let a=0;a<4;a++)for(let b=0;b<4;b++)maxGramError=Math.max(maxGramError,Math.abs(dot(column(frame,a),column(frame,b))-(a===b?(a===0?-1:1):0)));
 const folded=advance(identity(),0,frame,data),p=column(folded.frame,0);
 for(const {n1,n2} of beams[folded.cell])minGap=Math.min(minGap,Math.asinh(Math.hypot(dot(p,n1),dot(p,n2)))-.025);
}
assert.ok(maxGramError<3e-9);assert.ok(maxOtherDisplacementError<1e-10);assert.ok(minGap>.04,`tube clearance ${minGap}`);
// One-sided derivative estimates of the whole ambient frame verify the C2 join,
// including the transported attitude and time coordinate, not just lateral x.
const h=.0005;
function jet(fn,t,direction){
 const f=[0,1,2,3,4].map(i=>fn(t+direction*i*h).flat());
 return [f[0],f[0].map((_,j)=>direction*(-25*f[0][j]+48*f[1][j]-36*f[2][j]+16*f[3][j]-3*f[4][j])/(12*h)),f[0].map((_,j)=>(35*f[0][j]-104*f[1][j]+114*f[2][j]-56*f[3][j]+11*f[4][j])/(12*h*h))];
}
const before=jet(at,T,-1),after=jet(oldAt,T,1);
const joinErrors=before.map((values,k)=>Math.max(...values.map((x,i)=>Math.abs(x-after[k][i]))));
assert.ok(joinErrors[0]<1e-12);assert.ok(joinErrors[1]<1e-6);assert.ok(joinErrors[2]<5e-4,JSON.stringify(joinErrors));
const startJet=jet(at,0,1);
assert.ok(Math.max(...startJet[1].map(Math.abs))<1e-7);
assert.ok(Math.max(...startJet[2].map(Math.abs))<5e-5);
console.log('Return departure:',{T,velocityControls:spec.velocityControls,joinErrors,maxGramError,minGap,maxOtherDisplacementError});
