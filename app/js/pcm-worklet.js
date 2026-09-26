class PCMRecorder extends AudioWorkletProcessor {
  constructor() {
    super(); this.recording = false; this.buffer = new Int16Array(4096); this.count = 0; this.levelCount = 0; this.peak = 0; this.energy = 0;
    this.port.onmessage = ({data}) => {
      if (data.type === 'record') {this.recording = true; this.port.postMessage({type:'ack', token:data.token});}
      if (data.type === 'pause' || data.type === 'stop') {
        this.recording = false; this.flush(); this.port.postMessage({type: 'ack', token: data.token});
      }
    };
  }
  flush() {
    if (!this.count) return;
    const samples = this.buffer.slice(0, this.count);
    this.port.postMessage({type: 'pcm', buffer: samples.buffer}, [samples.buffer]); this.count = 0;
  }
  process(inputs) {
    if (!inputs[0]?.[0]) return true;
    const channels = inputs[0];
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i];
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      this.peak = Math.max(this.peak, Math.abs(sample)); this.energy += sample * sample; this.levelCount++;
      if(this.levelCount >= 512) {this.port.postMessage({type:'level', peak:this.peak, rms:Math.sqrt(this.energy/this.levelCount)});this.levelCount=0;this.peak=0;this.energy=0;}
      if(!this.recording) continue;
      this.buffer[this.count++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
      if (this.count === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('pcm-recorder', PCMRecorder);
