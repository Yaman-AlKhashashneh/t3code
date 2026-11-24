import { useSyncExternalStore } from "react";

import {
  TEXT_TO_SPEECH_MODEL_CACHE as MODEL_CACHE,
  TEXT_TO_SPEECH_MODEL_ID as REPO,
  TEXT_TO_SPEECH_VOICE,
} from "./textToSpeechConstants";

const REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
// kokoro-js always requests `main` and caches voices itself; verified bytes from the pinned revision are stored under those keys.
const VOICE_CACHE = "kokoro-voices";

const FILES = [
  {
    path: "config.json",
    size: 44,
    sha256: "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f",
  },
  {
    path: "tokenizer.json",
    size: 3497,
    sha256: "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34",
  },
  {
    path: "tokenizer_config.json",
    size: 113,
    sha256: "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20",
  },
  {
    path: "onnx/model.onnx",
    size: 325_532_232,
    sha256: "8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb",
  },
  {
    path: `voices/${TEXT_TO_SPEECH_VOICE}.bin`,
    size: 522_240,
    sha256: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b",
  },
] as const;

export const TEXT_TO_SPEECH_MODEL_SIZE = FILES.reduce((total, file) => total + file.size, 0);

const cacheFor = (path: string) => (path.startsWith("voices/") ? VOICE_CACHE : MODEL_CACHE);
const cacheKey = (path: string) => `https://huggingface.co/${REPO}/resolve/main/${path}`;
const sourceUrl = (path: string) => `https://huggingface.co/${REPO}/resolve/${REVISION}/${path}`;

export type TextToSpeechModelState =
  | { readonly status: "checking" }
  | { readonly status: "missing"; readonly error?: string }
  | { readonly status: "downloading"; readonly downloaded: number }
  | { readonly status: "installed" };

let state: TextToSpeechModelState = { status: "checking" };
let download: AbortController | null = null;
const listeners = new Set<() => void>();

function setState(next: TextToSpeechModelState) {
  state = next;
  for (const listener of listeners) listener();
}

async function isInstalled() {
  for (const file of FILES) {
    const cache = await caches.open(cacheFor(file.path));
    if (!(await cache.match(cacheKey(file.path)))) return false;
  }
  return true;
}

let checked = false;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!checked) {
    checked = true;
    void isInstalled().then(
      (installed) => {
        if (state.status === "checking") setState({ status: installed ? "installed" : "missing" });
      },
      () => setState({ status: "missing" }),
    );
  }
  return () => listeners.delete(listener);
}

export function useTextToSpeechModel() {
  return useSyncExternalStore(subscribe, () => state);
}

export function useTextToSpeechModelInstalled() {
  return useSyncExternalStore(subscribe, () => state.status === "installed");
}

async function hex(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchVerified(
  file: (typeof FILES)[number],
  signal: AbortSignal,
  onBytes: (count: number) => void,
) {
  const response = await fetch(sourceUrl(file.path), { signal });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.length > file.size)
      throw new Error("Downloaded file is larger than expected");
    bytes.set(value, offset);
    offset += value.length;
    onBytes(value.length);
  }
  if (offset !== file.size || (await hex(bytes.buffer)) !== file.sha256) {
    throw new Error("Downloaded file failed verification");
  }
  return bytes;
}

export async function downloadTextToSpeechModel() {
  if (download) return;
  const controller = new AbortController();
  download = controller;
  let downloaded = 0;
  setState({ status: "downloading", downloaded });
  try {
    for (const file of FILES) {
      const cache = await caches.open(cacheFor(file.path));
      const key = cacheKey(file.path);
      if (await cache.match(key)) {
        downloaded += file.size;
        continue;
      }
      const bytes = await fetchVerified(file, controller.signal, (count) => {
        downloaded += count;
        setState({ status: "downloading", downloaded });
      });
      await cache.put(key, new Response(bytes));
    }
    setState({ status: "installed" });
  } catch (error) {
    setState(
      controller.signal.aborted
        ? { status: "missing" }
        : { status: "missing", error: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    download = null;
  }
}

export function cancelTextToSpeechModelDownload() {
  download?.abort();
}

export async function removeTextToSpeechModel() {
  download?.abort();
  await Promise.all([caches.delete(MODEL_CACHE), caches.delete(VOICE_CACHE)]);
  setState({ status: "missing" });
}
