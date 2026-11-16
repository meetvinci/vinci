import { createNodePhotonImages } from '@earendil-works/pi-durable/images/node';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RUNTIME_IMAGE } from './runtime-image.constants';
import type { RuntimeImageSize } from '../../types/runtime.types';
import type { createReadTool, ImageProcessor } from '@earendil-works/pi-durable/tools';

const runtimeImageRefusals = new AsyncLocalStorage<string[]>();

export async function runtimeImageService(): Promise<ImageProcessor> {
  const photon = await createNodePhotonImages({ idleMs: RUNTIME_IMAGE.idleMs });
  let queue = Promise.resolve();

  return {
    prepare: async (bytes, mimeType, limits) => {
      const refusal = runtimeImageRefusal(bytes, mimeType);

      if (refusal) {
        runtimeImageRefusals.getStore()?.push(refusal);

        return undefined;
      }

      const prepared = queue.then(() => photon.prepare(bytes, mimeType, limits));

      queue = prepared.then(() => undefined, () => undefined);

      return prepared;
    },
  };
}

export function runtimeImageReadTool(read: ReturnType<typeof createReadTool>): ReturnType<typeof createReadTool> {
  return {
    ...read,
    execute: async (args, api, context) => {
      const refusals: string[] = [];
      const result = await runtimeImageRefusals.run(refusals, () => read.execute(args, api, context));
      const [refusal] = refusals;

      return refusal ? { output: [], isError: true, diagnostics: [{ severity: 'error' as const, code: 'image_refused', message: refusal }] } : result;
    },
  };
}

function runtimeImageRefusal(bytes: Uint8Array, mimeType: string) {
  const size = runtimeImageSize(bytes, mimeType);

  if (!size) {
    return RUNTIME_IMAGE.unknownSize(mimeType);
  }

  const pixels = size.width * size.height;

  return pixels > RUNTIME_IMAGE.maxPixels ? RUNTIME_IMAGE.tooLarge(size.width, size.height, (pixels / 1e6).toFixed(1)) : undefined;
}

function runtimeImageSize(bytes: Uint8Array, mimeType: string): RuntimeImageSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sizes = runtimeImageSizes(bytes, view, mimeType);

  return sizes.length === 0 ? undefined : sizes.reduce((largest, size) => (size.width * size.height > largest.width * largest.height ? size : largest));
}

function runtimeImageSizes(bytes: Uint8Array, view: DataView, mimeType: string): RuntimeImageSize[] {
  try {
    if (mimeType === 'image/png') {
      return runtimeImagePng(bytes, view);
    }

    if (mimeType === 'image/jpeg') {
      return runtimeImageJpeg(bytes, view);
    }

    if (mimeType === 'image/gif') {
      return runtimeImageGif(bytes, view);
    }

    if (mimeType === 'image/webp') {
      return runtimeImageWebp(bytes, view, 12, bytes.length);
    }

    return mimeType === 'image/bmp' ? runtimeImageBmp(view) : [];
  } catch {
    return [];
  }
}

function runtimeImageText(bytes: Uint8Array, at: number, length: number) {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function runtimeImagePng(bytes: Uint8Array, view: DataView) {
  const sizes: RuntimeImageSize[] = [];

  if (!RUNTIME_IMAGE.pngSignature.every((byte, index) => bytes[index] === byte)) {
    return sizes;
  }

  for (let at = 8; at + 8 <= bytes.length; at += 12 + view.getUint32(at)) {
    const kind = runtimeImageText(bytes, at + 4, 4);

    if (kind === 'IHDR') {
      sizes.push({ width: view.getUint32(at + 8), height: view.getUint32(at + 12) });
    }

    if (kind === 'fcTL') {
      sizes.push({ width: view.getUint32(at + 12), height: view.getUint32(at + 16) });
    }
  }

  return sizes;
}

function runtimeImageJpeg(bytes: Uint8Array, view: DataView) {
  const sizes: RuntimeImageSize[] = [];

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return sizes;
  }

  let at = 2;
  let scans = 0;

  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;

    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += marker === 0xff ? 1 : 2;
    } else if (marker === 0xd9) {
      break;
    } else {
      if (RUNTIME_IMAGE.jpegFrames.some((frame) => frame === marker)) {
        sizes.push({ width: view.getUint16(at + 7), height: view.getUint16(at + 5) });
      }

      at += 2 + view.getUint16(at + 2);
      at = marker === RUNTIME_IMAGE.jpegScan ? runtimeImageJpegScan(bytes, at) : at;
      scans += marker === RUNTIME_IMAGE.jpegScan ? 1 : 0;

      // SAFETY: each progressive scan walks every block of the image again, so a few thousand tiny scans keep Photon busy for minutes.
      if (scans > RUNTIME_IMAGE.jpegMaxScans) {
        return [];
      }
    }
  }

  return sizes;
}

