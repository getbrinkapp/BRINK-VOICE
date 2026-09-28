const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const ID=/^[a-f0-9-]{36}$/;
const text=(s,n)=>typeof s==='string'&&s.length<=n?s:(()=>{throw Error('Ungültiger Text.');})();
async function atomic(file,data){const tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(data,null,2),{flag:'wx'});await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}}
class Library {
 constructor(file){this.file=file;this.queue=Promise.resolve();this.data={scripts:[],projects:[]};}
 async init(){try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(!Array.isArray(data.scripts)||!Array.isArray(data.projects))throw Error('Bibliothek beschädigt.');this.data=data;}catch(e){if(e.code!=='ENOENT')throw e;}return this.view();}
 view(){return {scripts:this.data.scripts.map(s=>({...s})),projects:this.data.projects.map(({id,name,root,core})=>({id,name,linked:!!root||!!core,core:!!core}))};}
 async mutate(fn){const task=this.queue.then(async()=>{const next=structuredClone(this.data);const result=fn(next);await atomic(this.file,next);this.data=next;return result;});this.queue=task.catch(()=>{});return task;}
 project(id){return this.data.projects.find(p=>p.id===id);}
 async projectSave(value){return this.mutate(data=>{const name=text(value.name,100).trim();if(!name)throw Error('Bitte einen Projektnamen eingeben.');let project=data.projects.find(p=>p.id===value.id);if(!project){project={id:randomUUID()};data.projects.push(project);}project.name=name;return {...project};});}
 async linkProject(id,root){return this.mutate(data=>{const p=data.projects.find(p=>p.id===id);if(!p)throw Error('Projekt nicht gefunden.');p.root=root;return {id,name:p.name,linked:true};});}
 async scriptSave(value){return this.mutate(data=>{if(value.id&&!ID.test(value.id))throw Error('Ungültiges Script.');const title=text(value.title,160).trim()||'Unbenanntes Script',body=text(value.text,2*1024*1024);if(value.projectId&&!data.projects.some(p=>p.id===value.projectId))throw Error('Projekt nicht gefunden.');let script=data.scripts.find(s=>s.id===value.id);if(!script){script={id:value.id||randomUUID(),created:Date.now()};data.scripts.push(script);}Object.assign(script,{title,text:body,projectId:value.projectId||null,updated:Date.now()});return {...script};});}
 async scriptRemove(id){return this.mutate(data=>{data.scripts=data.scripts.filter(s=>s.id!==id);return true;});}
}
module.exports={Library,atomic,text};
