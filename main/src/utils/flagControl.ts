import flags from '../constants/flags';
import { Pair } from '../models/Pair';
import Instance from '../models/Instance';

const displayFlag = (flag: number) => {
  const enabled = [];
  for (const name in flags) {
    const value = flags[name] as any as number;
    if (flag & value) {
      enabled.push(name);
    }
  }
  return ['0b' + flag.toString(2), ...enabled].join('\n');
};

export const editFlags = async (params: string[], target: Pair | Instance) => {
  if (!params.length) {
    return displayFlag(target.flags);
  }
  if (params.length !== 2) return '参数格式错误';

  let operand = Number(params[1]);
  if (isNaN(operand)) {
    operand = flags[params[1].toUpperCase()];
  }
  if (isNaN(operand)) return 'flag 格式错误';

  switch (params[0]) {
    case 'add':
    case 'set':
      target.flags |= operand;
      break;
    case 'rm':
    case 'remove':
    case 'del':
    case 'delete':
      target.flags &= ~operand;
      break;
    case 'put':
      target.flags = operand;
      break;
  }

  return displayFlag(target.flags);
};
