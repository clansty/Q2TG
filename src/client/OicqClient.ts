import {
  Client,
  DiscussMessageEvent, Forwardable,
  Friend,
  Group,
  GroupMessageEvent,
  LogLevel,
  Platform, PrivateMessage,
  PrivateMessageEvent, XmlElem,
} from 'icqq';
import Buffer from 'buffer';
import { execSync } from 'child_process';
import random from '../utils/random';
import fs from 'fs';
import fsP from 'fs/promises';
import { Config } from 'icqq/lib/client';
import dataPath from '../helpers/dataPath';
import os from 'os';
import { Converter, Image, rand2uuid } from 'icqq/lib/message';
import { randomBytes } from 'crypto';
import { escapeXml, gzip, timestamp } from 'icqq/lib/common';
import { pb } from 'icqq/lib/core';

const LOG_LEVEL: LogLevel = process.env.LOG_LEVEL as LogLevel || 'warn';

type MessageHandler = (event: PrivateMessageEvent | GroupMessageEvent) => Promise<boolean | void>

interface CreateOicqParams {
  id: number;
  uin: number;
  password: string;
  platform: Platform;
  signApi?: string;
  signVer?: string;
  // 当需要验证手机时调用此方法，应该返回收到的手机验证码
  onVerifyDevice: (phone: string) => Promise<string>;
  // 当滑块时调用此方法，返回 ticker，也可以返回假值改用扫码登录
  onVerifySlider: (url: string) => Promise<string>;
  signDockerId?: string;
}

// OicqExtended??
export default class OicqClient extends Client {
  private readonly onMessageHandlers: Array<MessageHandler> = [];

  private constructor(uin: number, public readonly id: number, conf?: Config,
                      public readonly signDockerId?: string) {
    super(conf);
  }

  private static existedBots = {} as { [id: number]: OicqClient };

  private isOnMessageCreated = false;

  public static create(params: CreateOicqParams) {
    if (this.existedBots[params.id]) {
      return Promise.resolve(this.existedBots[params.id]);
    }
    return new Promise<OicqClient>(async (resolve, reject) => {
      const loginDeviceHandler = async ({ phone }: { url: string, phone: string }) => {
        client.sendSmsCode();
        const code = await params.onVerifyDevice(phone);
        if (code === 'qrsubmit') {
          client.login();
        }
        else {
          client.submitSmsCode(code);
        }
      };

      const loginSliderHandler = async ({ url }: { url: string }) => {
        const res = await params.onVerifySlider(url);
        if (res) {
          client.submitSlider(res);
        }
        else {
          client.login();
        }
      };

      const loginErrorHandler = ({ message }: { code: number; message: string }) => {
        reject(message);
      };

      const successLoginHandler = () => {
        client.offTrap('system.login.device', loginDeviceHandler);
        client.offTrap('system.login.slider', loginSliderHandler);
        client.offTrap('system.login.error', loginErrorHandler);
        client.offTrap('system.online', successLoginHandler);

        if (!client.isOnMessageCreated) {
          client.trap('message', client.onMessage);
          client.isOnMessageCreated = true;
        }

        resolve(client);
      };

      if (!fs.existsSync(dataPath(`${params.uin}/device.json`))) {
        await fsP.mkdir(dataPath(params.uin.toString()), { recursive: true });

        const device = {
          product: 'Q2TG',
          device: 'ANGELKAWAII2',
          board: 'rainbowcat',
          brand: random.pick('GOOGLE', 'XIAOMI', 'HUAWEI', 'SAMSUNG', 'SONY'),
          model: 'rainbowcat',
          wifi_ssid: random.pick('OpenWrt', `Redmi-${random.hex(4).toUpperCase()}`,
            `MiWifi-${random.hex(4).toUpperCase()}`, `TP-LINK-${random.hex(6).toUpperCase()}`),
          bootloader: random.pick('U-Boot', 'GRUB', 'gummiboot'),
          android_id: random.hex(16),
          proc_version: `${os.type()} version ${os.release()}`,
          mac_address: `8c:85:90:${random.hex(2)}:${random.hex(2)}:${random.hex(2)}`.toUpperCase(),
          ip_address: `192.168.${random.int(1, 200)}.${random.int(10, 250)}`,
          incremental: random.int(0, 4294967295),
          imei: random.imei(),
        };

        await fsP.writeFile(dataPath(`${params.uin}/device.json`), JSON.stringify(device, null, 0), 'utf-8');
      }

      const client = new this(params.uin, params.id, {
        platform: params.platform,
        data_dir: dataPath(params.uin.toString()),
        log_level: LOG_LEVEL,
        ffmpeg_path: process.env.FFMPEG_PATH,
        ffprobe_path: process.env.FFPROBE_PATH,
        sign_api_addr: params.signApi || process.env.SIGN_API,
        ver: params.signVer || process.env.SIGN_VER,
      }, params.signDockerId);
      client.on('system.login.device', loginDeviceHandler);
      client.on('system.login.slider', loginSliderHandler);
      client.on('system.login.error', loginErrorHandler);
      client.on('system.online', successLoginHandler);

      this.existedBots[params.id] = client;
      client.login(params.uin, params.password);
    });
  }

