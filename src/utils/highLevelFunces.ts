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

export function consumer<TArgs extends any[], TRet>(fn: (...originArgs: TArgs) => TRet, time = 100) {
  let tasks = [], timer: NodeJS.Timeout;

  return function (...args: TArgs) {
    tasks.push(fn.bind(this, ...args));
    if (timer == null) {
      timer = setInterval(() => {
        tasks.shift().call(this);
        if (tasks.length <= 0) {
          clearInterval(timer);
          timer = null;
        }
      }, time);
    }
  };
}
