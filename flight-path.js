import {flightLegs as sourceLegs} from './camera-routes/flight-legs.mjs';
import {wrapReturnDeparture} from './camera-routes/return-left-departure.mjs';
export const flightLegs=sourceLegs.map((leg,index)=>index===3?wrapReturnDeparture(leg):leg);
export const flightDurations=flightLegs.map(leg=>Math.round(leg.duration*1000));
export function flightPose(leg,progress){
 if(!Number.isInteger(leg)||!flightLegs[leg])throw new RangeError('Unknown flight leg');
 return flightLegs[leg].pose(Math.max(0,Math.min(1,progress)));
}
