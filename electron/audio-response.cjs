const fs = require('node:fs');
const {Readable} = require('node:stream');
async function audioResponse(file, request) {
 const {size} = await fs.promises.stat(file);
 const headers = {'Content-Type':'audio/wav', 'Accept-Ranges':'bytes', 'Cache-Control':'no-store'};
 let start=0, end=size-1, status=200;
 const range=request.headers.get('range');
 if(range) {
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match || (!match[1]&&!match[2])) return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  if(!match[1]) {const suffix=Number(match[2]);start=Math.max(0,size-suffix);}
  else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end) return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=String(end-start+1);
 return new Response(request.method==='HEAD'?null:Readable.toWeb(fs.createReadStream(file,{start,end})),{status,headers});
}
module.exports={audioResponse};
