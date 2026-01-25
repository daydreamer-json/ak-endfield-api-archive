import chalk from 'chalk';
import CliTable3 from 'cli-table3';
import { HTTPError } from 'ky';
import { DateTime } from 'luxon';
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
  logger.info('Authorization in progress ...');
  if (needRetrieveToken === false) {
    try {
      logger.debug('Retrieving account service OAuth 2.0 code ...');
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
    logger.debug('Retrieving account service token ...');
    const accSrvTokenRsp = await apiUtils.apiAkEndfield.accountService.user.auth.v1.tokenByEmailPassword(
      argvUtils.getArgv()['email'],
      argvUtils.getArgv()['password'],
    );
    argvUtils.setArgv({ ...argvUtils.getArgv(), token: accSrvTokenRsp.data.token });
  }

  oauth2TokenPreRsp === null ? logger.debug('Retrieving account service OAuth 2.0 code ...') : undefined;
  const oauth2TokenRsp =
    oauth2TokenPreRsp === null
      ? await apiUtils.apiAkEndfield.accountService.user.oauth2.v2.grant(
          cfg.appCode.accountService.osWinRel,
          argvUtils.getArgv()['token'],
        )
      : oauth2TokenPreRsp;
  const oauth2TokenBindRsp = await apiUtils.apiAkEndfield.accountService.user.oauth2.v2.grant(
    cfg.appCode.accountService.binding,
    argvUtils.getArgv()['token'],
    1,
  );
  logger.debug('Retrieving u8 access token ...');
  const u8TokenRsp = await apiUtils.apiAkEndfield.u8.user.auth.v2.tokenByChToken(
    cfg.appCode.u8.osWinRel,
    cfg.channel.osWinRel,
    oauth2TokenRsp.data.code,
  );
  // logger.debug('Retrieving u8 OAuth 2.0 code ...');
  // const u8OAuth2Rsp = await apiUtils.apiAkEndfield.u8.user.auth.v2.grant(u8TokenRsp.data.token);
  logger.info('Authentication successful!');

  logger.info('Retrieving user information data ...');

  logger.debug('Retrieving user account data ...');
  const userAccData = await apiUtils.apiAkEndfield.accountService.user.info.v1.basic(
    cfg.appCode.accountService.osWinRel,
    argvUtils.getArgv()['token'],
  );
  logger.debug('Retrieving user game server data ...');
  const userGameData = await apiUtils.apiAkEndfield.u8.game.server.v1.serverList(u8TokenRsp.data.token);
  const userGameBindingData = await apiUtils.apiAkEndfield.binding.account.binding.v1.bindingList(
    oauth2TokenBindRsp.data.token,
  );

  logger.debug('Retrieving gacha record ...');
  const selectedServerId = await (async () => {
    const selectedServerAccData = userGameBindingData.data.list
      .find((f) => f.appCode === 'endfield')!
      .bindingList[0]!.roles.filter((e) => e.isBanned === false)
      .sort((a, b) => b.level - a.level)[0];
    if (!selectedServerAccData) throw new Error('Game account not found');
    const id = selectedServerAccData.serverId;
    logger.debug('Confirming server availability ...');
    const confirmServerRsp = await apiUtils.apiAkEndfield.u8.game.role.v1.confirmServer(
      u8TokenRsp.data.token,
      parseInt(id),
    );
    if (confirmServerRsp.status !== 0)
      throw new Error('Game server availability error: ' + JSON.stringify(confirmServerRsp));
    return id;
  })();
  const gachaRecordRsp = await (async () => {
    const overallRsp = await (async () => {
      const poolTypeList = [
        'E_CharacterGachaPoolType_Standard',
        'E_CharacterGachaPoolType_Beginner',
        'E_CharacterGachaPoolType_Special',
      ] as const;
      const recordArr = [];
      for (const poolTypeEntry of poolTypeList) {
        let seqId: string | null = null;
        while (true) {
          const rsp = await apiUtils.apiAkEndfield.webview.record.char(
            u8TokenRsp.data.token,
            parseInt(selectedServerId),
            poolTypeEntry,
            seqId,
          );
          recordArr.push(...rsp.data.list.map((e) => ({ poolType: poolTypeEntry, ...e })));
          logger.trace(`Loaded: ${poolTypeEntry}, ${recordArr.length} entries, hasMore=${rsp.data.hasMore}`);
          if (rsp.data.hasMore === false) break;
          if (!rsp.data.list.at(-1)) break;
          seqId = rsp.data.list.at(-1)!.seqId;
        }
      }
      return recordArr;
    })();
    return overallRsp.toReversed();
  })();
  const gachaPoolInfoList = await (async () => {
    logger.debug('Retrieving gacha pool info ...');
    const arr = [];
    const poolIdList = [...new Set(gachaRecordRsp.map((e) => e.poolId))];
    for (const poolId of poolIdList) {
      const rsp = await apiUtils.apiAkEndfield.webview.content(parseInt(selectedServerId), poolId, 'ja-jp');
      arr.push({ poolId, ...rsp.data.pool });
    }
    return arr;
  })();
  logger.info('Data retrieval completed!');

  (() => {
    const table = new CliTable3(termPrettyUtils.cliTableConfig.rounded);
    table.push(
      // [{ colSpan: 2, hAlign: 'center', content: chalk.bold('Account Info') }],
      ...[
        ['Hypergryph ID', userAccData.data.hgId],
        ['OAuth Grant ID', oauth2TokenRsp.data.uid],
        ['Game Overall UID', userGameBindingData.data.list.find((e) => e.appCode === 'endfield')!.bindingList[0]!.uid],
        ['Email', userAccData.data.realEmail],
        ['Nickname', userAccData.data.nickName === '' ? chalk.dim('(none)') : userAccData.data.nickName],
        ['Age Region', userAccData.data.ageGate.regionInfo['en-us']],
        [
          'Registered',
          DateTime.fromSeconds(
            userGameBindingData.data.list.find((e) => e.appCode === 'endfield')!.bindingList[0]!.registerTs,
          ).toFormat('yyyy/MM/dd HH:mm:ss'),
        ],
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
        ['ID', 'UID', 'Lv', 'Found', 'Default', 'Nickname', 'Registered'].map((e) => chalk.dim(e)),
        ...userGameData.data.serverList.map((e) => [
          e.serverId,
          e.roleId,
          { hAlign: 'right' as const, content: e.level },
          Boolean(
            userGameBindingData.data.list
              .find((f) => f.appCode === 'endfield')!
              .bindingList[0]!.roles.find((f) => f.serverId === e.serverId),
          ),
          e.defaultChoose,
          userGameBindingData.data.list
            .find((f) => f.appCode === 'endfield')!
            .bindingList[0]!.roles.find((f) => f.serverId === e.serverId)?.nickName,
          userGameBindingData.data.list
            .find((f) => f.appCode === 'endfield')!
            .bindingList[0]!.roles.find((f) => f.serverId === e.serverId)?.registerTs
            ? DateTime.fromSeconds(
                userGameBindingData.data.list
                  .find((f) => f.appCode === 'endfield')!
                  .bindingList[0]!.roles.find((f) => f.serverId === e.serverId)?.registerTs!,
              ).toFormat('yyyy/MM/dd HH:mm:ss')
            : '',
        ]),
      ],
    );
    console.log(table.toString());
  })();

  (() => {
    const table = new CliTable3(termPrettyUtils.cliTableConfig.rounded);
    table.push(
      ...[
        ['Pool ID', 'Pool Name', 'Pulls', '*6', '*5', '*4', 'Pity *6', '*5', 'Latest'].map((e) => chalk.dim(e)),
        ...gachaPoolInfoList.map((e) => [
          e.poolId,
          e.pool_name,
          ...[
            gachaRecordRsp.filter((f) => f.poolId === e.poolId).length,
            gachaRecordRsp.filter((f) => f.poolId === e.poolId && f.rarity === 6).length,
            gachaRecordRsp.filter((f) => f.poolId === e.poolId && f.rarity === 5).length,
            gachaRecordRsp.filter((f) => f.poolId === e.poolId && f.rarity === 4).length,
            (() => {
              let counter = 0;
              for (const pullEntry of gachaRecordRsp.filter((f) => f.poolId === e.poolId).toReversed()) {
                if (pullEntry.rarity >= 6) break;
                counter++;
              }
              return String(counter);
            })(),
            (() => {
              let counter = 0;
              for (const pullEntry of gachaRecordRsp.filter((f) => f.poolId === e.poolId).toReversed()) {
                if (pullEntry.rarity >= 5) break;
                counter++;
              }
              return String(counter);
            })(),
          ].map((f) => ({ hAlign: 'right' as const, content: f })),
          (() => {
            const latestRecord = gachaRecordRsp.filter((f) => f.poolId === e.poolId).at(-1)!;
            const color = latestRecord.rarity === 6 ? chalk.yellow : chalk.magenta;
            return color(`*${latestRecord.rarity} ${latestRecord.charName}`);
          })(),
        ]),
      ],
    );
    console.log(table.toString());
  })();

  (() => {
    const tableData: (string | number)[][] = [];
    tableData.push(['Pool ID', 'Pool Name', 'Pulled', 'Pity', 'Character'].map((e) => chalk.dim(e)));
    for (const [gachaPoolInfoIndex, gachaPoolInfoEntry] of Object.entries(gachaPoolInfoList)) {
      const records = gachaRecordRsp.filter((e) => e.poolId === gachaPoolInfoEntry.poolId);
      const tableSubData: typeof tableData = [];
      let pityR6: number = 0;
      let pityR5: number = 0;
      for (const record of records) {
        pityR6++;
        pityR5++;
        if (record.rarity >= 5) {
          tableSubData.push([
            gachaPoolInfoEntry.poolId,
            gachaPoolInfoEntry.pool_name,
            DateTime.fromMillis(parseInt(record.gachaTs)).toFormat('yyyy/MM/dd hh:mm:ss'),
            record.rarity === 6 ? pityR6 : pityR5,
            record.rarity === 6
              ? chalk.yellow(`*${record.rarity} ${record.charName}`)
              : chalk.magenta(`*${record.rarity} ${record.charName}`),
          ]);
          if (record.rarity === 6) pityR6 = 0;
          pityR5 = 0;
        }
      }
      tableData.push(...tableSubData.toReversed());
      if (parseInt(gachaPoolInfoIndex) < gachaPoolInfoList.length - 1) tableData.push(Array(4).fill(''));
    }
    const table = new CliTable3(termPrettyUtils.cliTableConfig.rounded);
    table.push(...tableData);
    console.log(table.toString());
  })();
}

export default mainCmdHandler;
