import { existsSync, rmSync } from 'node:fs';

const cnamePath = 'dist/CNAME';
if (existsSync(cnamePath)) {
  rmSync(cnamePath);
}
