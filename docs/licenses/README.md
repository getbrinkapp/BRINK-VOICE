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

Whisper transcription: whisper.cpp v1.9.4, pinned commit 927cfce34f31707e17f2bff35c349632fb9e2c3a. MIT license in WHISPER-CPP.txt. Static arm64 CLI with Accelerate/Metal; only Apple system frameworks are dynamically linked. Source: https://github.com/ggml-org/whisper.cpp/tree/v1.9.4

Multilingual Whisper Base model: converted ggml weights from https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-base.bin ; SHA-1 465707469ff3a37a2b9b8d8f89f2f99de7299dac as published in whisper.cpp/models/README.md. OpenAI Whisper MIT license in WHISPER-MODEL.txt. Upstream: https://github.com/openai/whisper

The JFK test fixture is copied from whisper.cpp/samples/jfk.wav, a short excerpt of the 1961 US presidential inaugural address. It is used only in development tests and excluded from the packaged app.
