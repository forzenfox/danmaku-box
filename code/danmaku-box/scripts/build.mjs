import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';

// 构建脚本：4 个 TS 入口独立打包为自包含 IIFE 文件（MV3 content script 与
// service worker 均不支持共享 chunk 的 ES module 加载），public/ 静态资源整体
// 复制到 dist（manifest.json、panel.html、settings.html、icons）。

const common = {
  bundle: true,
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
};

const entries = [
  { in: 'src/background/index.ts', out: 'dist/background.js' },
  { in: 'src/content/index.ts', out: 'dist/content.js' },
  { in: 'src/panel/panel.ts', out: 'dist/panel.js' },
  { in: 'src/settings/settings.ts', out: 'dist/settings.js' },
];

await rm('dist', { recursive: true, force: true });

for (const entry of entries) {
  await build({ ...common, entryPoints: [entry.in], outfile: entry.out });
}

await cp('public', 'dist', { recursive: true });

console.log('构建完成：dist/');
