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

export interface LauncherWebAnnouncement {
  data_version: string;
  tabs: {
    tabName: string;
    announcements: {
      content: string;
      jump_url: string;
      start_ts: string;
      id: string;
      need_token: boolean;
    }[];
    tab_id: string;
  }[];
}

export interface LauncherWebBanner {
  data_version: string;
  banners: {
    url: string;
    md5: string;
    jump_url: string;
    id: string;
    need_token: boolean;
  }[];
}

export interface LauncherWebMainBgImage {
  data_version: string;
  main_bg_image: {
    url: string;
    md5: string;
    video_url: string;
  };
}

export interface LauncherWebSingleEnt {
  single_ent: {
    version_url: string;
    version_md5: string;
    jump_url: string;
    button_url: string;
    button_md5: string;
    button_hover_url: string;
    button_hover_md5: string;
    need_token: boolean;
  };
}

export interface LauncherWebSidebar {
  data_version: string;
  sidebars: {
    display_type: 'DisplayType_RESERVE';
    media: string;
    pic: { url: string; md5: string; description: string } | null;
    sidebar_labels: { content: string; jump_url: string; need_token: boolean }[];
    grid_info: null;
    jump_url: string;
    need_token: boolean;
  }[];
}
