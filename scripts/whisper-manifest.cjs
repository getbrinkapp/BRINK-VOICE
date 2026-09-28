const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'../runtime/whisper');const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:'1.9.4',commit:'927cfce34f31707e17f2bff35c349632fb9e2c3a',platform:'darwin',arch:'arm64',model:'base',files:{'bin/whisper-cli':sha256('bin/whisper-cli'),'models/ggml-base.bin':sha256('models/ggml-base.bin')}},null,2)+'\n');
