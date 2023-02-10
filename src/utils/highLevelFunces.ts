export function debounce<TArgs extends any[], TRet>(fn: (...originArgs: TArgs) => TRet, dur = 100) {
  let timer: NodeJS.Timeout;
  return function (...args: TArgs) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // @ts-ignore
      fn.apply(this, args);
    }, dur);
  };
}

export function throttle<TArgs extends any[], TRet>(fn: (...originArgs: TArgs) => TRet, time = 500) {
  let timer: NodeJS.Timeout;
  return function (...args) {
    if (timer == null) {
      fn.apply(this, args);
      timer = setTimeout(() => {
        timer = null;
      }, time);
    }
  };
}

export function consumer<TArgs extends any[], TRet>(fn: (...originArgs: TArgs) => TRet, time = 100) {
  const tasks: Function[] = [];
  let timer: NodeJS.Timeout;

  const nextTask = () => {
    if (tasks.length === 0) return false;

    tasks.shift().call(null);
    return true;
  };

  return function (...args: TArgs) {
    tasks.push(fn.bind(this, ...args));

    if (timer == null) {
      nextTask();
      timer = setInterval(() => {
        if (!nextTask()) {
          clearInterval(timer);
          timer = null;
        }
      }, time);
    }
  };
}
