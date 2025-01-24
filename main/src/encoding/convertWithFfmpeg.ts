import ffmpeg from 'fluent-ffmpeg';

export default function (sourcePath: string, targetPath: string, format: string, cv?: string) {
  return new Promise<void>(resolve => {
    const ff = ffmpeg(sourcePath).toFormat(format).save(targetPath);
    if (cv) {
      ff.videoCodec(cv);
    }
    return ff.on('end', () => {
      resolve();
    });
  });
}
