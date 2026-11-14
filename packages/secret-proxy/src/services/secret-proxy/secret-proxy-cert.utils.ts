import * as x509 from '@peculiar/x509';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { createSecureContext } from 'node:tls';
import { SECRET_PROXY } from './secret-proxy.constants';
import type { SecretProxyCertAuthority } from '../../types/secret-proxy.types';

function secretProxyCertValidity() {
  const notBefore = new Date(Date.now() - SECRET_PROXY.certValidFromMs);

  return { serialNumber: `01${randomBytes(15).toString('hex')}`, notBefore, notAfter: new Date(notBefore.getTime() + SECRET_PROXY.certLifetimeMs) };
}

function secretProxyCertKeys() {
  return crypto.subtle.generateKey(SECRET_PROXY.certAlgorithm, true, ['sign', 'verify']);
}

export async function secretProxyCertAuthority(): Promise<SecretProxyCertAuthority> {
  const caKeys = await secretProxyCertKeys();
  const leafKeys = await secretProxyCertKeys();

  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    ...secretProxyCertValidity(),
    name: 'CN=MeetVinci secrets proxy',
    keys: caKeys,
    signingAlgorithm: SECRET_PROXY.certAlgorithm,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  });

  const leafKey = x509.PemConverter.encode(await crypto.subtle.exportKey('pkcs8', leafKeys.privateKey), 'PRIVATE KEY');

  return { caCert, caKey: caKeys.privateKey, leafPublicKey: leafKeys.publicKey, leafKey, contexts: new Map() };
}

export async function secretProxyCertContext(authority: SecretProxyCertAuthority, hostname: string) {
  const cached = authority.contexts.get(hostname);

  if (cached) {
    return cached;
  }

  const cert = await x509.X509CertificateGenerator.create({
    ...secretProxyCertValidity(),
    subject: new x509.Name([{ CN: [hostname] }]),
    issuer: authority.caCert.subjectName,
    publicKey: authority.leafPublicKey,
    signingKey: authority.caKey,
    signingAlgorithm: SECRET_PROXY.certAlgorithm,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([{ type: isIP(hostname) ? 'ip' : 'dns', value: hostname }]),
      await x509.AuthorityKeyIdentifierExtension.create(authority.caCert),
    ],
  });

  const context = createSecureContext({ cert: cert.toString('pem'), key: authority.leafKey });

  if (authority.contexts.size >= SECRET_PROXY.certCacheMax) {
    authority.contexts.clear();
  }

  authority.contexts.set(hostname, context);

  return context;
}
