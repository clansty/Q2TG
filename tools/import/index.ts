import prompts from 'prompts';
import db from '../../src/models/db';
import Telegram from '../../src/client/Telegram';
import OicqClient from '../../src/client/OicqClient';
import 'dotenv/config';
import importer from './importer';

(async () => {
  if (!(process.env.TG_API_ID && process.env.TG_API_HASH)) {
    const { apiId, apiHash } = await prompts([
      { type: 'text', name: 'apiId', message: 'Telegram API ID?' },
      { type: 'text', name: 'apiHash', message: 'Telegram API Hash?' },
    ]);
    process.env.TG_API_ID = apiId;
    process.env.TG_API_HASH = apiHash;
  }

  let sessionName = process.env.SESSION;
  !sessionName && ({ sessionName } = await prompts({
    type: 'text', name: 'sessionName', message: '输入数据库中的 Session 名称',
  }));
  let telegram: Telegram;
  if (await db.session.findFirst({ where: { name: sessionName } })) {
    // Session 存在
    telegram = await Telegram.connect(sessionName, 'Chat Importer');
  }
  else {
    const { phoneNumber } = await prompts({
      type: 'text', name: 'phoneNumber', message: '请输入手机号码',
    });
    telegram = await Telegram.create({
      phoneNumber,
      password: async (hint?: string) => {
        const { password } = await prompts({
          type: 'password', name: 'password',
          message: `请输入你的二步验证密码${hint ? ' 密码提示：' + hint : ''}`,
        });
        return password;
      },
      phoneCode: async (isCodeViaApp?: boolean) => {
        const { code } = await prompts({
          type: 'text', name: 'code',
          message: `请输入你${isCodeViaApp ? ' Telegram APP 中' : '手机上'}收到的验证码`,
        });
        return code;
      },
      onError: (err) => console.error(err),
    }, sessionName, 'Chat Importer');
  }

  let isLoginOicq = !!(process.env.Q_UIN && process.env.Q_PASSWORD && process.env.Q_PLATFORM);
  !isLoginOicq && ({ isLoginOicq } = await prompts({
    type: 'confirm', name: 'isLoginOicq', message: '要登录 OICQ 嘛，这样可以获取转发的消息记录',
  }));

  let oicq: OicqClient,
    crvApi = process.env.CRV_API, crvKey = process.env.CRV_KEY;
  if (isLoginOicq) {
    let uin = Number(process.env.Q_UIN);
    let password = process.env.Q_PASSWORD;
    let platform = Number(process.env.Q_PLATFORM);
    !(uin && password && platform) && ({ uin, password, platform } = await prompts([
      { type: 'number', name: 'uin', message: '请输入账号，可以是任意账号，和导入内容无关' },
      { type: 'password', name: 'password', message: '请输入密码' },
      {
        type: 'select', name: 'platform', message: '选择登录协议',
        choices: [
          { title: '安卓手机', value: '1' },
          { title: '安卓手表', value: '3' },
          { title: 'macOS', value: '4' },
          { title: 'iPad', value: '5' },
        ],
      },
    ]));
    oicq = await OicqClient.create({
      uin,
      password,
      platform,
      onVerifyDevice: async (phone) => {
        const { code } = await prompts({
          type: 'text', name: 'code',
          message: `请输入你的手机 ${phone} 收到的验证码`,
        });
        return code;
      },
      onVerifySlider: () => {
        console.log('出滑块了，暂不支持');
        process.exit(1);
      },
      onQrCode: () => process.exit(1),
    });
    !(crvApi && crvKey) && ({ crvApi, crvKey } = await prompts([
      { type: 'text', name: 'crvApi', message: 'Chat record viewer API 地址' },
      { type: 'text', name: 'crvKey', message: 'Chat record viewer API Key' },
    ]));
  }

  if (process.argv[2]) {
    await importer.doImport(process.argv[2], telegram, oicq, crvApi, crvKey);
  }
  else {
    while (true) {
      const { filePath } = await prompts({
        type: 'text', name: 'filePath', message: '请选择一个导出的 JSON 文件',
      });
      await importer.doImport(filePath.trim(), telegram, oicq, crvApi, crvKey);
      const { isContinue } = await prompts({
        type: 'confirm', name: 'isContinue', message: '要继续导入嘛',
      });
      if (!isContinue) break;
    }
  }
  await oicq.logout(false);
})();
