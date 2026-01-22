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
};
