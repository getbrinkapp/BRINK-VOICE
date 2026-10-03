// Isolated test authority, never imported by production or shipped in builds.
const path=require('node:path');
const fs=require('node:fs');
function startTestCore(temp, tool='voice') {
  const root=path.resolve(__dirname,'../../..'),profile=path.join(temp,'core-authority');
  fs.mkdirSync(profile,{recursive:true});process.env.BRINK_CORE_PROFILE=profile;
  const ready=require(path.join(root,'electron/core/rpc.cjs')).serve(root,profile,async(method,args)=>{
    if(method==='ping')return {version:1};
    if(method.startsWith('client.'))return true;
    if(method==='authorize' && args[0]===tool)return {allowed:true};
    if(method==='projects' && args[0]===tool)return [];
    throw Error('Unsupported test method');
  });
  // Import the application synchronously (scheme registration precedes ready),
  // but wait for the local test authority before its first native Core request.
  const client=require(path.join(root,'electron/core/client.cjs')),callAt=client.callAt;
  client.callAt=async(...args)=>{await ready;return callAt(...args);};
  return ready;
}
module.exports={startTestCore};
