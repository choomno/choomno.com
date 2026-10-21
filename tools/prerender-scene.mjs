// Export exactly the shader, quotient data and timed camera poses used by the site.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {packScene,advance,identity} from '../polyhedral.js';
import {readingPose,readingPhase} from '../camera-path.js';
import {flightLegs,flightPose} from '../flight-path.js';
import {transitionProgress} from '../transition-timing.js';
import {videoFramesPerSecond} from '../media-settings.js';
import {doublePrecisionFragment} from './prerender-double.mjs';
const output=resolve(process.argv[2]||'work/prerender');
await mkdir(output,{recursive:true});
const data=JSON.parse(await readFile(new URL('../dodecahedral-data.json',import.meta.url),'utf8'));
const scene=packScene(data,Float64Array),fps=videoFramesPerSecond;
const cameraPose=(raw,phase)=>{
 const {frame,cell}=advance(identity(),0,raw,data);
 return {cell,camera:frame[0].flatMap((_,i)=>frame.map(row=>row[i])),phase};
};
const pose=phase=>cameraPose(readingPose(phase),phase);
const stations=Array.from({length:4},(_,index)=>pose(readingPhase(index)));
const sampleLeg=(leg)=>{
 const intervals=Math.round(flightLegs[leg].duration*fps);
 return Array.from({length:intervals+1},(_,frame)=>{
  const u=frame/intervals,time=frame/fps;
  const phase=leg<3?readingPhase(leg+transitionProgress(time*1000,leg)):readingPhase(3*(1-u));
  return {time,...cameraPose(flightPose(leg,u),phase)};
 });
};
const legs=Array.from({length:3},(_,leg)=>sampleLeg(leg));
const rewind=sampleLeg(3);
scene.fragment=doublePrecisionFragment({faces:data.cells[0].planes.length,edges:data.cells[0].edges.length,stride:scene.height/data.cells.length,texelCount:scene.texels.length/4});
const sources=['flight-path.js',...(await readdir(new URL('../camera-routes/',import.meta.url))).filter(p=>/\.(js|mjs|json)$/.test(p)).map(p=>'camera-routes/'+p),'media-settings.js','tools/prerender-double.mjs','tools/prerender-egl.py','polyhedral.js','intrinsic.js','dodecahedral-data.json','camera-path.js','transition-timing.js','rewind-timing.js'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
const content={precision:'float64',width:scene.width,height:scene.height,texels:Array.from(scene.texels),fragment:scene.fragment,stations,legs,rewind,rewindKind:'closing-loop',fps,legDurations:flightLegs.slice(0,3).map(leg=>leg.duration),rewindDuration:flightLegs[3].duration,sourceHashes};
await writeFile(resolve(output,'scene.json'),JSON.stringify(content));
console.log(`Exported ${stations.length} stills and ${legs.map(frames=>frames.length).join('/')} adjacent frames and ${rewind.length} closing frames to ${output}/scene.json`);
