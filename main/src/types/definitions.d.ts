import { MessageRet } from 'icqq';

export type WorkMode = 'group' | 'personal';
export type QQMessageSent = MessageRet & { senderId: number, brief: string };
