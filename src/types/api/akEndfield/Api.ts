type LauncherLatestGame = {
  action: number;
  version: string; // x.y.z
  request_version: string; // x.y.z or blank
  pkg: {
    packs: {
      url: string;
      md5: string;
      package_size: string;
    }[];
    total_size: string;
    file_path: string;
    url: string;
    md5: string;
    package_size: string;
    file_id: string;
    sub_channel: string;
    game_files_md5: string;
  };
  patch: unknown;
  state: number;
  launcher_action: number;
};

type LauncherLatestGameResources = {
  resources: {
    name: string;
    version: string;
    path: string;
  }[];
  configs: string; // json str
  res_version: string;
  patch_index_path: string;
  domain: string;
};

type LauncherLatestLauncher = {
  action: number;
  version: string; // x.y.z
  request_version: string; // x.y.z or blank
  zip_package_url: string;
  md5: string;
  package_size: string;
  total_size: string;
  description: string;
};

type LauncherWebSidebar = {
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
};

type LauncherWebSingleEnt = {
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
};

type LauncherWebMainBgImage = {
  data_version: string;
  main_bg_image: {
    url: string;
    md5: string;
    video_url: string;
  };
};

type LauncherWebBanner = {
  data_version: string;
  banners: {
    url: string;
    md5: string;
    jump_url: string;
    id: string;
    need_token: boolean;
  }[];
};

type LauncherWebAnnouncement = {
  data_version: string;
  tabs: {
    tabName: string;
    announcements: {
      content: string;
      jump_url: string;
      start_ts: string; // example: 1768969800000
      id: string;
      need_token: boolean;
    }[];
    tab_id: string;
  }[];
};

export type {
  LauncherLatestGame,
  LauncherLatestGameResources,
  LauncherLatestLauncher,
  LauncherWebSidebar,
  LauncherWebSingleEnt,
  LauncherWebMainBgImage,
  LauncherWebBanner,
  LauncherWebAnnouncement,
};
