import crypto from 'crypto';

export function md5(input: crypto.BinaryLike) {
  const hash = crypto.createHash('md5');
  return hash.update(input).digest();
}

export function md5Hex(input: crypto.BinaryLike) {
  const hash = crypto.createHash('md5');
  return hash.update(input).digest('hex');
}

export function md5B64(input: crypto.BinaryLike) {
  const hash = crypto.createHash('md5');
  return hash.update(input).digest('base64');
}

export function sha256Hex(input: crypto.BinaryLike) {
  const hash = crypto.createHash('sha256');
  return hash.update(input).digest('hex');
}

export function sha256B64(input: crypto.BinaryLike) {
  const hash = crypto.createHash('sha256');
  return hash.update(input).digest('base64');
}
