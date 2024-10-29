import type { BuildConfig } from 'bun';
import { $ } from 'bun';
import dts from 'bun-plugin-dts';

const defaultBuildConfig: BuildConfig = {
  entrypoints: ['./src/index.ts'],
  outdir: './out/dist',
  packages: 'bundle',
  splitting: true,
  sourcemap: 'external',
  external: ['react'],
};

await $`rm -rf ./out`;

const [esm, cjs] = await Promise.all([
  Bun.build({
    ...defaultBuildConfig,
    plugins: [dts()],
    format: 'esm',
    naming: '[dir]/[name].js',
  }),
  Bun.build({
    ...defaultBuildConfig,
    format: 'cjs',
    naming: '[dir]/[name].cjs',
  }),
]);

if (!esm.success) {
  console.log('ESM BUILD FAILED');
  console.log(esm);
} else if (!cjs.success) {
  console.log('CJS BUILD FAILED');
  console.log(cjs);
}

await $`cp ./package.json ./out/package.json`;
