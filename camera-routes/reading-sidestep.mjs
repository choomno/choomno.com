// Preview-only local lateral motion. No sprite, overlay or generic path warp.
export const readingPortalDepth=.005;
export const readingSideDistance=.012;

// Columns are [eye, right, up, forward] in the hyperboloid model. This Lorentz
// boost follows the station's right-axis geodesic. Up and forward remain
// constant ambient vectors; the whole frame is parallel transported, with no
// added pan, pitch or roll. Positive distance moves the observer right.
export function sideFrame(frame,distance){
 if(!Number.isFinite(distance))throw new TypeError('Sidestep distance must be finite');
 const c=Math.cosh(distance),s=Math.sinh(distance);
 return frame.map(row=>[c*row[0]+s*row[1],s*row[0]+c*row[1],row[2],row[3]]);
}

// t is distance progress, NOT a prescribed time easing. A core must begin at
// sideFrame(start,+.012) and finish at sideFrame(end,-.012), with its tangents
// pointing along the respective transported +right axes. Match physical
// speed/acceleration at those joins; do not blend an unrelated core endpoint.
export function sidePhase(stage,t){
 if(stage!=='start'&&stage!=='end')throw new TypeError('Sidestep stage must be start or end');
 if(!Number.isFinite(t))throw new TypeError('Sidestep progress must be finite');
 const progress=Math.max(0,Math.min(1,t));
 return {stage,progress,distance:readingSideDistance*(stage==='start'?progress:progress-1),
  label:stage==='start'?'Lateral departure':'Lateral arrival'};
}

// Derivatives with respect to signed hyperbolic distance. Multiply first by
// ds/dt and second by (ds/dt)^2, adding first*d²s/dt², for a timed core join.
export function sideJet(frame,distance){
 const moved=sideFrame(frame,distance);
 return {frame:moved,position:moved.map(row=>row[0]),
  tangent:moved.map(row=>row[1]),acceleration:moved.map(row=>row[0])};
}
