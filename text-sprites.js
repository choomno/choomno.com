import {projectReadingPlaneWithDepth, readingPhase} from './projection.js?v=return-arrival-1';
import {routeJoinPhases} from './camera-path.js?v=final-flight-11';
import {returnTextPose} from './return-text-projection.js';
const copies = [...document.querySelectorAll('main > section .reading-copy')];
let lastPhase = 0, sizes = [], enabled = false, returning = false;

function measure() {
 sizes = copies.map(copy => {
  const css = getComputedStyle(copy);
  return {width: parseFloat(css.width), height: parseFloat(css.height)};
 });
}
export function projectText(phase) {
 lastPhase = phase;
 if (!enabled) return;
 const stationIndex = returning ? (phase===0?0:-1) : copies.findIndex((_, i) => phase === readingPhase(i));
 const returnCamera = returning ? returnTextPose(phase) : null;
 copies.forEach((copy, i) => {
  const {width, height} = sizes[i];
  if (i === stationIndex && width > 0 && height > 0 && innerWidth > 0 && innerHeight > 0) {
   // At its reading pose the projective plane is exactly this centered rectangle.
   // A true 2D transform lets the browser repaint sharp text after perspective motion.
   copy.style.visibility = 'visible';
   copy.style.opacity = '1';
   copy.style.transform = `translate(${(innerWidth - width) / 2}px, ${(innerHeight - height) / 2}px)`;
   copy.style.willChange = 'auto';
   copy.inert = false;
   return;
  }
  const separation = Math.abs(phase - readingPhase(i));
  const galleryTravel=phase>routeJoinPhases[2]&&phase<routeJoinPhases[3];
  const phaseOpacity = returning ? (i===0&&returnCamera?1:0) : stationIndex >= 0 || galleryTravel ? 0 : Math.max(0, 1 - (separation / (Math.PI / 4)) ** 4);
  const projection = phaseOpacity > 0 && projectReadingPlaneWithDepth(phase, readingPhase(i), width, height, innerWidth, innerHeight,returning?returnCamera:undefined);
  const opacity = phaseOpacity * (projection?.nearOpacity ?? 0);
  const matrix = opacity > 0 && projection?.matrix;
  copy.style.visibility = matrix ? 'visible' : 'hidden';
  copy.style.opacity = String(opacity);
  copy.inert = !matrix || separation > Math.PI / 8;
  copy.style.transform = matrix ? `matrix3d(${matrix.join(',')})` : '';
  copy.style.willChange = matrix ? 'transform, opacity' : 'auto';
 });
}
export function setReturnProjection(value){returning=value;projectText(lastPhase);}
export function setTextProjection(value) {
 enabled = value;
 document.documentElement.classList.toggle('projected-text', value);
 if (value) {measure(); projectText(lastPhase);}
 else copies.forEach(copy => {copy.style.transform='';copy.style.visibility='';copy.style.opacity='';copy.style.willChange='';copy.inert=false;});
}
export function initTextSprites() {
 document.documentElement.classList.add('projected-text');
 enabled = true;
 measure();
 const observer = new ResizeObserver(() => {measure(); projectText(lastPhase);});
 copies.forEach(copy => observer.observe(copy));
 window.addEventListener('resize', () => {measure(); projectText(lastPhase);});
 projectText(0);
}
