// Clamp an adjustment in sample units so neighbouring cuts cannot cross.
export function adjustCut(cuts, index, part, delta, duration, rate) {
  const original=cuts[index];
  if(!original || !['start','end','move'].includes(part) || !Number.isFinite(delta))return original;
  const a=Math.round(original[0]*rate),b=Math.round(original[1]*rate);
  const lower=Math.round((cuts[index-1]?.[1] || 0)*rate);
  const upper=Math.round((cuts[index+1]?.[0] ?? duration)*rate);
  const step=Math.round(delta*rate),minimum=Math.min(b-a,Math.max(1,Math.round(.01*rate)));
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  if(part==='start')return [clamp(a+step,lower,b-minimum)/rate,b/rate];
  if(part==='end')return [a/rate,clamp(b+step,a+minimum,upper)/rate];
  const shift=clamp(step,lower-a,upper-b);
  return [(a+shift)/rate,(b+shift)/rate];
}
