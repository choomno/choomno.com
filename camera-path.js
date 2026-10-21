// Canonical reading frames and projection coordinates. Flight cameras may end
// at deck-equivalent lifts, so text projection retains these canonical stations.
export {
 readingPhase,readingRadii,readingFrames,textPlaneDepth,
 routeLengths,routeJoinPhases,galleryJoinPhases,readingPose
} from './camera-routes/camera-baseline.mjs';
export {flightLegs,flightDurations,flightPose} from './flight-path.js';
import {flightPose} from './flight-path.js';
export const loopPose=progress=>flightPose(3,progress);
