import fs from 'fs';

type UserConfig = {
  userBotSession: string;
  qqUin: number;
  qqPassword: string;
  isSetup: boolean;
}

const CONFIG_PATH = './data/config.json';

const defaultConfig: UserConfig = {
  userBotSession: '',
  qqUin: 0,
  qqPassword: '',
  isSetup: false,
};

export const config: UserConfig = fs.existsSync(CONFIG_PATH) ?
  JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) :
  defaultConfig;

export const saveConfig = () => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 0), 'utf8');
};
