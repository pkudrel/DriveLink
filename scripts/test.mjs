// Bundles test/**/*.test.ts with esbuild (obsidian aliased to a stub) and runs them with node:test
import esbuild from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(root, 'test');

function findTests(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return findTests(full);
		return entry.name.endsWith('.test.ts') ? [full] : [];
	});
}

const entryPoints = findTests(testDir);
if (entryPoints.length === 0) {
	console.error('No test files found in test/');
	process.exit(1);
}

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'drivelink-tests-'));

try {
	await esbuild.build({
		entryPoints,
		outdir,
		outbase: testDir,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node16',
		sourcemap: 'inline',
		logLevel: 'error',
		alias: { obsidian: path.join(testDir, 'stubs', 'obsidian.ts') },
	});

	const outputs = entryPoints.map(file =>
		path.join(outdir, path.relative(testDir, file).replace(/\.ts$/, '.js'))
	);
	const result = spawnSync(process.execPath, ['--enable-source-maps', '--test', ...outputs], { stdio: 'inherit' });
	process.exitCode = result.status ?? 1;
} finally {
	fs.rmSync(outdir, { recursive: true, force: true });
}
