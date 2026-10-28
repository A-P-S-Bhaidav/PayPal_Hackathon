import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
  const apiDir = path.join(ROOT_DIR, 'api');
  fs.mkdirSync(apiDir, { recursive: true });

  // Remove legacy api/index.ts if present so Vercel strictly uses pre-bundled api/index.js
  const legacyTs = path.join(apiDir, 'index.ts');
  if (fs.existsSync(legacyTs)) {
    fs.unlinkSync(legacyTs);
  }

  await build({
    entryPoints: [path.join(ROOT_DIR, 'server', 'vercel-entry.ts')],
    outfile: path.join(apiDir, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    packages: 'external',
    sourcemap: false,
    banner: {
      js: '// Pre-bundled ESM Serverless Function for Vercel (AegisPay OS)',
    },
  });

  // Sync Postman collection into public/ and dist/ so static CDN downloads always work
  const postmanSrc = path.join(ROOT_DIR, 'postman', 'AegisPay_Collection.json');
  if (fs.existsSync(postmanSrc)) {
    const pubPostmanDir = path.join(ROOT_DIR, 'public', 'postman');
    fs.mkdirSync(pubPostmanDir, { recursive: true });
    fs.copyFileSync(postmanSrc, path.join(pubPostmanDir, 'AegisPay_Collection.json'));

    const distDir = path.join(ROOT_DIR, 'dist');
    if (fs.existsSync(distDir)) {
      const distPostmanDir = path.join(distDir, 'postman');
      fs.mkdirSync(distPostmanDir, { recursive: true });
      fs.copyFileSync(postmanSrc, path.join(distPostmanDir, 'AegisPay_Collection.json'));
    }
  }

  console.log('[API BUNDLER] Compiled self-contained ESM serverless bundle -> api/index.js');
}

main().catch((err) => {
  console.error('[API BUNDLER] Failed:', err);
  process.exit(1);
});
