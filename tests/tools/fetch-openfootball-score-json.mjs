// Download only Openfootball's generated score JSON into ignored work/ for aggregation.
// The source repository uses CC0; generated files are kept out of Git.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function listSeasonFiles(root) {
  const result = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^(?:2024-25|2024)_.*\.txt$/i.test(entry.name)) result.push(path);
    }
  };
  walk(root);
  return result.sort();
}

function pageUrl(sourceRootName, relativePath) {
  const parts = relativePath.replaceAll('\\', '/').split('/');
  const file = parts.pop().replace(/\.txt$/i, '.json');
  const competitionGroup = parts.at(-1) === 'rsssf' ? 'rsssf' : parts.pop();
  const item = `${competitionGroup}_${file}`;
  return `https://openfootball.github.io/europe/${encodeURIComponent(item)}`;
}

async function downloadOne(task, root, outputRoot) {
  const relativePath = relative(root, task).replaceAll('\\', '/');
  const outputPath = join(outputRoot, relativePath.replace(/\.txt$/i, '.json'));
  mkdirSync(resolve(outputPath, '..'), { recursive: true });
  const url = pageUrl(basename(root), relativePath);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, { headers: { 'user-agent': 'touchline-manager-reference-audit/1.0' } });
    if (response.ok) {
      const content = await response.text();
      JSON.parse(content);
      writeFileSync(outputPath, content);
      return { file: relativePath, url, status: response.status, bytes: Buffer.byteLength(content) };
    }
    if (response.status !== 429 && response.status < 500)
      throw Error(`Openfootball JSON unavailable (${response.status}): ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
  throw Error(`Openfootball JSON retries exhausted: ${url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourceRoot, outputRoot, concurrencyArg = '6'] = process.argv.slice(2);
  if (!sourceRoot || !outputRoot) throw Error('Usage: fetch-openfootball-score-json.mjs <source-repo> <ignored-output-dir> [concurrency]');
  const root = resolve(sourceRoot);
  const files = listSeasonFiles(root);
  const concurrency = Math.max(1, Math.min(8, Number(concurrencyArg)));
  const queue = [...files];
  const results = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (queue.length) {
      const file = queue.shift();
      const result = await downloadOne(file, root, resolve(outputRoot));
      results.push(result);
      if (results.length % 10 === 0 || results.length === files.length)
        console.log(JSON.stringify({ completed: results.length, total: files.length }));
    }
  }));
  const manifest = { fetchedAt: new Date().toISOString(), sourceRoot: basename(root), files: results.sort((a, b) => a.file.localeCompare(b.file)) };
  writeFileSync(join(resolve(outputRoot), 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ files: results.length, totalBytes: results.reduce((sum, row) => sum + row.bytes, 0), manifest: join(resolve(outputRoot), 'manifest.json') }, null, 2));
}
