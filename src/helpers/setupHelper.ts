import { Platform } from 'oicq';

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
};
