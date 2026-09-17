import fs from 'node:fs/promises';
import path from 'node:path';
await fs.appendFile(process.env.GITHUB_OUTPUT,
  `release=${path.resolve('../windows')}\nevidence=${path.resolve('../../work')}\nparent=${path.resolve('..')}\n`);
