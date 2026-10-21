import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {masterAspect,portraitAspect,videoFramesPerSecond} from '../media-settings.js';
import {flightLegs} from '../flight-path.js';
import {readingPhase} from '../camera-path.js';
import {fieldScale} from '../projection.js';
const base=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('media/manifest.json',base),'utf8'));
assert.equal(manifest.aspectRatio,masterAspect);
assert.equal(manifest.fps,videoFramesPerSecond);
assert.equal(manifest.version,2);
for(let leg=0;leg<3;leg++){
 const entry=manifest.transitions[leg];
 assert.ok(Math.abs(entry.timelineDuration-flightLegs[leg].duration)<1e-12);
 assert.equal(entry.frameCount,1+Math.round(entry.timelineDuration*manifest.fps));
 assert.equal(entry.videoDuration,entry.frameCount/manifest.fps);
}
assert.equal(manifest.maxSteps,160);assert.ok(manifest.supersampling>=1.5);
assert.equal(manifest.fieldScale,fieldScale);assert.equal(manifest.beamRadius,.025);
for(const [path,hash] of Object.entries(manifest.sourceHashes)){
 const bytes=await readFile(new URL(path,base));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,`Rendered geometry or timing is stale: ${path}`);
}
let checked=0;
for(let index=0;index<4;index++){
 assert.equal(manifest.stations[index].phase,readingPhase(index));
 for(const portrait of [false,true]){
  const name=`station-${index}${portrait?'-portrait':''}.webp`;
  await verify(name);
 }
}
assert.equal(manifest.rewind.from,3);assert.equal(manifest.rewind.to,0);
assert.equal(manifest.rewind.kind,'closing-loop');
assert.equal(manifest.rewind.speed,1);
assert.ok(Math.abs(manifest.rewind.timelineDuration-flightLegs[3].duration)<1e-12);
assert.equal(manifest.rewind.frameCount,1+Math.round(flightLegs[3].duration*manifest.fps));
assert.equal(manifest.rewind.videoDuration,manifest.rewind.frameCount/manifest.fps);
assert.equal(Object.keys(manifest.files).length,36);
const clips=[];
for(let leg=0;leg<3;leg++)for(const direction of ['forward','reverse'])for(const portrait of [false,true])for(const format of ['mp4','webm'])
 clips.push({name:`transition-${leg}-${direction}${portrait?'-portrait':''}.${format}`,portrait,format,timing:manifest.transitions[leg]});
for(const portrait of [false,true])for(const format of ['mp4','webm']){
 const name=`rewind${portrait?'-portrait':''}.${format}`;
 assert.equal((portrait?manifest.rewind.portrait:manifest.rewind)[format],name);
 clips.push({name,portrait,format,timing:manifest.rewind});
}
assert.equal(clips.length,28);
for(const {name,portrait,format,timing} of clips){
 await verify(name);
 const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,pix_fmt,level,width,height,r_frame_rate,nb_frames:format=duration','-of','json',fileURLToPath(new URL('media/'+name,base))],{encoding:'utf8'});
 assert.equal(probe.status,0,probe.stderr);
 const info=JSON.parse(probe.stdout),stream=info.streams[0];
 assert.equal(stream.codec_name,format==='webm'?'av1':'h264');
 assert.equal(stream.pix_fmt,format==='webm'?'yuv420p10le':'yuv420p');
 if(format==='mp4')assert.equal(stream.level,portrait?32:42,'H.264 fallback must remain compatible with older decoders');
 assert.equal(stream.height,manifest.height);assert.equal(stream.width,portrait?manifest.height*portraitAspect:manifest.width);
 assert.equal(stream.r_frame_rate,`${manifest.fps}/1`);
 if(stream.nb_frames)assert.equal(Number(stream.nb_frames),timing.frameCount);
 assert.ok(Math.abs(Number(info.format.duration)-timing.videoDuration)<.002,`Incorrect duration: ${name}`);
}
async function verify(name){
 const path=new URL('media/'+name,base),entry=manifest.files[name];
 assert.ok(entry,`Missing asset in manifest: ${name}`);
 assert.equal((await stat(path)).size,entry.bytes);
 assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),entry.sha256,`Corrupted asset: ${name}`);
 checked++;
}
console.log(`Verified ${checked} media assets: source hashes, exact camera timing, portrait crops, frame rates, dimensions, durations and checksums.`);
