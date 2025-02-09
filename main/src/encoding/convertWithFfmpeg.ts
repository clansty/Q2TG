import ffmpeg from 'fluent-ffmpeg';
import { getLogger } from 'log4js';
import fsP from 'fs/promises';

const logger = getLogger('convertWithFfmpeg');

export default function (sourcePath: string, targetPath: string, format: string, srcFormat?: string) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const ff = ffmpeg(sourcePath);
      if (srcFormat) {
        ff.addInputOption('-c:v', srcFormat);
      }
      if (format === 'gif') {
        ff.complexFilter('[0:v] palettegen=reserve_transparent=on [p]; [0:v] [p] paletteuse=dither=floyd_steinberg');
      }
      if (format === 'webm') {
        ff.videoCodec('libvpx-vp9');
      }
      ff.toFormat(format).save(targetPath);
      logger.debug('正在启动 ffmpeg: ' + ff._getArguments().join(' '));
      ff.on('error', async err => {
        logger.error('ffmpeg 转换失败', err);
        reject(err);
        const stats = await fsP.stat(targetPath);
        logger.debug('转换结果文件大小: ' + stats.size);
        if (!stats.size) {
          logger.error('转换结果文件为空: ' + targetPath);
          await fsP.rm(targetPath);
        }
      });
      return ff.on('end', async () => {
        resolve();
      });
    }
    catch (e) {
      logger.error('ffmpeg 转换失败', e);
      reject(e);
      const stats = await fsP.stat(targetPath);
      logger.debug('转换结果文件大小: ' + stats.size);
      if (!stats.size) {
        logger.error('转换结果文件为空: ' + targetPath);
        await fsP.rm(targetPath);
      }
    }
  });
}
