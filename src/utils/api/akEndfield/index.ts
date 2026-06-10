import kyFactory from 'ky';
import AccountService from './accountService.js';
import Binding from './binding.js';
import defaultSettings from './defaultSettings.js';
import GameHub from './gameHub.js';
import Launcher from './launcher.js';
import LauncherWeb from './launcherWeb.js';
import U8 from './u8.js';
import Webview from './webview.js';
import Zonai from './zonai.js';

export interface ClientOptions {
  ky?: typeof kyFactory;
}

export class Client {
  public readonly defaultSettings = defaultSettings;
  public readonly accountService: AccountService;
  public readonly binding: Binding;
  public readonly gameHub: GameHub;
  public readonly launcher: Launcher;
  public readonly launcherWeb: LauncherWeb;
  public readonly u8: U8;
  public readonly webview: Webview;
  public readonly zonai: Zonai;

  constructor(options?: ClientOptions) {
    const baseKy = options?.ky || kyFactory.create(defaultSettings.ky);

    this.accountService = new AccountService(baseKy);
    this.binding = new Binding(baseKy);
    this.gameHub = new GameHub(baseKy);
    this.launcherWeb = new LauncherWeb(baseKy);
    this.launcher = new Launcher(baseKy, this.launcherWeb);
    this.u8 = new U8(baseKy);
    this.webview = new Webview(baseKy);
    this.zonai = new Zonai(baseKy);
  }
}

const defaultClient = new Client();
export default defaultClient;
