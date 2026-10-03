// Shared native adapter. The renderer receives IDs/capabilities, never Core
// credentials, executable paths, arbitrary filesystem access or a generic RPC.
const path=require('node:path');
const fs=require('node:fs');
const {app,ipcMain,dialog}=require('electron');
function createCoreBridge({tools,trusted,getWindow}) {
    const installationRoot=app.getAppPath().endsWith('app.asar')
        ? app.getAppPath() : path.resolve(__dirname,'../../../..');
    const profile=process.env.BRINK_CORE_PROFILE || path.join(app.getPath('appData'),'brink');
    const call=(method,args=[])=>{
        const root=require('./installation.cjs').resolveRoot(installationRoot,app.getPath('appData'));
        return require(path.join(root,'electron/core/client.cjs')).callAt(root,profile,method,args);
    };
    let checkedAt=0,allowed=false,adapter={},checking;
    const authorize=async(tool=tools[0],force=false)=>{
        if(!tools.includes(tool))throw Error('Unbekannter Workspace.');
        if(!force&&allowed&&Date.now()-checkedAt<15000)return true;
        if(!checking)checking=call('authorize',[tool]).then(()=>{allowed=true;checkedAt=Date.now();return true;}).catch(error=>{allowed=false;throw error;}).finally(()=>{checking=null;});
        return checking;
    };
    const safeSnapshot=snapshot=>({...snapshot,assets:snapshot.assets.map(({path,...asset})=>asset)});
    function handle(name,fn) { ipcMain.handle('brink-core:'+name,async(event,...args)=>{if(!trusted(event))throw Error('Zugriff verweigert.');return fn(...args);}); }
    handle('projects',async(tool)=>{await authorize(tool);return call('projects',[tool]);});
    handle('inspect',async(tool,id)=>{await authorize(tool);return safeSnapshot(await call('project',[tool,id]));});
    handle('open',async request=>{
        await authorize(request?.tool,true);
        const snapshot=await call('project',[request.tool,request.projectId]);
        if(request.assetId&&!snapshot.assets.some(a=>a.id===request.assetId))throw Error('Medium nicht gefunden.');
        if(request.documentId&&!snapshot.documents.some(d=>d.id===request.documentId&&d.tool===request.tool))throw Error('Dokument nicht gefunden.');
        if(!adapter.open)throw Error('Projektanbindung nicht verfügbar.');
        return adapter.open(snapshot,request);
    });
    handle('publish',async(tool,id,input)=>{
        await authorize(tool,true);
        if(!adapter.publish)throw Error('Bitte zuerst ein Ergebnis erstellen.');
        const output=await adapter.publish(tool,input);
        return call('publish',[tool,id,output]);
    });
    handle('attach',async(tool,id,nativeId)=>{
        await authorize(tool,true);
        if(!adapter.document)throw Error('Kein Dokument geöffnet.');
        const document=await adapter.document(tool,nativeId);
        return call('attach',[tool,id,document]);
    });
    handle('script',async(id,text,revision)=>{await authorize('voice',true);const result=await call('script',['voice',id,text,revision]);await adapter.scriptSaved?.(id,text,result.revision);return result;});
    handle('status',async()=>{try{await authorize(tools[0],true);return {allowed:true};}catch{return {allowed:false};}});
    async function start() {
        try{
            await authorize(tools[0],true);
            const timer=setInterval(()=>{void authorize(tools[0],true).catch(()=>{});},15000);timer.unref();
            return true;
        }
        catch(error){await dialog.showMessageBox({type:'info',title:'BRINK Studio',message:'Workspace nicht freigeschaltet',detail:error.message+' Öffne BRINK oder BRINK CONSOLE und prüfe deinen Zugang.',buttons:['Schließen']});app.quit();return false;}
    }
    return {authorize,start,call,configure:value=>{adapter=value;},get allowed(){return allowed;}};
}
module.exports={createCoreBridge};