  private onMessage = async (event: PrivateMessageEvent | GroupMessageEvent | DiscussMessageEvent) => {
    if (event.message_type === 'discuss') return;
    for (const handler of this.onMessageHandlers) {
      const res = await handler(event);
      if (res) return;
    }
  };

  public addNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.push(handler);
  }

  public removeNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.includes(handler) &&
    this.onMessageHandlers.splice(this.onMessageHandlers.indexOf(handler), 1);
  }

  public getChat(roomId: number): Group | Friend {
    if (roomId > 0) {
      return this.pickFriend(roomId);
    }
    else {
      return this.pickGroup(-roomId);
    }
  }

  public async makeForwardMsgSelf(msglist: Forwardable[] | Forwardable, dm?: boolean): Promise<{
    resid: string,
    tSum: number
  }> {
    if (!Array.isArray(msglist))
      msglist = [msglist];
    const nodes = [];
    const makers: Converter[] = [];
    let imgs: Image[] = [];
    let cnt = 0;
    for (const fake of msglist) {
      const maker = new Converter(fake.message, { dm, cachedir: this.config.data_dir });
      makers.push(maker);
      const seq = randomBytes(2).readInt16BE();
      const rand = randomBytes(4).readInt32BE();
      let nickname = String(fake.nickname || fake.user_id);
      if (!nickname && fake instanceof PrivateMessage)
        nickname = this.fl.get(fake.user_id)?.nickname || this.sl.get(fake.user_id)?.nickname || nickname;
      if (cnt < 4) {
        cnt++;
      }
      nodes.push({
        1: {
          1: fake.user_id,
          2: this.uin,
          3: dm ? 166 : 82,
          4: dm ? 11 : null,
          5: seq,
          6: fake.time || timestamp(),
          7: rand2uuid(rand),
          9: dm ? null : {
            1: this.uin,
            4: nickname,
          },
          14: dm ? nickname : null,
          20: {
            1: 0,
            2: rand,
          },
        },
        3: {
          1: maker.rich,
        },
      });
    }
    for (const maker of makers)
      imgs = [...imgs, ...maker.imgs];
    const contact = (dm ? this.pickFriend : this.pickGroup)(this.uin);
    if (imgs.length)
      await contact.uploadImages(imgs);
    const compressed = await gzip(pb.encode({
      1: nodes,
      2: {
        1: 'MultiMsg',
        2: {
          1: nodes,
        },
      },
    }));
    const _uploadMultiMsg = Reflect.get(contact, '_uploadMultiMsg') as Function;
    const resid = await _uploadMultiMsg.apply(contact, compressed);
    return {
      tSum: nodes.length,
      resid,
    };
  }
}
