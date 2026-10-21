import {dot} from './intrinsic.js';
import {masterAspect} from './media-settings.js';
import {readingPhase,readingPose,readingFrames,routeLengths,routeJoinPhases,textPlaneDepth} from './camera-path.js?v=final-flight-11';
export {readingPhase,readingPose} from './camera-path.js?v=final-flight-11';

// The gallery uses a parallel-transported lateral boost at its text mounts.
// Express it at the canonical station so its deck-equivalent destination has
// exactly the same text transform as the rendered camera.
export function projectionPose(phase){
 const start=readingPhase(1),end=readingPhase(2);
 let station,distance;
 if(phase>start&&phase<=routeJoinPhases[2]){
  station=readingFrames[1];distance=(phase/start-1)*routeLengths[1];
 }else if(phase>=routeJoinPhases[3]&&phase<end){
  station=readingFrames[2];distance=(phase/start-2)*routeLengths[1];
 }else return readingPose(phase);
 const c=Math.cosh(distance),s=Math.sinh(distance);
 return station.map(row=>[c*row[0]+s*row[1],s*row[0]+c*row[1],row[2],row[3]]);
}

export const fieldScale = .82;
// object-fit:cover crops the vertical field on viewports wider than a master.
// Apply the identical focal length to the text so rays remain aligned.
export const viewportFieldScale=(width,height)=>fieldScale*Math.min(1,masterAspect*height/width);

// Fade the whole transparent plane before any corner reaches the near clip.
// The quintic joins constant opacity with zero first and second derivatives.
export function nearPlaneOpacity(minimumDepth) {
 if (minimumDepth <= textPlaneDepth * .25) return 0;
 if (minimumDepth >= textPlaneDepth * .875) return 1;
 const t = (minimumDepth / textPlaneDepth - .25) / .625;
 return Math.max(0, Math.min(1, t * t * t * (10 - 15 * t + 6 * t * t)));
}

// A homogeneous plane in the hyperboloid's projective (Klein) model.
// Its four corners have the same time coordinate and unit Lorentz norm.
// Interpolating projectively gives a totally geodesic plane in H^3.
export function projectReadingPlaneWithDepth(phase, stationPhase, width, height, viewportWidth, viewportHeight, camera=projectionPose(phase)) {
 if (!(width > 0 && height > 0 && viewportWidth > 0 && viewportHeight > 0)) return null;
 const station = readingPose(stationPhase);
 const scale = viewportFieldScale(viewportWidth,viewportHeight);
 const z = textPlaneDepth, half = z * scale * width / viewportHeight, vertical = half * height / width;
 const time = Math.sqrt(1 + half * half + vertical * vertical + z * z);
 const apply = (m, v) => m.map(row => row.reduce((sum, x, i) => sum + x * v[i], 0));
 const spatial = v => [1, 2, 3].map(col => dot(camera.map(row => row[col]), apply(station, v)));
 const origin = spatial([time, -half, vertical, z]);
 const dx = spatial([0, 2 * half / width, 0, 0]);
 const dy = spatial([0, 0, -2 * vertical / height, 0]);
 const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) =>
  origin.map((v, i) => v + dx[i] * x + dy[i] * y));
 const minimumDepth = Math.min(...corners.map(p => p[2]));
 const nearOpacity = nearPlaneOpacity(minimumDepth);
 if (minimumDepth <= textPlaneDepth * .025) return {matrix: null, minimumDepth, nearOpacity};
 const focal = viewportHeight / (2 * scale), denominator = origin[2];
 const horizontal = p => (viewportWidth / 2 * p[2] + focal * p[0]) / denominator;
 const downward = p => (viewportHeight / 2 * p[2] - focal * p[1]) / denominator;
 const matrix = [horizontal(dx), downward(dx), 0, dx[2] / denominator,
  horizontal(dy), downward(dy), 0, dy[2] / denominator,
  0, 0, 1, 0, horizontal(origin), downward(origin), 0, 1];
 return {matrix, minimumDepth, nearOpacity};
}

// Preserve the matrix-only API for geometric incidence checks and other callers.
export function projectReadingPlane(...args) {
 return projectReadingPlaneWithDepth(...args)?.matrix ?? null;
}
