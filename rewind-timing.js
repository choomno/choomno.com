export const rewindDuration=22300;
// Scroll is only the navigation coordinate; the closing flight has its own camera.
export function rewindProgress(elapsed){
 return 3*(1-Math.max(0,Math.min(1,elapsed/rewindDuration)));
}
