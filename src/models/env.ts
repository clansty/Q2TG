import z from 'zod';
import path from 'path';

const configParsed = z.object({
  DATA_DIR: z.string().default(path.resolve('./data')),
  OICQ_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('warn'),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  SIGN_API: z.string().url().optional(),
  SIGN_VER: z.string().optional(),
  TG_API_ID: z.string().regex(/^\d+$/).transform(Number),
  TG_API_HASH: z.string(),
  TG_BOT_TOKEN: z.string(),
  TG_CONNECTION: z.enum(['websocket', 'tcp']).default('tcp'),
  TG_INITIAL_DCID: z.string().regex(/^\d+$/).transform(Number).optional(),
  TG_INITIAL_SERVER: z.string().ip().optional(),
  IPV6: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('false'),
  PROXY_IP: z.string().ip().optional(),
  PROXY_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  PROXY_USERNAME: z.string().optional(),
  PROXY_PASSWORD: z.string().optional(),
  TGS_TO_GIF: z.string().default('tgs_to_gif'),
  CRV_API: z.string().url().optional(),
  CRV_KEY: z.string().optional(),
  ZINC_URL: z.string().url().optional(),
  ZINC_USERNAME: z.string().optional(),
  ZINC_PASSWORD: z.string().optional(),
  BAIDU_APP_ID: z.string().optional(),
  BAIDU_API_KEY: z.string().optional(),
  BAIDU_SECRET_KEY: z.string().optional(),
  DISABLE_FILE_UPLOAD_TIP: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('false'),
}).safeParse(process.env);

if (!configParsed.success) {
  console.error('环境变量解析错误:', (configParsed as any).error);
  process.exit(1);
}

export default configParsed.data;
