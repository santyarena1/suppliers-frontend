"use client";

import { useEffect, useState } from "react";

let unread = 0;
const unreadListeners = new Set<() => void>();

let connected = false;
const connectionListeners = new Set<() => void>();

let activeThreadId: string | null = null;
const SOUND_KEY = "nodo.chat.sound";

export function getChatUnread() {
  return unread;
}

export function setChatUnread(n: number) {
  unread = Math.max(0, n);
  unreadListeners.forEach((fn) => fn());
}

export function bumpChatUnread() {
  setChatUnread(unread + 1);
}

export function useChatUnread() {
  const [value, setValue] = useState(unread);
  useEffect(() => {
    const fn = () => setValue(unread);
    unreadListeners.add(fn);
    return () => {
      unreadListeners.delete(fn);
    };
  }, []);
  return value;
}

export function setChatConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  connectionListeners.forEach((fn) => fn());
}

export function useChatConnection() {
  const [value, setValue] = useState(connected);
  useEffect(() => {
    const fn = () => setValue(connected);
    connectionListeners.add(fn);
    return () => {
      connectionListeners.delete(fn);
    };
  }, []);
  return value;
}

export function setActiveChatThread(threadId: string | null) {
  activeThreadId = threadId;
}

export function getActiveChatThread() {
  return activeThreadId;
}

export function chatSoundEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_KEY) !== "0";
}

export function setChatSoundEnabled(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? "1" : "0");
}

export function playChatSound() {
  if (!chatSoundEnabled() || typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    /* autoplay o contexto bloqueado */
  }
}

export function draftKey(threadId: string) {
  return `nodo.chat.draft.${threadId}`;
}

export function mutedKey(id: string) {
  return `nodo.chat.muted.${id}`;
}

export function isChatMuted(id: string) {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(mutedKey(id)) === "1";
}

export function setChatMuted(id: string, muted: boolean) {
  if (muted) localStorage.setItem(mutedKey(id), "1");
  else localStorage.removeItem(mutedKey(id));
}
