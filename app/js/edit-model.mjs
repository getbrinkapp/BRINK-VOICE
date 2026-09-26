export const defaultEffects={isolation:0,highpass:0,gate:0,gateThreshold:-48,dynamics:0,compressor:false,threshold:-18,ratio:3,attack:8,release:120,makeup:0,bass:0,lowMid:0,mid:0,presence:0,air:0,deesser:0,normalize:false,target:-16,output:0,limiter:false};
export const presets={
 original:{label:'Unbearbeitet',values:{...defaultEffects}},
 natural:{label:'Natürlich & klar',values:{...defaultEffects,isolation:35,highpass:70,deesser:20,compressor:true,threshold:-20,ratio:2,makeup:2,normalize:true,limiter:true}},
 warm:{label:'Warm & voll',values:{...defaultEffects,isolation:40,highpass:65,bass:3,lowMid:-2,presence:1,compressor:true,threshold:-20,ratio:3,makeup:3,deesser:25,normalize:true,limiter:true}},
 podcast:{label:'Podcast / Broadcast',values:{...defaultEffects,isolation:65,highpass:80,gate:20,dynamics:30,compressor:true,threshold:-22,ratio:4,makeup:3,bass:2,lowMid:-2,presence:2,air:1,deesser:35,normalize:true,limiter:true}},
 noisy:{label:'Unruhige Umgebung',values:{...defaultEffects,isolation:90,highpass:100,gate:30,gateThreshold:-45,compressor:true,ratio:2,normalize:true,limiter:true}}
};
export function mergeCuts(cuts,duration){const result=[];for(const [a,b]of cuts.map(c=>[Math.max(0,c[0]),Math.min(duration,c[1])]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0])){const last=result.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else result.push([a,b]);}return result;}
export function outputToSource(time,cuts,duration){let previous=0;for(const [a,b]of cuts){const length=a-previous;if(time<length)return previous+time;time-=length;previous=b;}return Math.min(duration,previous+time);}
export function sourceToOutput(time,cuts){let result=time;for(const [a,b]of cuts)result-=Math.max(0,Math.min(time,b)-a);return Math.max(0,result);}
export class EditHistory {
 constructor(value){this.value=structuredClone(value);this.past=[];this.future=[];}
 commit(value){if(JSON.stringify(value)===JSON.stringify(this.value))return false;this.past.push(structuredClone(this.value));if(this.past.length>100)this.past.shift();this.value=structuredClone(value);this.future=[];return true;}
 undo(){if(!this.past.length)return false;this.future.push(this.value);this.value=this.past.pop();return true;}
 redo(){if(!this.future.length)return false;this.past.push(this.value);this.value=this.future.pop();return true;}
}
