import dataPath from './dataPath';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { file as createTempFile } from 'tmp-promise';
import fsP from 'fs/promises';
import convertWithFfmpeg from '../encoding/convertWithFfmpeg';
import tgsToGif from '../encoding/tgsToGif';

const CACHE_PATH = dataPath('cache');
fs.mkdirSync(CACHE_PATH, { recursive: true });

// 首先查找缓存，要是缓存中没有的话执行第二个参数的方法转换到缓存的文件
const cachedConvert = async (key: string, convert: (outputPath: string) => Promise<any>) => {
  const convertedPath = path.join(CACHE_PATH, key);
  if (!fs.existsSync(convertedPath)) {
    await convert(convertedPath);
  }
  return convertedPath;
};

const convert = {
  cached: cachedConvert,
  cachedBuffer: (key: string, buf: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key, async (convertedPath) => {
      await fsP.writeFile(convertedPath, await buf());
    }),
  // webp2png，这里 webpData 是方法因为不需要的话就不获取了
  png: (key: string, webpData: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key + '.png', async (convertedPath) => {
      await sharp(await webpData()).png().toFile(convertedPath);
    }),
  webm2gif: (key: string, webmData: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key + '.gif', async (convertedPath) => {
      const temp = await createTempFile();
      await fsP.writeFile(temp.path, await webmData());
      await convertWithFfmpeg(temp.path, convertedPath, 'gif');
      await temp.cleanup();
    }),
  tgs2gif: (key: string, tgsData: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key + '.gif', async (convertedPath) => {
      const tempTgsPath = path.join(CACHE_PATH, key);
      await fsP.writeFile(tempTgsPath, await tgsData());
      await tgsToGif(tempTgsPath);
      await fsP.rm(tempTgsPath);
    }),
  webp: (key: string, imageData: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key + '.webp', async (convertedPath) => {
      await sharp(await imageData()).webp().toFile(convertedPath);
    }),
  customEmoji: (key: string, imageData: () => Promise<Buffer | Uint8Array | string>, useSmallSize: boolean) =>
    useSmallSize ?
      cachedConvert(key + '@50.png', async (convertedPath) => {
        await sharp(await convert.png(key, imageData)).resize(50).toFile(convertedPath);
      }) :
      convert.png(key, imageData),
};

export default convert;
