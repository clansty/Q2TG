import {
  Client,
  DiscussMessageEvent,
  Friend,
  Group,
  GroupMessageEvent,
  LogLevel,
  Platform,
  PrivateMessageEvent,
} from 'oicq';
import Buffer from 'buffer';
import { execSync } from 'child_process';
import random from '../utils/random';
import fs from 'fs';
import fsP from 'fs/promises';
import { Config } from 'oicq/lib/client';
import dataPath from '../helpers/dataPath';
import os from 'os';

const LOG_LEVEL: LogLevel = 'warn';

type MessageHandler = (event: PrivateMessageEvent | GroupMessageEvent) => Promise<boolean | void>

interface CreateOicqParams {
  id: number;
  uin: number;
  password: string;
  platform: Platform;
  // 当需要验证手机时调用此方法，应该返回收到的手机验证码
  onVerifyDevice: (phone: string) => Promise<string>;
  // 当滑块时调用此方法，返回 ticker，也可以返回假值改用扫码登录
  onVerifySlider: (url: string) => Promise<string>;
  // 扫码后返回
  onQrCode: (image: Buffer) => Promise<void>;
}

// OicqExtended??
export default class OicqClient extends Client {
  private readonly onMessageHandlers: Array<MessageHandler> = [];

  private constructor(uin: number, public readonly id: number, conf?: Config) {
    super(uin, conf);
  }

  private static existedBots = {} as { [id: number]: OicqClient };

  public static create(params: CreateOicqParams) {
    if (this.existedBots[params.id]) {
      return Promise.resolve(this.existedBots[params.id]);
    }
    return new Promise<OicqClient>(async (resolve, reject) => {
      async function loginDeviceHandler({ phone }: { url: string, phone: string }) {
        client.sendSmsCode();
        const code = await params.onVerifyDevice(phone);
        if (code === 'qrsubmit') {
          client.login();
        }
        else {
          client.submitSmsCode(code);
        }
      }

      async function loginSliderHandler({ url }: { url: string }) {
        const res = await params.onVerifySlider(url);
        if (res) {
          client.submitSlider(res);
        }
        else {
          client.login();
        }
      }

      async function loginQrCodeHandler({ image }: { image: Buffer }) {
        await params.onQrCode(image);
        client.qrcodeLogin();
      }

      function loginErrorHandler({ message }: { code: number; message: string }) {
        reject(message);
      }

      function successLoginHandler() {
        client.off('system.login.device', loginDeviceHandler)
          .off('system.login.slider', loginSliderHandler)
          .off('system.login.qrcode', loginQrCodeHandler)
          .off('system.login.error', loginErrorHandler)
          .off('system.online', successLoginHandler)
          .on('message', client.onMessage);
        resolve(client);
      }

      if (!fs.existsSync(dataPath(`${params.uin}/device-${params.uin}.json`))) {
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

        await fsP.writeFile(dataPath(`${params.uin}/device-${params.uin}.json`), JSON.stringify(device, null, 0), 'utf-8');
      }

      const client = new this(params.uin, params.id, {
        platform: params.platform,
        data_dir: dataPath(),
        log_level: LOG_LEVEL,
        ffmpeg_path: process.env.FFMPEG_PATH,
        ffprobe_path: process.env.FFPROBE_PATH,
      })
        .on('system.login.device', loginDeviceHandler)
        .on('system.login.slider', loginSliderHandler)
        .on('system.login.qrcode', loginQrCodeHandler)
        .on('system.login.error', loginErrorHandler)
        .on('system.online', successLoginHandler);

      this.existedBots[params.id] = client;
      client.login(params.password);
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
}
