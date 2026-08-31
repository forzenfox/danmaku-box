// 检查编排：typecheck -> lint -> test -> build 顺序执行，任一失败即中止并传递退出码。
// （不使用 npm script 的 && 链，因用户 npm 配置的 script-shell 为 PowerShell 5.1，不支持 &&）
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'typecheck', cmd: ['node', 'node_modules/typescript/bin/tsc', '--noEmit'] },
  { name: 'lint', cmd: ['node', 'node_modules/eslint/bin/eslint.js', '.'] },
  { name: 'test', cmd: ['node', '--test', 'tests/**/*.test.ts', 'src/**/*.test.ts'] },
  { name: 'build', cmd: ['node', 'scripts/build.mjs'] },
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n${step.name} 失败，检查中止`);
    process.exit(r.status ?? 1);
  }
}
console.log('\n全部检查通过');
