import md5 from 'md5'
import config from './config'

export default (resId: string) =>
    md5(md5(resId) + config.crv.token ?? '')
