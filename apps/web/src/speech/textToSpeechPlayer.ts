import { msg } from "gt-react";
import { useSyncExternalStore } from "react";

import { toastManager } from "../components/ui/toast";
import { m } from "../i18n/messages";

import type { TextToSpeechRequest, TextToSpeechResponse } from "./textToSpeech.worker";

export type TextToSpeechPlayback =
  | { readonly status: "idle" }
  | { readonly status: "loading" | "playing"; readonly key: string };

// Kokoro holds ~200 MB in the worker; let it go when nothing has been read for a while.
const IDLE_UNLOAD_MS = 5 * 60_000;

let playback: TextToSpeechPlayback = { status: "idle" };
const listeners = new Set<() => void>();
let worker: Worker | null = null;
let unloadTimer: ReturnType<typeof setTimeout> | null = null;
let audio: AudioContext | null = null;
let nextId = 0;
let current: {
  id: number;
  key: string;
  sources: Set<AudioBufferSourceNode>;
  playAt: number;
  finished: boolean;
} | null = null;

function setPlayback(next: TextToSpeechPlayback) {
  playback = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** This reply's playback; other replies' changes don't re-render it. */
export function useTextToSpeechPlayback(key: string) {
  return useSyncExternalStore(subscribe, () =>
    playback.status !== "idle" && playback.key === key ? playback.status : "idle",
  );
}

function send(message: TextToSpeechRequest) {
  if (unloadTimer) clearTimeout(unloadTimer);
  unloadTimer = null;
  worker ??= createWorker();
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage takes no target origin
  worker.postMessage(message);
}

function createWorker() {
  const next = new Worker(new URL("./textToSpeech.worker.ts", import.meta.url), {
    type: "module",
  });
  next.onmessage = (event: MessageEvent<TextToSpeechResponse>) => receive(event.data);
  return next;
}

function scheduleUnload() {
  if (unloadTimer) clearTimeout(unloadTimer);
  unloadTimer = setTimeout(unloadTextToSpeech, IDLE_UNLOAD_MS);
}

function finish(error?: string) {
  const ended = current;
  current = null;
  if (ended) for (const source of ended.sources) source.stop();
  setPlayback({ status: "idle" });
  if (error) {
    toastManager.add({
      type: "error",
      title: m(msg("Could not read the reply aloud")),
      description: error,
    });
  }
  scheduleUnload();
}

function receive(message: TextToSpeechResponse) {
  if (!current || message.id !== current.id || !audio) return;
  if (message.type === "error") return finish(message.message);
  if (message.type === "done") {
    current.finished = true;
    if (current.sources.size === 0) finish();
    return;
  }
  const buffer = audio.createBuffer(1, message.audio.length, message.sampleRate);
  buffer.copyToChannel(new Float32Array(message.audio), 0);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  const playing = current;
  playing.playAt = Math.max(playing.playAt, audio.currentTime);
  source.start(playing.playAt);
  playing.playAt += buffer.duration;
  playing.sources.add(source);
  source.onended = () => {
    playing.sources.delete(source);
    if (current === playing && playing.finished && playing.sources.size === 0) finish();
  };
  if (playback.status !== "playing") setPlayback({ status: "playing", key: playing.key });
}

/** Reads `text` aloud, replacing anything already playing. `key` identifies the reply for its button. */
export function speakText(key: string, text: string) {
  stopSpeaking();
  audio ??= new AudioContext();
  void audio.resume();
  const id = ++nextId;
  current = { id, key, sources: new Set(), playAt: 0, finished: false };
  setPlayback({ status: "loading", key });
  send({ type: "speak", id, text });
}

export function stopSpeaking() {
  if (!current) return;
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage takes no target origin
  worker?.postMessage({ type: "cancel", id: current.id } satisfies TextToSpeechRequest);
  finish();
}

export function unloadTextToSpeech() {
  stopSpeaking();
  if (unloadTimer) clearTimeout(unloadTimer);
  unloadTimer = null;
  worker?.terminate();
  worker = null;
}
