import { configure, getLogger } from 'log4js';
import Instance from './models/Instance';
import db from './models/db';

(async () => {
  configure({
    appenders: {
      console: { type: 'console' },
    },
    categories: {
      default: { level: 'debug', appenders: ['console'] },
    },
  });
  const log = getLogger('Main');

  if (!process.versions.node.startsWith('18.')) {
    log.warn('当前正在使用的 Node.JS 版本为', process.versions.node, '，未经测试');
  }

  process.on('unhandledRejection', error => {
    log.error('UnhandledException: ', error);
  });
  const instanceEntries = await db.instance.findMany();

  if (!instanceEntries.length) {
    await Instance.start(0);
  }
  else {
    for (const instanceEntry of instanceEntries) {
      await Instance.start(instanceEntry.id);
    }
  }

  setTimeout(async () => {
    for (const instance of Instance.instances.filter(it => it.workMode === 'group')) {
      try {
        await instance.forwardPairs.initMapInstance(Instance.instances.filter(it => it.workMode === 'personal'));
      }
      catch {
      }
    }
  }, 15 * 1000);
})();
