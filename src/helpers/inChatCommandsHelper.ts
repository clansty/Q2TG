import flags from '../constants/flags';

export default {
  displayFlag(flag: number) {
    const enabled = [];
    for (const name in flags) {
      const value = flags[name] as any as number;
      if (flag & value) {
        enabled.push(name);
      }
    }
    return ['0b' + flag.toString(2), ...enabled].join('\n');
  },
};
