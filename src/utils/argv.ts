type argvType = {
  [prop: string]: any;
};
let argv: argvType | null = null;
export default {
  setArgv: (argvIn: object) => {
    argv = argvIn;
  },
  getArgv: () => {
    if (argv === null) throw new Error('argv is null');
    return argv;
  },
};
