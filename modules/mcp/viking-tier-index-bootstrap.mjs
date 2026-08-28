import fs from 'node:fs';
import path from 'node:path';
import { createTierIndexDatabase } from './viking-tier-index.mjs';

const output = path.resolve(process.argv[2] ?? '.nlm_pack/tier-index.sqlite');
const ownerId = process.env.VIKING_OPERATOR_OWNER ?? 'owner_charlie_001';
if (!fs.existsSync(output)) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const db = createTierIndexDatabase(output);
  db.close();
}
const metadata = { owner_id: ownerId, owner_name: 'CIC Engineering', tier_index: path.basename(output), readonly_consumer: true };
fs.writeFileSync(`${output}.owner.json`, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'w' });
console.log(JSON.stringify({ event: 'viking.tier_index_bootstrapped', ...metadata, path: output }));