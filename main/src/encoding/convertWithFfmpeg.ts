import ffmpeg from 'fluent-ffmpeg';

export default function (sourcePath: string, targetPath: string, format: string){
  return new Promise<void>(resolve => {
    ffmpeg(sourcePath).toFormat(format).save(targetPath)
      .on('end', () => {
        resolve();
      })
  })
}
