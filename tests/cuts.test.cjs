const {test}=require('node:test'),assert=require('node:assert/strict');
test('manual handles and whole regions clamp at neighbours, file edges and minimum cut length',async()=>{
 const {adjustCut}=await import('../app/js/cuts.mjs');const cuts=[[0,.4],[1,2],[3,4]],rate=48000;
 assert.deepEqual(adjustCut(cuts,1,'start',.03,4,rate),[1.03,2]);
 assert.deepEqual(adjustCut(cuts,1,'end',-.04,4,rate),[1,1.96]);
 assert.deepEqual(adjustCut(cuts,1,'start',10,4,rate),[1.99,2]);
 assert.deepEqual(adjustCut(cuts,1,'end',-10,4,rate),[1,1.01]);
 assert.deepEqual(adjustCut(cuts,1,'start',-10,4,rate),[.4,2]);
 assert.deepEqual(adjustCut(cuts,1,'end',10,4,rate),[1,3]);
 assert.deepEqual(adjustCut(cuts,1,'move',.12,4,rate),[1.12,2.12]);
 assert.deepEqual(adjustCut(cuts,1,'move',100,4,rate),[2,3]);
 assert.deepEqual(adjustCut(cuts,1,'move',-100,4,rate),[.4,1.4]);
 assert.deepEqual(adjustCut(cuts,0,'start',-1,4,rate),[0,.4]);
 assert.deepEqual(adjustCut(cuts,2,'end',1,4,rate),[3,4]);
 assert.deepEqual(cuts,[[0,.4],[1,2],[3,4]]);
 const exact=adjustCut(cuts,1,'start',.001,4,44100);assert.equal(exact[0],44144/44100);
});
