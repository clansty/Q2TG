import crypto from 'crypto';

const random = {
  int(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min; //含最大值，含最小值
  },
  hex(length: number) {
    return crypto.randomBytes(length / 2).toString('hex');
  },
  pick<T>(...array: T[]) {
    const index = random.int(0, array.length - 1);
    return array[index];
  },
  fakeUuid() {
    return `${random.hex(8)}-${random.hex(4)}-${random.hex(4)}-${random.hex(4)}-${random.hex(12)}`;
  },
  imei() {
    const uin = random.int(1000000, 4294967295);
    let imei = uin % 2 ? '86' : '35';
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(uin);
    let a: number | string = buf.readUInt16BE();
    let b: number | string = Buffer.concat([Buffer.alloc(1), buf.slice(1)]).readUInt32BE();
    if (a > 9999)
      a = Math.trunc(a / 10);
    else if (a < 1000)
      a = String(uin).substring(0, 4);
    while (b > 9999999)
      b = b >>> 1;
    if (b < 1000000)
      b = String(uin).substring(0, 4) + String(uin).substring(0, 3);
    imei += a + '0' + b;

    function calcSP(imei: string) {
      let sum = 0;
      for (let i = 0; i < imei.length; ++i) {
        if (i % 2) {
          let j = parseInt(imei[i]) * 2;
          sum += j % 10 + Math.floor(j / 10);
        }
        else {
          sum += parseInt(imei[i]);
        }
      }
      return (100 - sum) % 10;
    }

    return imei + calcSP(imei);
  },
};

export default random;
