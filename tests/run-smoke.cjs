// Electron may exit 0 on a rejected license before reaching any assertion.
// Require the explicit completion result, not merely a successful process exit.
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const executable=path.resolve(__dirname,'../node_modules/electron/dist',fs.readFileSync(path.resolve(__dirname,'../node_modules/electron/path.txt'),'utf8').trim());
const child=spawn(executable,[path.join(__dirname,'smoke.cjs')],{stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',bytes=>{output+=bytes;process.stdout.write(bytes);});child.stderr.pipe(process.stderr);
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{const complete=output.split('\n').some(line=>{try{return JSON.parse(line).passed===true;}catch{return false;}});
  if(code!==0 || !complete){console.error('VOICE smoke did not complete its audio assertions.');process.exitCode=1;}});