function runtimeImageJpegScan(bytes: Uint8Array, start: number) {
  for (let at = bytes.indexOf(0xff, start); at !== -1; at = bytes.indexOf(0xff, at + 1)) {
    const next = bytes[at + 1] ?? 0;

    if (next !== 0x00 && next !== 0xff && (next < 0xd0 || next > 0xd7)) {
      return at;
    }
  }

  return bytes.length;
}

function runtimeImageGif(bytes: Uint8Array, view: DataView) {
  const sizes: RuntimeImageSize[] = [];

  if (runtimeImageText(bytes, 0, 4) !== 'GIF8') {
    return sizes;
  }

  sizes.push({ width: view.getUint16(6, true), height: view.getUint16(8, true) });

  let at = 13 + runtimeImageGifTable(view.getUint8(10));

  while (at < bytes.length && bytes[at] !== RUNTIME_IMAGE.gifTrailer) {
    if (bytes[at] === RUNTIME_IMAGE.gifImage) {
      sizes.push({ width: view.getUint16(at + 5, true), height: view.getUint16(at + 7, true) });
      at = runtimeImageGifBlocks(bytes, at + 11 + runtimeImageGifTable(view.getUint8(at + 9)));
    } else if (bytes[at] === RUNTIME_IMAGE.gifExtension) {
      at = runtimeImageGifBlocks(bytes, at + 2);
    } else {
      break;
    }
  }

  return sizes;
}

function runtimeImageGifTable(flags: number) {
  return flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0;
}

function runtimeImageGifBlocks(bytes: Uint8Array, start: number) {
  let at = start;

  while (at < bytes.length && bytes[at] !== 0) {
    at += (bytes[at] ?? 0) + 1;
  }

  return at + 1;
}

function runtimeImageWebp(bytes: Uint8Array, view: DataView, start: number, end: number): RuntimeImageSize[] {
  const sizes: RuntimeImageSize[] = [];

  if (start === 12 && (runtimeImageText(bytes, 0, 4) !== 'RIFF' || runtimeImageText(bytes, 8, 4) !== 'WEBP')) {
    return sizes;
  }

  for (let at = start; at + 8 <= end; at += 8 + view.getUint32(at + 4, true) + (view.getUint32(at + 4, true) % 2)) {
    const kind = runtimeImageText(bytes, at, 4);
    const data = at + 8;

    if (kind === 'VP8X') {
      sizes.push({ width: 1 + runtimeImageUint24(view, data + 4), height: 1 + runtimeImageUint24(view, data + 7) });
    }

    if (kind === 'VP8 ') {
      sizes.push({ width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff });
    }

    if (kind === 'VP8L') {
      const bits = view.getUint32(data + 1, true);

      sizes.push({ width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 });
    }

    if (kind === 'ANMF') {
      sizes.push({ width: 1 + runtimeImageUint24(view, data + 6), height: 1 + runtimeImageUint24(view, data + 9) });
      sizes.push(...runtimeImageWebp(bytes, view, data + 16, Math.min(end, data + view.getUint32(at + 4, true))));
    }
  }

  return sizes;
}

function runtimeImageUint24(view: DataView, at: number) {
  return view.getUint16(at, true) + view.getUint8(at + 2) * 0x10000;
}

function runtimeImageBmp(view: DataView) {
  if (view.getUint16(0) !== 0x424d) {
    return [];
  }

  return view.getUint32(14, true) === 12
    ? [{ width: view.getUint16(18, true), height: view.getUint16(20, true) }]
    : [{ width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) }];
}
