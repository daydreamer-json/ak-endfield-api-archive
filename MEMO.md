# MEMO

This file contains my personal notes. Most of it isn't particularly useful, but it might come in handy for someone.

## Regarding the Game Package Patch Update v2 Format

Although removed from the archived data, keys indicating the implementation of the v2 format appeared in the JSON data even before the `v1.2.4` update.  
The keys were first observed on the China channel at `2026-04-09T08:15:27.604+00:00` and on the Global channel at `2026-04-11T04:15:27.695+00:00`.

Initially, the `patch` object contained empty data: `{ "v2_patch_info_url": "", "v2_patch_info_size": "0", "v2_patch_info_md5": "" }`.  
Upon the release of the `v1.2.4` update, the official URL, size, and MD5 values began to be returned.

### `patch.json` Specifications

**Note:** These are based partly on conjecture.

```typescript
export interface Root {
  version: string; // e.g., 1.2.4
  vfs_base_path: string; // e.g., Endfield_Data/StreamingAssets/VFS
  files: File[];
}

export interface File {
  name: string; // e.g., C3442D43/223F9ED9DB4013D27E6FB3B78623E051.chk
  name_path: string; // ""
  md5: string; // e.g., 1ceb1c5aaf4dace09f3ec359c78f0501
  size: number; // e.g., 4516428
  diffType: 1 | 2; // 1=chk?, 2=blk?
  local_path?: string; // e.g., vfs_files/files/Endfield_Data/StreamingAssets/VFS/775A31D1/449D95744A00F33BD9C304EF1E72A534.chk
  patch?: Patch[];
}

export interface Patch {
  base_file: string; // e.g., C3442D43/47D0EB2D178F6E81EE4D0226E0806AB9.chk
  base_file_path: string; // ""
  base_md5: string; // e.g., dac0d4c6a910fb4e1000d9414cd1ee4b
  base_size: number; // e.g., 4518476
  patch: string; // e.g., diff_1.2.4_1.1.9/C3442D43_223F9ED9DB4013D27E6FB3B78623E051.chk_patch
  patch_path: string; // ""
  patch_size: number; // e.g., 136568
}
```

- **If `local_path` does not exist and `patch` does not exist:** No action is taken.
- **If `local_path` exists and `patch` does not exist (Incremental):** A new file exists. Copy the file located at `local_path` within the patch data to `${vfs_base_path}/${files[number].name}`.
- **If `local_path` does not exist and `patch` exists (Differential):** A difference exists. Using `${vfs_base_path}/${files[number].base_file}` as the source file, apply the patch found at `vfs_files/vfs_patch/${files[number].patch[number].patch}` in the patch data and write the result to `${vfs_base_path}/${files[number].name}`. [HDiffPatch](https://github.com/sisong/HDiffPatch) is used for applying the differential.
- **If both `local_path` and `patch` exist:** This scenario is currently not possible.
