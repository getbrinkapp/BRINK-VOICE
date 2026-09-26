const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
function parseLidState(text){const m=/"AppleClamshellState"\s*=\s*(Yes|No)/.exec(text);return m?m[1]==='Yes':null;}
async function inputStatus(systemPreferences){
 if(process.platform!=='darwin')return {lidClosed:null,permission:'unknown'};
 let lidClosed=null;
 try{const {stdout}=await promisify(execFile)('/usr/sbin/ioreg',['-r','-k','AppleClamshellState','-d','1'],{timeout:1500,maxBuffer:2*1024*1024});lidClosed=parseLidState(stdout);}catch{}
 return {lidClosed,permission:systemPreferences.getMediaAccessStatus('microphone')};
}
module.exports={inputStatus,parseLidState};
