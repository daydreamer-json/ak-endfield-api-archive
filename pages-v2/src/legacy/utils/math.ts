import logger from './logger.js';

export default {
  arrayMax(array: Array<number>) {
    return array.reduce((a, b) => Math.max(a, b));
  },

  arrayMin(array: Array<number>) {
    return array.reduce((a, b) => Math.min(a, b));
  },

  arrayTotal(array: Array<number>) {
    return array.reduce((acc, f) => acc + f, 0);
  },

  arrayAvg(array: Array<number>) {
    return this.arrayTotal(array) / array.length;
  },

  rounder(method: 'floor' | 'ceil' | 'round', num: number, n: number) {
    const pow = Math.pow(10, n);
    let result: number;
    switch (method) {
      case 'floor':
        result = Math.floor(num * pow) / pow;
        break;
      case 'ceil':
        result = Math.ceil(num * pow) / pow;
        break;
      case 'round':
        result = Math.round(num * pow) / pow;
        break;
    }
    return {
      orig: result,
      padded: result.toFixed(n),
    };
  },

  formatFileSize(
    bytes: number,
    options: {
      decimals: number;
      decimalPadding: boolean;
      useBinaryUnit: boolean;
      useBitUnit: boolean;
      unitVisible: boolean;
      unit: 'B' | 'K' | 'M' | 'G' | 'T' | 'P' | 'E' | 'Z' | 'Y' | null;
    },
  ) {
    const k = options.useBinaryUnit ? 1024 : 1000;
    const dm = options.decimals < 0 ? 0 : options.decimals;

    const baseUnits = ['B', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
    const binaryUnitSuffix = options.useBitUnit ? 'ib' : 'iB';
    const siUnitSuffix = options.useBitUnit ? 'b' : 'B';

    const getUnitString = (i: number) => {
      if (i === 0) return options.useBitUnit ? 'b' : 'B';
      return baseUnits[i] + (options.useBinaryUnit ? binaryUnitSuffix : siUnitSuffix);
    };

    let value = bytes < 0 ? 0 : Math.floor(bytes);
    if (options.useBitUnit) {
      value *= 8;
    }

    let i: number;
    if (options.unit !== null) {
      i = baseUnits.indexOf(options.unit);
      if (i === -1) throw new Error(`Invalid unit: ${options.unit}`);
    } else {
      if (value === 0) {
        i = 0;
      } else {
        i = Math.floor(Math.log(value) / Math.log(k));
        i = Math.max(0, Math.min(baseUnits.length - 1, i)); // clamp
      }
    }

    const resultValue = value / Math.pow(k, i);

    let formattedValue: string;
    if (options.decimalPadding) {
      formattedValue = resultValue.toFixed(dm);
    } else {
      formattedValue = resultValue.toFixed(dm).replace(/\.?0+$/, '');
    }

    return formattedValue + (options.unitVisible ? ' ' + getUnitString(i) : '');
  },

  secureRandomFloatInRange(min: number, max: number): number {
    if (min > max) [min, max] = [max, min];
    const crypto = globalThis.crypto;
    if (!crypto) {
      throw new Error('Cryptographically secure random float number gen is not available');
    }
    const randomValues = new Uint32Array(2);
    crypto.getRandomValues(randomValues);
    const highBits = randomValues[1]! & 0x1fffff; // 0x1FFFFF = 2^21 - 1
    const lowBits = randomValues[0];
    const combined = highBits * 0x100000000 + lowBits!; // 0x100000000 = 2^32
    const randomFraction = combined / 0x20000000000000; // 0x20000000000000 = 2^53
    return randomFraction * (max - min) + min;
  },

  secureRandomIntInRange(min: number, max: number, writeLog: boolean = false): number {
    if (min === max) {
      writeLog ? logger.write(`randomInt: Range=${min}-${max}, Output=${min}`) : undefined;
      return min;
    }
    if (min > max) [min, max] = [max, min];
    const crypto = globalThis.crypto;
    if (!crypto) {
      throw new Error('Cryptographically secure random int number gen is not available');
    }

    // convert to integer anyway
    const minInt = Math.ceil(min);
    const maxInt = Math.floor(max);

    // safe integer check
    if (!Number.isSafeInteger(minInt) || !Number.isSafeInteger(maxInt)) {
      throw new Error('Range boundaries must be within safe integer limits');
    }

    // valid range check
    if (minInt > maxInt) {
      throw new Error('Invalid range after integer conversion: min > max');
    }

    const range = maxInt - minInt + 1;

    if (range <= 0 || range > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Range size must be between 1 and ${Number.MAX_SAFE_INTEGER} inclusive`);
    }

    // 53-bit random num gen
    const MAX_53 = BigInt(1) << BigInt(53); // 2^53
    const rangeBigInt = BigInt(range);
    const maxAcceptable = MAX_53 - (MAX_53 % rangeBigInt);

    // generate
    const randomBuffer = new Uint32Array(2);
    while (true) {
      crypto.getRandomValues(randomBuffer);
      const highBits = randomBuffer[1]! & 0x1fffff; // use lower 21-bit only
      const lowBits = randomBuffer[0];
      const combined = BigInt(highBits) * BigInt(0x100000000) + BigInt(lowBits!); // 0x100000000 = 2^32
      // accept condition: combined < maxAcceptable
      if (combined < maxAcceptable) {
        const offset = Number(combined % rangeBigInt); // 0 to range-1
        writeLog
          ? logger.write(
              `randomInt: Range=${min}-${max}, Raw=0x${new Uint8Array(randomBuffer).toHex()}, Output=${minInt + offset}`,
            )
          : undefined;
        return minInt + offset;
      }
    }
  },
};
