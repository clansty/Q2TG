import Telegram from './client/Telegram';
import { config } from './providers/userConfig';
import { configure, getLogger } from 'log4js';
import SetupController from './controllers/SetupController';
import OicqClient from './client/OicqClient';
import ConfigController from './controllers/ConfigController';
import ForwardController from './controllers/ForwardController';

(async () => {
  configure({
    appenders: {
      console: { type: 'console' },
    },
    categories: {
      default: { level: 'trace', appenders: ['console'] },
    },
  });
  const log = getLogger('Main');
  process.on('unhandledRejection', error => {
    log.error('UnhandledException: ', error);
  });

  log.debug('正在登录 TG Bot');
  const tgBot = await Telegram.create({
    botAuthToken: process.env.TG_BOT_TOKEN,
  }, 'bot');

  let tgUser: Telegram, oicq: OicqClient;
  log.debug('TG Bot 登录完成');
  if (!config.isSetup) {
    log.info('当前服务器未配置，请向 Bot 发送 /setup 来设置');
    const setupController = new SetupController(tgBot);
    ({ tgUser, oicq } = await setupController.waitForFinish());
  }
  else {
    log.debug('正在登录 TG UserBot');
    tgUser = await Telegram.connect('user');
    log.debug('TG UserBot 登录完成');
    log.debug('正在登录 OICQ');
    oicq = await OicqClient.create({
      uin: config.qqUin,
      password: config.qqPassword,
      platform: config.qqPlatform,
      onVerifyDevice: () => null,
      onVerifySlider: () => null,
      onQrCode: () => null,
    });
    log.debug('OICQ 登录完成');
  }
  new ConfigController(tgBot, tgUser, oicq);
  new ForwardController(tgBot, tgUser, oicq);
})();
