export interface ResourceIndex {
  isInitial: boolean;
  files: {
    index: number;
    name: string;
    hash: string | null;
    size: number;
    type: number; // C# enum?
    md5: string;
    urlPath: any;
    manifest: number; // ???
  }[];
  types: any; // ???
  version: any; // ???
  rebootVersion: string; // ???
}

export interface ResourcePatch {
  version: string; // 6331530-16
  files: {
    name: string; // 0CE8FA57/8A8746477A4254C6069BCC7124B229A2.chk (new file)
    md5: string; // 4cd56084739f5cf92540ae9bb988e90a (new file)
    size: number; // 205884826 (new file)
    diffType: number; // 1
    patch: {
      base_file: string; // 0CE8FA57/FA0DF58E1E98B5137A6A28DA9AD04ECF.chk (old file)
      base_md5: string; // 4d0cf13a06886c2d40d7dced64f01025 (old file)
      base_size: number; // 205875376 (old file)
      patch: string; // diff_6331530-16_5961872-11/0CE8FA57_8A8746477A4254C6069BCC7124B229A2.chk_patch
      patch_size: number; // 137279
    }[];
  }[];
}
