export interface MirrorFileEntry {
  orig: string;
  mirror: string;
  origStatus: boolean;
}

export interface StoredData<T> {
  req: any;
  rsp: T;
  updatedAt: string;
}
