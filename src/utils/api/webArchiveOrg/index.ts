import cookie from 'cookie';
import ky from 'ky';
import defaultSettings from './defaultSettings.js';

export default {
  login: {
    getLoginToken: async (): Promise<string> => {
      const rsp: any = await ky.get('https://archive.org/services/account/login/', defaultSettings.ky).json();
      if (!rsp.value.token) throw new Error('Failed to get wayback machine login token');
      return rsp.value.token;
    },
    login: async (username: string, password: string, token: string, remember: boolean = true) => {
      const rsp = await ky.post('https://archive.org/services/account/login/', {
        ...defaultSettings.ky,
        json: {
          username,
          password,
          remember: String(remember),
          t: token,
        },
      });
      if (!((await rsp.json()) as any).success) throw new Error('Wayback Machine login error: ' + rsp);
      return rsp.headers.getSetCookie().map((e) => cookie.parseSetCookie(e));
    },
  },
  save: async (url: string, auth: { user: string; sig: string }): Promise<string> => {
    const params = new URLSearchParams();
    params.append('url', url);
    params.append('capture_all', 'on');
    const rsp = await ky
      .post('https://web.archive.org/save/' + url, {
        ...defaultSettings.ky,
        headers: {
          ...defaultSettings.ky.headers,
          Cookie: cookie.stringifyCookie({ 'logged-in-sig': auth.sig, 'logged-in-user': auth.user }),
        },
        body: params,
      })
      .text();
    const match = rsp.match(/spn\.watchJob\("([^"]+)"/);
    if (match && match[1]) {
      return match[1]; // spn2-xxxxxxxxxxxxxxxxxxx
    }
    throw new Error('Wayback Machine save job id not found');
  },
  saveStatus: async (
    jobId: string,
    auth: { user: string; sig: string },
  ): Promise<
    | {
        status: 'success';
        job_id: string;
        resources: [];
        download_size: number;
        total_size: number;
        timestamp: string;
        original_url: string;
        duration_sec: number;
        counters: {
          outlinks: number;
          embeds: number;
        };
        http_status: number;
        first_archive: boolean;
      }
    | {
        status: 'pending';
        job_id: string;
        resources: [];
        download_size?: number;
        total_size?: number;
      }
  > => {
    const rsp = await ky
      .get('https://web.archive.org/save/status/' + jobId, {
        ...defaultSettings.ky,
        headers: {
          ...defaultSettings.ky.headers,
          Cookie: cookie.stringifyCookie({ 'logged-in-sig': auth.sig, 'logged-in-user': auth.user }),
        },
      })
      .json();
    return rsp as any;
  },
};
