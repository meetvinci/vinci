export function pushHasWorker() {
  return Object.hasOwn(globalThis, 'ServiceWorkerContainer') && Object.hasOwn(globalThis, 'PushManager') && Object.hasOwn(globalThis, 'Notification');
}

export function pushKeyBytes(key: string) {
  return Uint8Array.from(atob(key.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
}

export function pushSameKey(current: ArrayBuffer | null, key: Uint8Array) {
  return current !== null && current.byteLength === key.byteLength && new Uint8Array(current).every((byte, index) => byte === key[index]);
}
