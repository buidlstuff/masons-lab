import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const manifestPath = fileURLToPath(new URL('../dist/manifest.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function resolveRecord(ref) {
  if (!ref) return null;
  if (manifest[ref]) return manifest[ref];
  return Object.values(manifest).find((record) => record.file === ref) ?? null;
}

function collectRecordGraph(startKey, options = {}, visited = new Map()) {
  const { includeDynamic = false } = options;
  const record = resolveRecord(startKey);
  if (!record) {
    return visited;
  }

  if (visited.has(record.file)) {
    return visited;
  }

  visited.set(record.file, record);
  for (const imported of record.imports ?? []) {
    collectRecordGraph(imported, options, visited);
  }
  if (includeDynamic) {
    for (const imported of record.dynamicImports ?? []) {
      collectRecordGraph(imported, options, visited);
    }
  }
  return visited;
}

function gzipBytesForFile(file) {
  const absolute = join(distDir, file);
  const source = readFileSync(absolute);
  return gzipSync(source).byteLength;
}

function totalGzip(files) {
  return Array.from(files)
    .filter((file) => file.endsWith('.js'))
    .reduce((sum, file) => sum + gzipBytesForFile(file), 0);
}

function kilobytes(bytes) {
  return bytes / 1024;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const homeEntryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
const buildEntryKey = Object.keys(manifest).find((key) => key.includes('src/pages/BuildPage.tsx'));

assert(homeEntryKey, 'Could not find the home entry chunk in dist/manifest.json.');
assert(buildEntryKey, 'Could not find the build route chunk in dist/manifest.json.');

const homeRecords = collectRecordGraph(homeEntryKey);
const buildRecords = collectRecordGraph(buildEntryKey, { includeDynamic: true });
const homeFiles = new Set(homeRecords.keys());
const buildFiles = new Set(buildRecords.keys());
const buildIncrementalFiles = new Set(
  Array.from(buildFiles).filter((file) => !homeFiles.has(file)),
);

const homeGzip = totalGzip(homeFiles);
const buildIncrementalGzip = totalGzip(buildIncrementalFiles);
const homeContents = Array.from(homeFiles)
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync(join(distDir, file), 'utf8'))
  .join('\n');
const homeChunkNames = new Set(Array.from(homeRecords.values()).map((record) => record.name));

assert(!homeContents.includes('p5.js seems to have been imported multiple times'), 'Home entry still contains p5.');
assert(!homeContents.includes('Matter.Engine.create'), 'Home entry still contains matter-js.');
assert(!homeChunkNames.has('builder-core'), 'Home entry still imports builder-core.');
assert(!homeChunkNames.has('assistant'), 'Home entry still imports assistant UI.');
assert(!homeChunkNames.has('builder-render'), 'Home entry still imports the builder renderer.');
assert(!homeChunkNames.has('builder-physics'), 'Home entry still imports the physics engine.');
assert(kilobytes(homeGzip) <= 240, `Home entry is ${kilobytes(homeGzip).toFixed(1)} kB gzip, above the 240 kB budget.`);
assert(
  kilobytes(buildIncrementalGzip) <= 340,
  `Builder incremental graph is ${kilobytes(buildIncrementalGzip).toFixed(1)} kB gzip, above the 340 kB budget.`,
);

const summary = {
  homeEntryKbGzip: Number(kilobytes(homeGzip).toFixed(1)),
  builderIncrementalKbGzip: Number(kilobytes(buildIncrementalGzip).toFixed(1)),
  homeFiles: Array.from(homeFiles).sort(),
  builderIncrementalFiles: Array.from(buildIncrementalFiles).sort(),
};

console.info(`[bundle-check] home=${summary.homeEntryKbGzip}kB gzip builder+${summary.builderIncrementalKbGzip}kB gzip`);
