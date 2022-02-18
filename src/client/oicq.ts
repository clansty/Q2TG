import { Client, createClient, Platform } from 'oicq';
import * as Buffer from 'buffer';

interface CreateOicqParams {
  uin: number;
  password: string;
  platform: Platform;
  // 当需要验证手机时调用此方法，应该返回收到当手机验证码
  onVerifyDevice: (phone: string) => Promise<string>;
  // 当滑块时调用此方法，返回 ticker，也可以返回假值改用扫码登录
  onVerifySlider: (url: string) => Promise<string>;
  // 扫码后返回
  onQrCode: (image: Buffer) => Promise<void>;
}

export default function createOicq(params: CreateOicqParams) {
  return new Promise<Client>((resolve, reject) => {
    async function loginDeviceHandler({ phone }: { url: string, phone: string }) {
      client.sendSmsCode();
      const code = await params.onVerifyDevice(phone);
      client.submitSmsCode(code);
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
        .off('system.online', successLoginHandler);
      resolve(client);
    }

    const client = createClient(params.uin, {
      platform: params.platform,
    })
      .on('system.login.device', loginDeviceHandler)
      .on('system.login.slider', loginSliderHandler)
      .on('system.login.qrcode', loginQrCodeHandler)
      .on('system.login.error', loginErrorHandler)
      .on('system.online', successLoginHandler);
    client.login(params.password);
  });
}
