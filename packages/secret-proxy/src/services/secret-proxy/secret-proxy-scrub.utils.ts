import { Transform } from 'node:stream';
import { SECRET_PROXY } from './secret-proxy.constants';
import type { SecretProxyScrubForm, SecretProxySwap } from '../../types/secret-proxy.types';

function secretProxyScrubBase64Core(value: Buffer, offset: number) {
  const encoded = Buffer.concat([Buffer.alloc(offset), value]).toString('base64');

  return encoded.slice(Math.ceil((8 * offset) / 6), Math.floor((8 * (offset + value.length) - 6) / 6) + 1);
}

export function secretProxyScrubForms(swaps: SecretProxySwap[]): SecretProxyScrubForm[] {
  return swaps.flatMap(({ placeholder, value }) => {
    const bytes = Buffer.from(value);
    const urlEncoded = encodeURIComponent(value);

    const base64 = [0, 1, 2].map((offset) => secretProxyScrubBase64Core(bytes, offset))
      .filter((core) => core.length >= SECRET_PROXY.encodedFormMinLength)
      .flatMap((core) => [core, core.replaceAll('+', '-').replaceAll('/', '_')]);

    const forms = new Set([
      value,
      urlEncoded,
      urlEncoded.replaceAll(/%[\dA-F]{2}/gu, (escape) => escape.toLowerCase()),
      JSON.stringify(value).slice(1, -1),
      ...base64,
    ]);

    return [...forms].filter(Boolean).map((form) => ({ match: Buffer.from(form), replacement: Buffer.from(placeholder) }));
  });
}

export function secretProxyScrubText(forms: SecretProxyScrubForm[], text: string) {
  return forms.reduce((result, { match, replacement }) => result.replaceAll(match.toString('latin1'), replacement.toString('latin1')), text);
}

export function secretProxyScrubStream(forms: SecretProxyScrubForm[]) {
  const holdBytes = Math.max(...forms.map(({ match }) => match.length)) - 1;
  let held = Buffer.alloc(0);

  function secretProxyScrubHoldLength(buffer: Buffer) {
    const lengths = Array.from({ length: Math.min(holdBytes, buffer.length) }, (_, index) => Math.min(holdBytes, buffer.length) - index);

    return lengths.find((length) => forms.some(({ match }) => match.length > length
      && buffer.subarray(buffer.length - length).equals(match.subarray(0, length)))) ?? 0;
  }

  function secretProxyScrubNext(buffer: Buffer, position: number, found: number[]) {
    let next: { index: number; form: SecretProxyScrubForm } | null = null;

    for (const [formIndex, form] of forms.entries()) {
      if (found[formIndex] !== -1 && found[formIndex] < position) {
        found[formIndex] = buffer.indexOf(form.match, position);
      }

      const index = found[formIndex];
      const isEarlier = index !== -1 && (!next || index < next.index || (index === next.index && form.match.length > next.form.match.length));

      if (isEarlier) {
        next = { index, form };
      }
    }

    return next;
  }

  function secretProxyScrubBuffer(buffer: Buffer, isLast: boolean) {
    const parts: Buffer[] = [];
    const safeEnd = isLast ? buffer.length : buffer.length - secretProxyScrubHoldLength(buffer);
    const found = forms.map(({ match }) => buffer.indexOf(match));
    let position = 0;
    let next = secretProxyScrubNext(buffer, position, found);

    while (next && next.index < safeEnd) {
      parts.push(buffer.subarray(position, next.index), next.form.replacement);
      position = next.index + next.form.match.length;
      next = secretProxyScrubNext(buffer, position, found);
    }

    const emitEnd = Math.max(position, safeEnd);

    parts.push(buffer.subarray(position, emitEnd));
    held = Buffer.from(buffer.subarray(emitEnd));

    return Buffer.concat(parts);
  }

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      callback(null, secretProxyScrubBuffer(held.length ? Buffer.concat([held, chunk]) : chunk, false));
    },
    flush(callback) {
      callback(null, secretProxyScrubBuffer(held, true));
    },
  });
}
