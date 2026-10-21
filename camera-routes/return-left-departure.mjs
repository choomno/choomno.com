// Remove the obsolete reading departure from the closing flight. Its lateral
// velocity is nonpositive until the original trajectory resumes at 3.1 s.
import {dot,apply} from '../intrinsic.js';
const column=(frame,index)=>frame.map(row=>row[index]);
function bezier(coefficients,t){
 let values=coefficients.slice();
 while(values.length>1)values=values.slice(1).map((value,i)=>(1-t)*values[i]+t*value);
 return values[0];
}
export function wrapReturnDeparture(leg){
 const join=3.1,start=leg.pose(0),right=column(start,1),up=column(start,2),forward=column(start,3);
 const lateral=seconds=>dot(right,column(leg.pose(seconds/leg.duration),0));
 // Symmetric five-point derivatives avoid a noisy acceleration constraint.
 const h=.001,positions=[-2,-1,0,1,2].map(i=>lateral(join+i*h));
 const [a,b,x,c,d]=positions;
 const velocity=(a-8*b+8*c-d)/(12*h);
 const acceleration=(-a+16*b-30*x+16*c-d)/(12*h*h);
 const w=(8*x/join-2*velocity+join*acceleration/7)/4;
 const velocityControls=[0,0,w,w,w,w,velocity-join*acceleration/7,velocity];
 if(velocityControls.some(value=>value>0))throw Error('Return departure must remain leftward');
 const positionControls=[0];
 for(const value of velocityControls)positionControls.push(positionControls.at(-1)+join*value/8);
 function pose(progress){
  const seconds=progress*leg.duration,original=leg.pose(progress);
  if(seconds<=0||seconds>=join)return original;
  const source=column(original,0),newX=bezier(positionControls,seconds/join);
  const y=dot(up,source),z=dot(forward,source);
  const eye=apply(start,[Math.sqrt(1+newX*newX+y*y+z*z),newX,y,z]);
  // Geodesic parallel transport preserves the original attitude at the new eye.
  const sum=source.map((value,i)=>value+eye[i]),denominator=1-dot(source,eye);
  const axes=[1,2,3].map(index=>{
   const axis=column(original,index),factor=dot(axis,eye)/denominator;
   return axis.map((value,i)=>value+factor*sum[i]);
  });
  return eye.map((value,i)=>[value,...axes.map(axis=>axis[i])]);
 }
 return {...leg,pose,departureCorrection:{join,velocityControls,positionControls,endpoint:{position:x,velocity,acceleration}}};
}
