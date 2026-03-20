import { execSync } from 'child_process';
import { rmSync } from 'fs';

const times = 50;
const results = [];

for (let i = 1; i <= times; i++) {
    console.log(`\n========== 第 ${i} 次下载 ==========`);

    // 删除 node_modules
    try {
        rmSync('node_modules', { recursive: true, force: true });
        rmSync('package-lock.json', { force: true });
        console.log('已删除 node_modules');
    } catch (e) {}

    // 清除 npm 缓存
    execSync('npm cache clean --force', { stdio: 'inherit' });

    const start = Date.now();
    execSync('npm i @bobocn/element', { stdio: 'inherit' });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    results.push(duration);
    console.log(`第 ${i} 次耗时: ${duration} 秒`);
}

// 输出统计
console.log('\n========== 统计结果 ==========');
console.log('各次耗时:', results.join('s, ') + 's');
console.log('平均耗时:', (results.reduce((a, b) => +a + +b, 0) / times).toFixed(2) + '秒');