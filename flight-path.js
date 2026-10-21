import {flightLegs} from './camera-routes/flight-legs.mjs';
export {flightLegs};
export const flightDurations=flightLegs.map(leg=>Math.round(leg.duration*1000));
export function flightPose(leg,progress){
 if(!Number.isInteger(leg)||!flightLegs[leg])throw new RangeError('Unknown flight leg');
 return flightLegs[leg].pose(Math.max(0,Math.min(1,progress)));
}
