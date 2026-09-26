const {test} = require('node:test'); const assert = require('node:assert/strict');
test('subtitle import strips cue metadata, preserves spoken text and normalizes line endings', async () => {
 const {cleanScript} = await import('../app/js/core.mjs');
 assert.equal(cleanScript('1\r\n00:00:00,000 --> 00:00:02,000\r\nHallo <b>BRINK</b>!\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nWeiter.','test.srt'),'Hallo BRINK!\n\nWeiter.');
 assert.equal(cleanScript('WEBVTT\n\nNOTE Kommentar\nNicht sprechen\n\nintro\n00:00.000 --> 00:02.000\nHallo &amp; willkommen','test.vtt'),'Hallo & willkommen');
 assert.equal(cleanScript('<script>alert(1)</script>','text.txt'),'<script>alert(1)</script>');
});
test('timer supports long takes and empty scripts', async () => {const {timeLabel, wordCount}=await import('../app/js/core.mjs'); assert.equal(timeLabel(3661),'01:01:01');assert.equal(wordCount('   '),0);assert.equal(wordCount('Hallo\n BRINK'),2);});
test('input selection avoids silent virtual defaults, preserves explicit devices and recovers removed inputs',async()=>{
 const {chooseInput}=await import('../app/js/core.mjs');const devices=[{kind:'audioinput',deviceId:'default',label:'Default - Speaker Audio Recorder (Virtual)'},{kind:'audioinput',deviceId:'built-in',label:'MacBook Pro-Mikrofon (Built-in)'},{kind:'audioinput',deviceId:'teams',label:'Teams Audio (Virtual)'}];
 assert.equal(chooseInput(devices),'built-in');assert.equal(chooseInput(devices,'teams'),'teams');assert.equal(chooseInput(devices,'missing'),'built-in');assert.equal(chooseInput(devices,'default'),'default');assert.equal(chooseInput([]),'');
 assert.equal(chooseInput([{kind:'audioinput',deviceId:'default',label:'Default - USB microphone'}]),'default');
});
