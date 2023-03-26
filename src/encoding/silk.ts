import ffmpeg from 'fluent-ffmpeg';
import { file } from 'tmp-promise';
import silk from 'silk-sdk';
import fsP from 'fs/promises';

const conventOggToPcm = (oggPath: string, tmpFilePath: string): Promise<void> => {
  return new Promise(resolve => {
    ffmpeg(oggPath)
      .outputFormat('s16le')
      .outputOptions([
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
      ])
      .on('end', async () => {
        resolve();
      }).save(tmpFilePath);
  });
};

const conventPcmToOgg = (pcmPath: string, savePath: string): Promise<void> => {
  return new Promise(resolve => {
    ffmpeg(pcmPath).inputOption([
      '-f', 's16le',
      '-ar', '24000',
      '-ac', '1',
    ])
      .outputFormat('ogg')
      .on('end', async () => {
        resolve();
      }).save(savePath);
  });
};

export default {
  async encode(oggPath: string): Promise<Buffer> {
    const { path, cleanup } = await file();
    await conventOggToPcm(oggPath, path);
    const bufSilk = silk.encode(path, {
      tencent: true,
    });
    await cleanup();
    return bufSilk;
  },

  async decode(bufSilk: Buffer, outputPath: string): Promise<void> {
    const bufPcm = silk.decode(bufSilk);
    const { path, cleanup } = await file();
    await fsP.writeFile(path, bufPcm);
    await conventPcmToOgg(path, outputPath);
    cleanup();
  },

  conventOggToPcm16000: (oggPath: string, tmpFilePath: string): Promise<void> => {
    return new Promise(resolve => {
      ffmpeg(oggPath)
        .outputFormat('s16le')
        .outputOptions([
          '-ar', '16000',
          '-ac', '1',
          '-acodec', 'pcm_s16le',
        ])
        .on('end', async () => {
          resolve();
        }).save(tmpFilePath);
    });
  },
};
