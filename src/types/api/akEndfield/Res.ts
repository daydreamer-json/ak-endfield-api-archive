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

export interface PackagePatchInfo {
  version: string; // e.g., 1.2.4
  vfs_base_path: string; // e.g., Endfield_Data/StreamingAssets/VFS
  files: {
    name: string; // e.g., C3442D43/223F9ED9DB4013D27E6FB3B78623E051.chk
    name_path: string; // ""
    md5: string; // e.g., 1ceb1c5aaf4dace09f3ec359c78f0501
    size: number; // e.g., 4516428
    diffType: 1 | 2; // 1=chk?, 2=blk?
    local_path?: string; // e.g., vfs_files/files/Endfield_Data/StreamingAssets/VFS/775A31D1/449D95744A00F33BD9C304EF1E72A534.chk
    patch?: {
      base_file: string; // e.g., C3442D43/47D0EB2D178F6E81EE4D0226E0806AB9.chk
      base_file_path: string; // ""
      base_md5: string; // e.g., dac0d4c6a910fb4e1000d9414cd1ee4b
      base_size: number; // e.g., 4518476
      patch: string; // e.g., diff_1.2.4_1.1.9/C3442D43_223F9ED9DB4013D27E6FB3B78623E051.chk_patch
      patch_path: string; // ""
      patch_size: number; // e.g., 136568
    }[];
  }[];
}
