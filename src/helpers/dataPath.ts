import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('./data');

// Wrap of path.join, add base DATA_DIR
export default (...paths: string[]) =>
  path.join(DATA_DIR, ...paths);
