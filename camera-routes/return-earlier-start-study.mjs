// A small source-time advance after the reading departure; identity from 4 s.
const begin=.9,crest=1.8,end=4,advance=.25;
const smooth=u=>u*u*u*(10+u*(-15+6*u));
export function earlierReturnClock(seconds){
 if(seconds<=begin||seconds>=end)return seconds;
 const shift=seconds<crest?smooth((seconds-begin)/(crest-begin)):1-smooth((seconds-crest)/(end-crest));
 return seconds+advance*shift;
}
export function earlierReturnClockJet(seconds){
 if(seconds<=begin||seconds>=end)return[seconds,1,0];
 const rising=seconds<crest,h=rising?crest-begin:end-crest,u=(seconds-(rising?begin:crest))/h,sign=rising?1:-1;
 return[earlierReturnClock(seconds),1+sign*advance*30*u*u*(1-u)*(1-u)/h,sign*advance*60*u*(1-u)*(1-2*u)/(h*h)];
}
export const earlierReturnClockSpecification={begin,crest,end,advance,appliesTo:'Complete composed frame, including the roll correction, evaluated at the shifted source time'};
