import chalk from 'chalk';
import CliTable3 from 'cli-table3';
import { HTTPError } from 'ky';
import prompts from 'prompts';
import apiUtils from '../utils/api.js';
import argvUtils from '../utils/argv.js';
import appConfig from '../utils/config.js';
import exitUtils from '../utils/exit.js';
import logger from '../utils/logger.js';
import termPrettyUtils from '../utils/termPretty.js';

async function mainCmdHandler() {
  const cfg = appConfig.network.api.akEndfield;
  // const channelStr = String(cfg.channel.osWinRel);

  let needRetrieveToken = false;
  let oauth2TokenPreRsp = null;
  if (!('token' in argvUtils.getArgv()) || !argvUtils.getArgv()['token']) {
    const tokenUserRsp: string = await (async () => {
      logger.warn('Gryphline account service token has not been specified. Requesting ...');
      const onCancelFn = () => {
        logger.error('Aborted');
        exitUtils.exit(1, null, false);
      };
      return (
        await prompts(
          { name: 'value', type: 'password', message: 'Enter Gryphline account service token' },
          { onCancel: onCancelFn },
        )
      ).value;
    })();
    if (tokenUserRsp === '') {
      needRetrieveToken = true;
    } else {
      argvUtils.setArgv({ ...argvUtils.getArgv(), token: tokenUserRsp });
    }
  }
  if (needRetrieveToken === false) {
    try {
      oauth2TokenPreRsp = await apiUtils.apiAkEndfield.accountService.user.oauth2.v2.grant(
        cfg.appCode.accountService.osWinRel,
        argvUtils.getArgv()['token'],
      );
    } catch (err) {
      if (err instanceof HTTPError) {
        if ((await err.response.json()).status === 3) needRetrieveToken = true;
      } else {
        throw err;
      }
    }
  }
  if (needRetrieveToken) {
    await (async () => {
      const onCancelFn = () => {
        logger.error('Aborted');
        exitUtils.exit(1, null, false);
      };
      if (!('email' in argvUtils.getArgv())) {
        logger.warn('Gryphline account email has not been specified. Requesting ...');
        const emailRsp: number = (
          await prompts(
            {
              ...{ name: 'value', type: 'text', message: 'Enter Gryphline account email' },
              validate: (value) => (Boolean(value) ? true : 'Invalid value'),
            },
            { onCancel: onCancelFn },
          )
        ).value;
        argvUtils.setArgv({ ...argvUtils.getArgv(), email: emailRsp });
      }
      if (!('password' in argvUtils.getArgv())) {
        // logger.warn('Gryphline account password has not been specified. Requesting ...');
        const pwdRsp: number = (
          await prompts(
            {
              ...{ name: 'value', type: 'password', message: 'Enter Gryphline account password' },
              validate: (value) => (Boolean(value) ? true : 'Invalid value'),
            },
            { onCancel: onCancelFn },
          )
        ).value;
        argvUtils.setArgv({ ...argvUtils.getArgv(), password: pwdRsp });
      }
    })();
    logger.info('Retrieving account service token ...');
    const accSrvTokenRsp = await apiUtils.apiAkEndfield.accountService.user.auth.v1.tokenByEmailPassword(
      argvUtils.getArgv()['email'],
      argvUtils.getArgv()['password'],
    );
    argvUtils.setArgv({ ...argvUtils.getArgv(), token: accSrvTokenRsp.data.token });
  }

  logger.info('Retrieving account service OAuth 2.0 token ...');
  const oauth2TokenRsp = await apiUtils.apiAkEndfield.accountService.user.oauth2.v2.grant(
    cfg.appCode.accountService.osWinRel,
    argvUtils.getArgv()['token'],
  );
  logger.info('Retrieving u8 access token ...');
  const u8TokenRsp = await apiUtils.apiAkEndfield.u8.user.auth.v2.tokenByChToken(
    cfg.appCode.u8.osWinRel,
    cfg.channel.osWinRel,
    oauth2TokenRsp.data.code,
  );
  logger.info('Authentication successful!');

  logger.info('Retrieving user account data ...');
  const userAccData = await apiUtils.apiAkEndfield.accountService.user.info.v1.basic(
    cfg.appCode.accountService.osWinRel,
    argvUtils.getArgv()['token'],
  );
  logger.info('Retrieving user game server data ...');
  const userGameData = await apiUtils.apiAkEndfield.u8.game.server.v1.serverList(u8TokenRsp.data.token);

  logger.info('Data retrieval completed!');

  (() => {
    const table = new CliTable3(termPrettyUtils.cliTableConfig.rounded);
    table.push(
      ...[
        ['Account ID', userAccData.data.hgId],
        ['Email', userAccData.data.realEmail],
        ['Nickname', userAccData.data.nickName === '' ? chalk.dim('(none)') : userAccData.data.nickName],
        ['Age Region', userAccData.data.ageGate.regionInfo['en-us']],
      ].map((e) => [chalk.dim(e[0]), e[1]]),
    );
    console.log(table.toString());
  })();

  (() => {
    const table = new CliTable3(termPrettyUtils.cliTableConfig.rounded);
    table.push(
      ...[
        ['ID', 'Time', 'Name', 'Domain', 'Port'].map((e) => chalk.dim(e)),
        ...userGameData.data.serverList.map((e) => [
          e.serverId,
          'UTC' + (JSON.parse(e.extension).offsetSeconds < 0 ? '' : '+') + JSON.parse(e.extension).offsetSeconds / 3600,
          e.serverName,
          JSON.parse(e.serverDomain)[0].host,
          JSON.parse(e.serverDomain)[0].port,
        ]),
      ],
    );
    console.log(table.toString());
  })();

  (() => {
    const table = new CliTable3(termPrettyUtils.cliTableConfig.rounded);
    table.push(
      ...[
        ['ID', 'UID', 'Level', 'Default'].map((e) => chalk.dim(e)),
        ...userGameData.data.serverList.map((e) => [
          e.serverId,
          e.roleId,
          { hAlign: 'right' as const, content: e.level },
          e.defaultChoose,
        ]),
      ],
    );
    console.log(table.toString());
  })();
}

export default mainCmdHandler;
