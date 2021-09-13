import md5 from 'md5'
import config from '../providers/config'

export default (resId: string) =>
    md5(md5(resId) + config.crv.token ?? '')
