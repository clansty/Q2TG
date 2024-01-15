import path from 'path';
import env from '../models/env';

// Wrap of path.join, add base DATA_DIR
export default (...paths: string[]) =>
  path.join(env.DATA_DIR, ...paths);
