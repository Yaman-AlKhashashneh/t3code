import { env as transformersEnv } from "@huggingface/transformers";
import { env as kokoroEnv, KokoroTTS, TextSplitterStream } from "kokoro-js";

import {
  TEXT_TO_SPEECH_MODEL_CACHE,
  TEXT_TO_SPEECH_MODEL_ID,
  TEXT_TO_SPEECH_VOICE,
} from "./textToSpeechConstants";

export type TextToSpeechRequest =
  | { readonly type: "speak"; readonly id: number; readonly text: string }
  | { readonly type: "cancel"; readonly id: number };

export type TextToSpeechResponse =
  | {
      readonly type: "chunk";
      readonly id: number;
      readonly audio: Float32Array;
      readonly sampleRate: number;
    }
  | { readonly type: "done"; readonly id: number }
  | { readonly type: "error"; readonly id: number; readonly message: string };

// Never fetch model weights implicitly: the user installs them from Settings.
transformersEnv.allowLocalModels = false;
transformersEnv.useBrowserCache = false;
transformersEnv.useCustomCache = true;
// The bundled onnxruntime-web build locates its WASM next to itself; transformers.js defaults to a CDN.
kokoroEnv.wasmPaths = undefined as unknown as string;

let tts: Promise<KokoroTTS> | null = null;
let active: number | null = null;
let queue = Promise.resolve();

const post = (message: TextToSpeechResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer });

function load() {
  tts ??= caches.open(TEXT_TO_SPEECH_MODEL_CACHE).then((cache) => {
    transformersEnv.customCache = cache;
    // Full precision on the GPU: best Kokoro quality and faster than real time; WASM is the fallback.
    const device = "gpu" in navigator ? "webgpu" : "wasm";
    return KokoroTTS.from_pretrained(TEXT_TO_SPEECH_MODEL_ID, { dtype: "fp32", device });
  });
  tts.catch(() => {
    tts = null;
  });
  return tts;
}

async function speak(id: number, text: string) {
  if (active !== id) return;
  try {
    const model = await load();
    const splitter = new TextSplitterStream();
    splitter.push(text);
    splitter.close();
    for await (const { audio } of model.stream(splitter, { voice: TEXT_TO_SPEECH_VOICE })) {
      if (active !== id) return;
      const samples = audio.audio;
      post({ type: "chunk", id, audio: samples, sampleRate: audio.sampling_rate }, [
        samples.buffer,
      ]);
    }
    if (active === id) post({ type: "done", id });
  } catch (error) {
    if (active === id) {
      post({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
    }
  } finally {
    if (active === id) active = null;
  }
}

self.onmessage = (event: MessageEvent<TextToSpeechRequest>) => {
  const message = event.data;
  if (message.type === "speak") {
    active = message.id;
    // One inference session runs one request at a time.
    queue = queue.then(() => speak(message.id, message.text));
  } else if (active === message.id) active = null;
};
