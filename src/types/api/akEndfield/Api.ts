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
  patch: {
    url: string;
    md5: string;
    package_size: string;
    total_size: string;
    file_id: string;
    patches: {
      url: string;
      md5: string;
      package_size: string;
    }[];
  } | null;
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

type LauncherLatestLauncherExe = {
  action: number;
  version: string; // x.y.z
  request_version: string; // x.y.z or blank
  exe_url: string;
  exe_size: string;
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

type AccSrvUserInfoV1ThirdParty = {
  data: {
    thirdPartyInfo: {
      name: string;
      channelId: number; // 2=google, 3=facebook, 4=apple, 5=twitter
    }[];
  };
  msg: string;
  status: number;
  type: string;
};

type AccSrvUserOAuth2V2Grant = {
  data: {
    uid: string; // grant uid (Gxxxxxxxxxx)
    code: string; // this is channel token
  };
  msg: string; // OK | Login status expired.
  status: number; // 0=OK, 3=expired
  type: string;
};

type AccSrvUserOAuth2V2GrantType1 = {
  data: {
    hgId: string; // hypergryph account id
    token: string;
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

type U8UserAuthV2Grant = {
  data: {
    uid: string; // game overall uid
    code: string;
    token: string;
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

type U8GameRoleV1ConfirmServer = {
  msg: string;
  status: number;
  type: string;
};

type BindApiAccBindV1BindList = {
  data: {
    list: {
      appCode: string; // endfield
      appName: string; // 明日方舟终末地
      supportMultiServer: boolean;
      bindingList: {
        uid: string; // game overall uid
        isOfficial: boolean; // maybe always true
        isDefault: boolean;
        channelMasterId: number; // 6
        channelName: string; // 官服
        isDeleted: boolean;
        isBanned: boolean;
        registerTs: number; // unix
        roles: {
          isBanned: boolean;
          serverId: string; // 2
          serverName: string; // Asia
          roleId: string; // game server uid
          nickName: string;
          level: number;
          isDefault: boolean;
          registerTs: number; // unix
        }[];
      }[];
    }[];
  };
  msg: string;
  status: number;
};

type BindApiAccBindV1U8TokenByUid = {
  data: {
    token: string; // u8 token
  };
  msg: string;
  status: number;
};

type BindApiGeneralV1AuthAppList = {
  data: {
    appList: {
      appCode: 'endfield' | 'arknights';
      appName: string;
      channel: {
        channelMasterId: number;
        channelName: string;
        isOfficial: boolean;
      }[];
      supportServer: boolean; // is support multi server loc
      serverList: {
        serverId: string; // 2 or 3 or something
        serverName: string; // Asia
      }[];
    }[];
  };
  msg: string;
  status: number;
};

type WebViewRecordChar = {
  code: number; // 0 = ok
  data: {
    list: {
      poolId: string; // beginner, standard, special_1_0_1, ...
      poolName: string; // localized pool name
      charId: string; // chr_0016_laevat or something
      charName: string; // localized chara name
      rarity: number; // 6-4
      isFree: boolean;
      isNew: boolean;
      gachaTs: string; // unix
      seqId: string;
    }[];
    hasMore: boolean;
  };
  msg: string;
};

type WebViewRecordContent = {
  code: number; // 0 = ok
  data: {
    pool: {
      pool_gacha_type: string; // char
      pool_name: string; // localized pool name
      pool_type: string; // newbie or special or normal
      up6_name: string; // localized up6 chara name, may blank
      up6_image: string;
      up5_name: string;
      up5_image: string;
      up6_item_name: string; // localized up6 item name (Laevatain's Token or something)
      rotate_image: string;
      ticket_name: string; // Firewalker's Trail HH Permit or something
      ticket_ten_name: string; // Firewalker's Trail 10×Permit or something
      all: {
        id: string; // chr_0016_laevat or something
        name: string; // localized chara name
        rarity: number; // 6-4
      }[];
      rotate_list: unknown[]; // ???
    };
    timezone: number; // asia is 8 (hour)
  };
  msg: string;
};

type ZonaiWebV1UserAuthGenCredByCode = {
  code: number; // 0 = ok
  message: string; // OK
  timestamp: string; // unixtime
  data: {
    cred: string; // base64?
    userId: string;
    token: string; // hex;
  };
};

type ZonaiWebV1UserCheck = {
  code: number; // 0 = ok
  message: string; // OK
  timestamp: string; // unixtime
  data: {
    cred: string;
    userId: string;
    token: string;
  };
};

type ZonaiWebV1WikiMe = {
  code: number; // 0 = ok
  message: string; // OK
  timestamp: string; // unixtime
  data: {
    user: {
      userId: string;
      nickname: string;
      avatarCode: number;
      avatar: string;
    };
    resources: any[];
  };
};

type ZonaiWebV2User = {
  code: number;
  message: string;
  timestamp: string;
  data: {
    user: {
      basicUser: {
        id: string;
        nickname: string;
        profile: string;
        avatarCode: number;
        avatar: string;
        gender: number;
        status: number;
        operationStatus: number;
        identity: number;
        kind: number;
        moderatorStatus: number;
        moderatorChangeTime: number;
        createdAt: string;
        latestLoginAt: string;
      };
      pendant: {
        id: number;
        iconUrl: string;
        title: string;
        description: string;
      };
      background: any;
    };
    userRts: {
      follow: string;
      fans: string;
      liked: string;
    };
    userSanctionList: any[];
    userInfoApply: {};
    moderator: {
      isModerator: boolean;
      operations: any[];
      role: string;
      since: string;
      status: number;
      gameOperations: {};
    };
  };
};

type ZonaiApiV1GamePlayerBinding = {
  code: number;
  message: string;
  timestamp: string;
  data: {
    list: {
      appCode: string;
      appName: string;
      bindingList: {
        uid: string;
        isOfficial: boolean;
        isDefault: boolean;
        channelMasterId: string;
        channelName: string;
        nickName: string;
        isDelete: boolean;
        gameName: string;
        gameId: number;
        roles: {
          serverId: string;
          roleId: string;
          nickname: string;
          level: number;
          isDefault: boolean;
          isBanned: boolean;
          serverType: string;
          serverName: string;
        }[];
        defaultRole: {
          serverId: string;
          roleId: string;
          nickname: string;
          level: number;
          isDefault: boolean;
          isBanned: boolean;
          serverType: string;
          serverName: string;
        };
      }[];
    }[];
    serverDefaultBinding: {};
  };
};

type ZonaiWebV1GameEndfieldAttendance = {
  code: number;
  message: string;
  timestamp: string;
  data: {
    currentTs: string;
    calendar: {
      awardId: string; // endfield_attendance_1_2
      available: boolean;
      done: boolean;
    }[];
    first: {
      awardId: string; // endfield_attendance_1_2
      available: boolean;
      done: boolean;
    }[];
    resourceInfoMap: Record<
      string,
      {
        id: string; // endfield_attendance_1_2
        count: number;
        name: string;
        icon: string;
      }
    >;
    hasToday: boolean;
  };
};

type ZonaiWebV1GameEndfieldAttendanceRecord = {
  code: number;
  message: string;
  timestamp: string;
  data: {
    records: {
      ts: string;
      awardId: string; // endfield_attendance_1_2
    }[];
    resourceInfoMap: Record<
      string,
      {
        id: string; // endfield_attendance_1_2
        count: number;
        name: string;
        icon: string;
      }
    >;
  };
};

type GameHubGiftCodeRedeem = {
  code: number; // 0=OK, 11004=ActivityExpired
  data: {
    redeemResult?: {
      recordId: string;
    };
  };
  msg: string; // ''=OK
};

export type {
  LauncherLatestGame,
  LauncherLatestGameResources,
  LauncherLatestLauncher,
  LauncherLatestLauncherExe,
  LauncherWebSidebar,
  LauncherWebSingleEnt,
  LauncherWebMainBgImage,
  LauncherWebBanner,
  LauncherWebAnnouncement,
  AccSrvUserAuthV1TokenByEmail,
  AccSrvUserInfoV1Basic,
  AccSrvUserInfoV1ThirdParty,
  AccSrvUserOAuth2V2Grant,
  AccSrvUserOAuth2V2GrantType1,
  U8UserAuthV2ChToken,
  U8UserAuthV2Grant,
  U8GameServerV1ServerList,
  U8GameRoleV1ConfirmServer,
  BindApiAccBindV1BindList,
  BindApiAccBindV1U8TokenByUid,
  BindApiGeneralV1AuthAppList,
  WebViewRecordChar,
  WebViewRecordContent,
  ZonaiWebV1UserAuthGenCredByCode,
  ZonaiWebV1UserCheck,
  ZonaiWebV1WikiMe,
  ZonaiWebV2User,
  ZonaiApiV1GamePlayerBinding,
  ZonaiWebV1GameEndfieldAttendance,
  ZonaiWebV1GameEndfieldAttendanceRecord,
  GameHubGiftCodeRedeem,
};
