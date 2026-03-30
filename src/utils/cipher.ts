function decryptResIndex(encData: Uint8Array, key: string): Uint8Array {
  const keyBytes = Buffer.from(key, 'utf-8');
  const keyLength = keyBytes.length;
  const result = new Uint8Array(encData.length);
  for (let i = 0; i < encData.length; i++) {
    const encByte = encData[i]!;
    const keyByte = keyBytes[i % keyLength]!;
    result[i] = (encByte - keyByte + 256) % 256;
  }
  return result;
}

function encryptResIndex(plainData: Uint8Array, key: string): Uint8Array {
  const keyBytes = Buffer.from(key, 'utf-8');
  const keyLength = keyBytes.length;
  const result = new Uint8Array(plainData.length);
  for (let i = 0; i < plainData.length; i++) {
    const plainByte = plainData[i]!;
    const keyByte = keyBytes[i % keyLength]!;
    result[i] = (plainByte + keyByte) % 256;
  }
  return result;
}

export default {
  decryptResIndex,
  encryptResIndex,
};
