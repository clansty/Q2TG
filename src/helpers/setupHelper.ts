import { Platform } from 'icqq';

export default {
  convertTextToPlatform(text: string): Platform {
    switch (text) {
      case '安卓手机':
        return Platform.Android;
      case '安卓平板':
        return Platform.aPad;
      case 'macOS':
        return Platform.iMac;
      case '安卓手表':
        return Platform.Watch;
      case 'iPad':
      default:
        return Platform.iPad;
    }
  },
  convertTextToWorkMode(text: string) {
    switch (text) {
      case '个人模式':
        return 'personal';
      case '群组模式':
        return 'group';
      default:
        return '';
    }
  },
  checkSignApiAddress(signApi: string) {
    try {
      new URL(signApi);
      return signApi;
    } catch (err) {
      return "";
    }
  }
};
