const cliTableConfig = {
  rounded: {
    chars: {
      top: '─',
      'top-mid': '',
      'top-left': '╭',
      'top-right': '╮',
      bottom: '─',
      'bottom-mid': '',
      'bottom-left': '╰',
      'bottom-right': '╯',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '',
      right: '│',
      'right-mid': '┤',
      middle: '',
    },
    style: { 'padding-left': 1, 'padding-right': 1, head: [''], border: [''], compact: true },
  },
  noBorder: {
    chars: {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
      middle: ' ',
    },
    style: { 'padding-left': 0, 'padding-right': 0 },
  },
};

export default {
  cliTableConfig,
};
