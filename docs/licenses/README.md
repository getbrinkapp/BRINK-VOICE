# Audio dependencies

RNNoise WASM: @jitsi/rnnoise-wasm 0.2.1, Apache-2.0 wrapper, BSD-3-Clause RNNoise.
The unmodified synchronous distribution is included as electron/vendor/rnnoise.mjs (extension renamed for Node import).
Source and notices: https://github.com/jitsi/rnnoise-wasm
RNNoise source: https://github.com/xiph/rnnoise
See RNNOISE-WASM.txt and RNNOISE.txt.

FFmpeg executable supplied through ffmpeg-static 5.3.0. The executable is unpacked from Electron's archive for local processing. The macOS arm64 binary matches the official b6.1.1 release asset byte-for-byte; it reports FFmpeg 6.0 and includes a nonfree build flag. The bundled license text does not itself grant redistribution rights for every enabled component. This local development package is not a cleared public redistribution. See FFMPEG.txt, FFMPEG-BUILD.txt and FFMPEG-VERSION.txt for upstream notices and actual build configuration.
Downloads, build instructions and corresponding source references: https://github.com/eugeneware/ffmpeg-static/releases and https://github.com/eugeneware/ffmpeg-static
FFmpeg source: https://ffmpeg.org/download.html

No audio is uploaded by these effects.
