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

type AccSrvUserAuthV1TokenByEmail = {
  data: {
    token: string;
    hgId: string; // hypergryph account id
    email: string; // obfuscated email
    isLatestUserAgreement: boolean;
  };
  msg: string;
  status: number;
  type: string;
};

type AccSrvUserInfoV1Basic = {
  data: {
    hgId: string; // hypergryph account id
    email: string; // obfuscated email
    realEmail: string; // un-obfuscated email
    isLatestUserAgreement: boolean;
    nickName: string;
    emailSubscription: boolean; // ???
    extension: { firebaseHashedInfo: string };
    ageGate: {
      ageAuthState: number;
      bindEmail: boolean;
      parentAuthState: number;
      regionInfo: Record<
        | 'de-de'
        | 'en-us' // Japan
        | 'es-mx'
        | 'fr-fr'
        | 'id-id'
        | 'it-it'
        | 'ja-jp' // 日本
        | 'ko-kr'
        | 'pt-br'
        | 'ru-ru'
        | 'th-th'
        | 'vi-vn'
        | 'zh-cn' // 日本
        | 'zh-tw',
        string
      >;
      regionCode: string; // JP
    };
  };
  msg: string;
  status: number;
  type: string;
};

type AccSrvUserOAuth2V2Grant = {
  data: {
    uid: string; // ???
    code: string; // this is channel token
  };
  msg: string; // OK, Login status expired.
  status: number; // 0=OK, 3=expired
  type: string;
};

type U8UserAuthV2ChToken = {
  data: {
    token: string;
    isNew: boolean;
    uid: string; // number, game overall uid?
  };
  msg: string;
  status: number;
  type: string;
};

type U8GameServerV1ServerList = {
  data: {
    serverList: {
      serverId: string; // number
      serverName: string; // Asia
      serverDomain: string; // jsonStr [{"host": "beyond-asiapacific.gryphline.com", "port": 30000}]
      defaultChoose: boolean;
      roleId: string; // the so-called UID elsewhere
      level: number; // playerLv
      extension: string; // jsonStr {"offsetSeconds": -18000, "monthlyCardOffsetSecond": -18000}
    }[];
  };
  msg: string;
  status: number;
  type: string;
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
  AccSrvUserAuthV1TokenByEmail,
  AccSrvUserInfoV1Basic,
  AccSrvUserOAuth2V2Grant,
  U8UserAuthV2ChToken,
  U8GameServerV1ServerList,
};
