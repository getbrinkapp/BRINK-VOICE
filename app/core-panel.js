(() => {
    const api=window.brinkCore;
    const node=(tag,text,className)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
    window.BrinkCorePanel={mount(options){
        if(!api)return;
        const button=node('button','BRINK Projekte','brink-core-trigger');button.type='button';
        const host=document.querySelector(options.host);if(!host)return;host.prepend(button);
        const panel=node('dialog',null,'brink-core-panel');panel.setAttribute('aria-label','BRINK Projekte');
        const heading=node('header'),title=node('h2','Mit BRINK verbunden'),close=node('button','Schließen');close.type='button';heading.append(title,close);
        const status=node('p','', 'brink-core-status');status.setAttribute('role','status');
        const content=node('div',null,'brink-core-content'),side=node('div',null,'brink-core-projects'),detail=node('section',null,'brink-core-detail');content.append(side,detail);panel.append(heading,status,content);document.body.append(panel);
        let current=null,busy=false;
        async function action(fn){if(busy)return;busy=true;panel.setAttribute('aria-busy','true');status.textContent='Wird vorbereitet …';try{await fn();}catch(error){status.textContent=error.message;}finally{busy=false;panel.removeAttribute('aria-busy');}}
        const control=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=()=>action(fn);return b;};
        async function open(request){const result=await options.open(request);if(result?.ok===false)throw Error('Bitte zuerst die laufende Bearbeitung oder den offenen Dialog abschließen.');panel.close();}
        async function select(project){
            const tool=options.tool();current=project;detail.replaceChildren();
            const snapshot=await api.inspect(tool,project.id);title.textContent=project.name;
            const intro=node('p',`${snapshot.assets.length} Medien · ${snapshot.documents.length} Creative-Dokumente`);
            const actions=node('div',null,'brink-core-actions');
            actions.append(control('Projekt öffnen',()=>open({tool,projectId:project.id,documentId:null,assetId:null,intent:'open'})));
            if(options.publish)actions.append(control(options.publishLabel||'Ergebnis hinzufügen',async()=>{const result=await options.publish(project.id);status.textContent=result?.name?`${result.name} wurde dem Projekt hinzugefügt.`:'Ergebnis wurde hinzugefügt.';await select(project);}));
            if(options.attach)actions.append(control('Dokument verknüpfen',async()=>{await options.attach(project.id);status.textContent='Bearbeitbares Dokument verknüpft.';await select(project);}));
            if(options.script)actions.append(control('Script an BRINK zurückgeben',async()=>{await options.script(project.id);status.textContent='Script in BRINK aktualisiert.';}));
            detail.append(intro,actions);
            const docs=snapshot.documents.filter(d=>d.tool===tool);
            if(docs.length){detail.append(node('h3','Weiterarbeiten'));for(const doc of docs)detail.append(control(doc.title,()=>open({tool,projectId:project.id,documentId:doc.id,assetId:null,intent:'open'})));}
            detail.append(node('h3','Projektmaterial'));
            const assets=snapshot.assets.filter(asset=>options.accepts?.(asset)!==false);
            if(!assets.length)detail.append(node('p','Noch kein passendes Material. Importiere Medien in BRINK oder füge ein Ergebnis hinzu.'));
            for(const asset of assets)detail.append(control(`${asset.name} · ${asset.kind==='audio'?'Audio':asset.kind==='video'?'Video':'Bild'}`,()=>open({tool,projectId:project.id,assetId:asset.id,documentId:null,intent:'open'})));
        }
        async function refresh(){side.replaceChildren();const projects=await api.projects(options.tool());for(const project of projects)side.append(control(project.name,async()=>{await select(project);status.textContent='Aktueller Projektbestand aus BRINK CORE.';}));if(!projects.length){detail.replaceChildren(node('p','Noch keine BRINK-Projekte vorhanden. Lege zuerst ein Projekt in BRINK an.'));title.textContent='BRINK Projekte';}else if(current&&projects.some(p=>p.id===current.id))await select(projects.find(p=>p.id===current.id));else await select(projects[0]);}
        button.onclick=()=>{if(document.querySelector('dialog[open]'))return;panel.showModal();void action(async()=>{await refresh();status.textContent='Originale bleiben unverändert. Ergebnisse werden als neue Medien hinzugefügt.';});};
        close.onclick=()=>{if(!busy)panel.close();};panel.addEventListener('cancel',event=>{if(busy)event.preventDefault();});panel.addEventListener('close',()=>button.focus());
        window.addEventListener('focus',()=>{if(panel.open&&!busy)void action(refresh);});
    }};
})();
