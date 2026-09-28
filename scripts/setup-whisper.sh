#!/bin/bash
# Build the pinned local speech engine and fetch its verified multilingual model.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'The bundled Whisper runtime currently targets macOS Apple Silicon.' >&2
  exit 1
fi
source_commit=927cfce34f31707e17f2bff35c349632fb9e2c3a
model_sha1=465707469ff3a37a2b9b8d8f89f2f99de7299dac
mkdir -p work runtime/whisper/bin runtime/whisper/models
if [[ ! -d work/whisper-src/.git ]]; then
  git clone --depth 1 --branch v1.9.4 https://github.com/ggml-org/whisper.cpp.git work/whisper-src
fi
[[ "$(git -C work/whisper-src rev-parse HEAD)" == "$source_commit" ]] || { echo 'Unexpected Whisper source revision.' >&2; exit 1; }
cmake_bin="${CMAKE_BIN:-cmake}"
if ! command -v "$cmake_bin" >/dev/null && [[ -x work/whisper-build-tools/cmake/data/bin/cmake ]]; then
  cmake_bin=work/whisper-build-tools/cmake/data/bin/cmake
fi
"$cmake_bin" -S work/whisper-src -B work/whisper-src/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DGGML_NATIVE=OFF -DGGML_METAL_EMBED_LIBRARY=ON -DCMAKE_OSX_DEPLOYMENT_TARGET=13.3
"$cmake_bin" --build work/whisper-src/build --target whisper-cli -j 6
cp work/whisper-src/build/bin/whisper-cli runtime/whisper/bin/whisper-cli
model=runtime/whisper/models/ggml-base.bin
if [[ ! -f "$model" ]] || [[ "$(shasum "$model" | awk '{print $1}')" != "$model_sha1" ]]; then
  curl -fL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o "$model.partial"
  [[ "$(shasum "$model.partial" | awk '{print $1}')" == "$model_sha1" ]] || { echo 'Whisper model checksum mismatch.' >&2; exit 1; }
  mv "$model.partial" "$model"
fi
cp work/whisper-src/LICENSE docs/licenses/WHISPER-CPP.txt
node scripts/whisper-manifest.cjs
