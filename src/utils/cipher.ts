function processResIndex(data: Uint8Array, key: string, isEncrypt: boolean): Uint8Array {
  const keyBytes = Buffer.from(key, 'utf-8');
  const result = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i++) {
    const keyByte = keyBytes[i % keyBytes.length]!;
    result[i] = isEncrypt ? (data[i]! + keyByte) % 256 : (data[i]! - keyByte + 256) % 256;
  }
  return result;
}

function decryptResIndex(encData: Uint8Array, key: string): Uint8Array {
  return processResIndex(encData, key, false);
}

function encryptResIndex(plainData: Uint8Array, key: string): Uint8Array {
  return processResIndex(plainData, key, true);
}

export default { decryptResIndex, encryptResIndex };
