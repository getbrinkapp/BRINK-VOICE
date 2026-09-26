const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'voice-hardware-check-'));app.setPath('appData',temp);app.setPath('userData',path.join(temp,'VOICE'));app.disableHardwareAcceleration();
const timer=setTimeout(()=>app.exit(2),18000);
app.on('web-contents-created',(_,wc)=>wc.once('did-finish-load',async()=>{
 try{
 const run=fn=>wc.executeJavaScript(`(${fn.toString()})()`);
 for(let i=0;i<100;i++){if(await run(()=>!!document.getElementById('record').onclick&&document.getElementById('microphone').options.length>1))break;await new Promise(r=>setTimeout(r,50));}
 const status=await run(()=>window.voice.inputStatus());const selection=await run(()=>document.getElementById('microphone').selectedOptions[0].textContent);
 if(status.lidClosed && /MacBook|Built.in/i.test(selection)){
  await run(()=>document.getElementById('record').click());
  let message='';for(let i=0;i<100;i++){message=await run(()=>document.getElementById('noticeText').textContent);if(message.includes('zugeklappt'))break;await new Promise(r=>setTimeout(r,50));}
  assert.ok(message.includes('zugeklappt'));assert.equal((await run(()=>window.voice.list())).length,0);assert.equal(await run(()=>document.body.dataset.recording),'idle');assert.equal(await run(()=>document.getElementById('record').disabled),false);
  console.log(JSON.stringify({passed:true,status,selection,message,noSilentTakeCreated:true}));
 }else console.log(JSON.stringify({status,selection,skipped:'Closed-lid prevention only runs when a closed MacBook and built-in microphone are detected.'}));
 clearTimeout(timer);app.exit(0);
 }catch(e){console.error(e);clearTimeout(timer);app.exit(1);}
}));require('../electron/main.cjs');
