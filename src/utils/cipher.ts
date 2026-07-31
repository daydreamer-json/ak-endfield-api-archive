import { createCipheriv, createDecipheriv } from 'node:crypto';

function processVigenere(data: Uint8Array, key: string, isEncrypt: boolean): Uint8Array {
  const keyBytes = Buffer.from(key, 'utf-8');
  const result = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i++) {
    const keyByte = keyBytes[i % keyBytes.length]!;
    result[i] = isEncrypt ? (data[i]! + keyByte) % 256 : (data[i]! - keyByte + 256) % 256;
  }
  return result;
}

function processAes(data: Uint8Array, key: string, iv: string, isEncrypt: boolean): Uint8Array {
  const keyBytes = Buffer.from(key, 'hex');
  const ivBytes = Buffer.from(iv, 'hex');

  const keyBitLen = keyBytes.length * 8;
  if (!(keyBitLen === 128 || keyBitLen === 192 || keyBitLen === 256)) throw new Error('Invalid AES key bit length');
  const algorithm = `aes-${keyBitLen}-cbc`;

  if (isEncrypt) {
    const cipher = createCipheriv(algorithm, keyBytes, ivBytes);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  } else {
    const decipher = createDecipheriv(algorithm, keyBytes, ivBytes);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}

function decryptResIndex(encData: Uint8Array, key: string): Uint8Array {
  return processVigenere(encData, key, false);
}
function encryptResIndex(plainData: Uint8Array, key: string): Uint8Array {
  return processVigenere(plainData, key, true);
}
function decryptLauncherAes(encData: Uint8Array, key: string, iv: string): Uint8Array {
  return processAes(encData, key, iv, false);
}

export default { decryptResIndex, encryptResIndex, decryptLauncherAes };
