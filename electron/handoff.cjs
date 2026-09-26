const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {wavInfo}=require('./edits.cjs');
const safeName=name=>(name||'VOICE').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').slice(0,100)||'VOICE';
async function projectFolder(root){const real=await fs.realpath(root),file=path.join(real,'project.json');const stat=await fs.stat(file);if(stat.size>8*1024*1024)throw Error('Projektdatei zu groß.');const data=JSON.parse(await fs.readFile(file,'utf8'));if(!data || typeof data!=='object')throw Error('Kein BRINK-Projektordner.');return {root:real,name:typeof data.name==='string'?data.name:path.basename(real)};}
async function deliver(source,root,name){const project=await projectFolder(root),dir=path.join(project.root,'media','sounds');await fs.mkdir(dir,{recursive:true});const realDir=await fs.realpath(dir);if(!realDir.startsWith(project.root+path.sep))throw Error('Der Audioordner liegt außerhalb des Projekts.');
 for(let i=0;i<10000;i++){const file=path.join(realDir,`${safeName(name)}${i?' ('+(i+1)+')':''}.wav`);try{await fs.copyFile(source,file,fs.constants.COPYFILE_EXCL);return {path:file,name:path.basename(file)};}catch(e){if(e.code!=='EEXIST')throw e;}}
 throw Error('Kein freier Dateiname gefunden.');
}
async function cine(source,destination,name){const audio=destination.replace(/\.brinkvideo$/i,'')+'-'+randomUUID().slice(0,8)+'.wav';await fs.copyFile(source,audio,fs.constants.COPYFILE_EXCL);const {duration}=await wavInfo(source),mediaId=randomUUID();
 const data={format:'brink-videoeditor',version:1,media:[{id:mediaId,path:audio,folderId:null,duration,width:0,height:0}],tracks:[{id:randomUUID(),type:'audio',name:'Voice-over',volume:1,clips:[{id:randomUUID(),mediaId,type:'audio',start:0,sourceStart:0,duration,volume:1,speed:1,fadeIn:0,fadeOut:0}]}],folders:[],settings:{name:safeName(name),width:1920,height:1080,frameRate:30},maskAssets:{}};
 const temp=destination+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(data,null,2),{flag:'wx'});await fs.rename(temp,destination);}catch(e){await fs.unlink(audio).catch(()=>{});throw e;}finally{await fs.unlink(temp).catch(()=>{});}return {path:destination};
}
module.exports={projectFolder,deliver,cine,safeName};
