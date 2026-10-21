// Read-only geometric clock candidate: advance the second-axis turn without changing its locus.
import {secondCylinderGeometry as baseline} from './return-second-cylinder-study.mjs';
function smoothJet(t,a,b){if(t<=a)return[0,0,0];if(t>=b)return[1,0,0];const h=b-a,u=(t-a)/h;return[u**3*(10-15*u+6*u*u),30*u*u*(1-u)**2/h,60*u*(1-u)*(1-2*u)/h**2];}
export const earlierSecondTurnClockTimes={start:15.5,peak:18,end:22.5,advance:.8};
export function earlierSecondTurnClock(t){if(t<=15.5||t>=22.5)return[t,1,0];const q=t<=18?smoothJet(t,15.5,18):smoothJet(t,18,22.5),s=t<=18?1:-1,d=t<=18?q[0]:1-q[0];return[t+.8*d,1+.8*s*q[1],.8*s*q[2]];}
export function earlierSecondTurnGeometry(t){const[c,v,a]=earlierSecondTurnClock(t),g=baseline(c);return{...g,eye:g.eye,velocity:g.velocity.map(x=>x*v),acceleration:g.acceleration.map((x,i)=>x*v*v+g.velocity[i]*a)};}
