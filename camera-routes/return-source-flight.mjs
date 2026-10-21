// Complete return composition before the final duration/speed parameterization.
import {returnPose,returnDuration} from './return-composition-draft.mjs';
import {evenReturnRoll} from './return-even-roll.mjs';
import {earlierReturnClock} from './return-earlier-start-study.mjs';
import {earlierSecondTurnClock} from './return-earlier-second-turn-study.mjs';

export const returnSourceDuration=returnDuration;
export function returnSourcePose(seconds){
 const source=earlierReturnClock(earlierSecondTurnClock(seconds)[0]);
 return evenReturnRoll(returnPose(source/returnSourceDuration),source);
}
