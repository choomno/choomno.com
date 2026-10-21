import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readingFrames,readingPose,readingPhase,loopPose} from '../camera-path.js';
import {advance,identity,beamData} from '../polyhedral.js';

// These approved views and outer journeys are deliberately untouched by the
// gallery detour. Byte comparisons guard against accidentally rerendering them.
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(hash(readingFrames),'111d2e3b9cc880eaf08a28c4a7464979c3a0647823f0e70b8875410d1e8cfae5');
const samples=[.1,.25,.5,.75,.9,2.1,2.25,2.5,2.75,2.9];
assert.equal(hash(samples.map(p=>readingPose(readingPhase(p)))),'96901632b1b94d1e0068ea615ced015c2f9c97051bcf9a49881640135c5c3eb4');

const inner=(a,b)=>a.reduce((sum,x,i)=>sum+(i===0?-1:1)*x*b[i],0);
const {flightLegs}=await import('../flight-path.js');
assert.deepEqual(flightLegs.map(leg=>Math.round(1000*leg.duration)),[8000,12000,8000,22300]);
const data=JSON.parse(await readFile(new URL('../dodecahedral-data.json',import.meta.url)));
const beams=data.cells.map(beamData),report=[];
for(let k=0;k<flightLegs.length;k++){
 const leg=flightLegs[k];
 assert.equal(leg.departureDuration,1.6);assert.equal(leg.arrivalDuration,1.6);
 // Gallery arrival is a deck-equivalent lift, not the same ambient matrix.
 for(const end of [0,1]){
  const actual=advance(identity(),0,leg.pose(end),data);
  const expected=advance(identity(),0,readingFrames[(k+end)%4],data);
  assert.equal(actual.cell,expected.cell);
  assert.ok(Math.max(...actual.frame.flat().map((x,i)=>Math.abs(x-expected.frame.flat()[i])))<3e-9);
 }
 let minimumGap=Infinity,maximumGramError=0;
 for(let i=0;i<=2400;i++){
  const frame=leg.pose(i/2400),cols=[0,1,2,3].map(j=>frame.map(row=>row[j]));
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)maximumGramError=Math.max(maximumGramError,Math.abs(inner(cols[a],cols[b])-(a===b?(a===0?-1:1):0)));
  const folded=advance(identity(),0,frame,data),eye=folded.frame.map(row=>row[0]);
  for(const {n1,n2} of beams[folded.cell])minimumGap=Math.min(minimumGap,Math.asinh(Math.hypot(inner(eye,n1),inner(eye,n2)))-.025);
 }
 assert.ok(maximumGramError<3e-9,`${leg.id}: Lorentz frame error ${maximumGramError}`);
 // The approved return deliberately skims five millionths of a curvature
 // unit above the second edge tube to present its surface as a floor.
 assert.ok(minimumGap>(k===3?4.9e-6:.04),`${leg.id}: tube surface gap ${minimumGap}`);
 report.push({leg:leg.id,minimumGap,maximumGramError});
}
assert.deepEqual(loopPose(0),readingFrames[3]);assert.deepEqual(loopPose(1),readingFrames[0]);
console.log('Approved flight geometry checks passed:',report);
