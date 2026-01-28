import accountService from './api/accountService.js';
import binding from './api/binding.js';
import launcher from './api/launcher.js';
import u8 from './api/u8.js';
import webview from './api/webview.js';

export default {
  apiAkEndfield: { launcher, accountService, u8, binding, webview },
};
