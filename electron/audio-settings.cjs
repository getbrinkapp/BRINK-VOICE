const defaults={isolation:0,highpass:0,gate:0,gateThreshold:-48,dynamics:0,compressor:false,threshold:-18,ratio:3,attack:8,release:120,makeup:0,bass:0,lowMid:0,mid:0,presence:0,air:0,deesser:0,normalize:false,target:-16,output:0,limiter:true};
function settings(input={}) {
 if(!input || typeof input!=='object' || Array.isArray(input))throw Error('Ungültige Audioeinstellungen.');
 const out={...defaults};
 const ranges={isolation:[0,100],highpass:[0,200],gate:[0,100],gateThreshold:[-70,-20],dynamics:[0,100],threshold:[-48,-3],ratio:[1,12],attack:[1,100],release:[20,1000],makeup:[0,18],bass:[-12,12],lowMid:[-12,12],mid:[-12,12],presence:[-12,12],air:[-12,12],deesser:[0,100],target:[-24,-12],output:[-18,12]};
 for(const key of Object.keys(defaults))if(key in input){
  const value=input[key];
  if(typeof defaults[key]==='boolean'){if(typeof value!=='boolean')throw Error('Ungültiger Effektschalter.');}
  else if(!Number.isFinite(value)||value<ranges[key][0]||value>ranges[key][1])throw Error(`Ungültiger Effektwert: ${key}`);
  out[key]=value;
 }
 return out;
}
const linear=db=>10**(db/20);
function filters(input) {
 const s=settings(input),f=[];
 if(s.highpass)f.push(`highpass=f=${s.highpass}:p=2`);
 if(s.gate)f.push(`agate=threshold=${linear(s.gateThreshold)}:ratio=${1+s.gate/10}:range=${linear(-s.gate*.5)}:attack=10:release=160`);
 if(s.bass)f.push(`bass=g=${s.bass}:f=120:w=0.7`);
 for(const [key,hz]of [['lowMid',300],['mid',1000],['presence',3500]])if(s[key])f.push(`equalizer=f=${hz}:t=q:w=0.8:g=${s[key]}`);
 if(s.air)f.push(`treble=g=${s.air}:f=8000:w=0.7`);
 if(s.deesser)f.push(`deesser=i=${s.deesser/100}:m=0.6:f=0.5`);
 if(s.dynamics)f.push(`dynaudnorm=f=250:g=15:p=0.85:m=${1+s.dynamics*.09}:r=0.16:t=0.01`);
 if(s.compressor)f.push(`acompressor=threshold=${linear(s.threshold)}:ratio=${s.ratio}:attack=${s.attack}:release=${s.release}:makeup=${linear(s.makeup)}:knee=2.8`);
 if(s.output)f.push(`volume=${s.output}dB`);
 if(s.normalize)f.push(`loudnorm=I=${s.target}:TP=-1:LRA=7`);
 if(s.limiter)f.push('alimiter=limit=0.89125094:attack=5:release=70:level=false:latency=true');
 return f.length?f.join(','):'anull';
}
module.exports={defaults,settings,filters};
