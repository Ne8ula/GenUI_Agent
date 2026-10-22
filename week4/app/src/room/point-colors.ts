/** Display-only lift for sampled linear RGB. Never mutates source or surface colors. */
export const POINT_LUMINANCE_FLOOR = .14;
export function enhancePointColors(source:Float32Array):Float32Array {
  const output=source.slice();
  for(let i=0;i<output.length;i+=3) {
    const r=source[i]!,g=source[i+1]!,b=source[i+2]!;
    const luminance=.2126*r+.7152*g+.0722*b;
    if(luminance<POINT_LUMINANCE_FLOOR) {
      const mix=(POINT_LUMINANCE_FLOOR-luminance)/(1-luminance);
      output[i]=r+(1-r)*mix;output[i+1]=g+(1-g)*mix;output[i+2]=b+(1-b)*mix;
    }
  }
  return output;
}
