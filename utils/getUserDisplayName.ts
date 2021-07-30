import {User} from 'node-telegram-bot-api'

export default (user: User) => user.first_name +
    (user.last_name ? ' ' + user.last_name : '')
