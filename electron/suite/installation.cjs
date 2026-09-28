const fs=require('node:fs');
const path=require('node:path');

function isCoreRoot(root) {
    try{return JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name==='brink'&&fs.statSync(path.join(root,'electron/core/main.cjs')).isFile();}catch{return false;}
}
function resolveRoot(developmentRoot,appData) {
    if(isCoreRoot(developmentRoot))return developmentRoot;
    const file=path.join(appData,'brink','suite-installation.json');
    try {
        const stat=fs.lstatSync(file);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw Error();
        const catalog=JSON.parse(fs.readFileSync(file,'utf8'));
        if(catalog.version===1&&typeof catalog.coreRoot==='string'&&path.isAbsolute(catalog.coreRoot)&&isCoreRoot(catalog.coreRoot))return catalog.coreRoot;
    }catch{}
    throw Error('BRINK CORE wurde nicht gefunden. Bitte BRINK einmal öffnen oder die gemeinsame Suite-Installation reparieren.');
}
function runtime(root) {
    let executable,args,cwd;
    if(root.endsWith('app.asar')) {
        const resources=path.dirname(root);
        if(process.platform==='darwin')executable=path.resolve(resources,'../MacOS/BRINK');
        else if(process.platform==='win32')executable=path.resolve(resources,'../BRINK.exe');
        else executable=path.resolve(resources,'../brink');
        args=[];cwd=path.dirname(executable);
    }else {
        const distribution=path.join(root,'node_modules/electron/dist');
        executable=path.resolve(distribution,fs.readFileSync(path.join(root,'node_modules/electron/path.txt'),'utf8').trim());
        if(!executable.startsWith(distribution+path.sep))throw Error('Ungültige BRINK-Laufzeit.');
        args=[root];cwd=root;
    }
    if(!fs.statSync(executable).isFile())throw Error('Die BRINK-Laufzeit fehlt.');
    return {executable,args,cwd};
}
function registerInstallation(root,appData) {
    if(!isCoreRoot(root))throw Error('Ungültige Core-Installation.');
    const directory=path.join(appData,'brink');fs.mkdirSync(directory,{recursive:true});
    const file=path.join(directory,'suite-installation.json');
    require('./projects.cjs').atomic(file,{version:1,coreRoot:root});
}
module.exports={isCoreRoot,resolveRoot,runtime,registerInstallation};
