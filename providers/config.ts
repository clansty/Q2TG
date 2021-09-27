import fs from 'fs'
import YAML from 'yaml'

export type ForwardInfo = {
    qq: number,
    tg: number
}

interface Config {
    tgToken: string
    qqUin: number
    qqPasswd: string
    protocol: 1 | 2 | 3 | 4 | 5
    mongoDb: {
        connStr: string
        dbName: string
    }
    crv: {
        host?: string
        token?: string
    }
    groups: Array<ForwardInfo>
    api: {
        enabled: boolean
        port: number
        deleteNotifier: string
    }
    cos:{
        enabled: boolean
        secretId: string
        secretKey: string
        bucket: string
        region: string
        url: string
    }
}

export default <Config>YAML.parse(fs.existsSync('config.yaml') ?
    fs.readFileSync('config.yaml', 'utf8') : process.env.Q2TG_CONFIG)
