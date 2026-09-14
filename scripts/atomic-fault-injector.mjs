// atomic-fault-injector.mjs — 故障注入器（仅供 scripts/test-atomic-write.mjs 使用）
//
// 作用：通过 `node --import <本文件>` 在**被测脚本 import 之前** monkeypatch node:fs/promises，
//       使 memory-append.mjs 在**源码零改动**的前提下经历 rename / writeFile 故障。
//
// 为什么用 monkeypatch 而不是改源码：源码一行不动，唯一变量就是「替换策略」，
//       这样才能断言「测试变红是因为实现不原子」，而不是「因为改坏了别的什么」。
//       已验证：node:fs/promises 的 ESM 命名导出是 live binding，patch fs.promises.X 对
//       `import { X } from 'node:fs/promises'` 生效（Node 22.22.2）。
//
// SC_FAULT 取值（逗号分隔，可组合）：
//   (空)              原样转发，零影响 ——「正常」与「故障」的唯一差异就是这些开关
//   rename-fail       rename() 抛 EPERM                  → 测「替换步骤失败」
//   write-half        writeFile() 写满一半后抛 ENOSPC     → 测「落盘中途断电」（确定性，不依赖时序）
//   observe           在替换动作执行期间并发采样目标文件  → 测「观测者能否看到中间态」
//   nonatomic         rename() 退化为「读 tmp → 直接覆盖目标」（= D3 修复前的历史真实实现）
//   nonatomic-half    rename() 退化为分段慢速覆盖（必然留下可观测中间态）
// SC_TARGET   被观测/被保护的目标文件绝对路径
// SC_SAMPLES  采样结果输出文件（JSON 数组，元素为 "<md5>:<字节数>" 或 "__ERR__:<code>"）
import fs from 'node:fs';
import { writeFileSync } from 'node:fs';

const P = fs.promises;
const real = {
  writeFile: P.writeFile.bind(P),
  rename: P.rename.bind(P),
  readFile: P.readFile.bind(P),
  open: P.open.bind(P),
  stat: P.stat.bind(P),
};
const fault = process.env.SC_FAULT || '';
if (!fault) {
  // 未注入任何故障：一个原语都不碰，行为与不加载本文件完全一致
} else {
  const target = process.env.SC_TARGET || '';
  const samplesOut = process.env.SC_SAMPLES || '';
  const normPath = (p) => String(p).replace(/\\/g, '/').toLowerCase();
  const isTarget = (p) => target !== '' && normPath(p) === normPath(target);

  // 并发采样：替换动作执行期间反复 stat 目标文件，只记录「size:mtimeMs」。
  // 【为什么是 stat 而不是 readFile】Windows 下 readFile 会短暂持有文件句柄，
  // 而 Node 打开文件时默认不共享 DELETE 权限 ⇒ 观测者会把被测的 rename 挤成 EBUSY，
  // 观测行为本身污染被测行为（实测：readFile 采样 ⇒ memory-append 直接 exit=5）。
  // stat 不持有句柄，对 rename 无干扰，且足以区分「旧全文 / 新全文 / 半截」三种尺寸态。
  async function withObservation(action) {
    const samples = [];
    let stop = false;
    let n = 0;
    const obs = (async () => {
      while (!stop && n < 20000) {
        n++;
        try {
          const st = await real.stat(target);
          samples.push(`${st.size}:${st.mtimeMs}`);
        } catch (e) {
          samples.push('__ERR__:' + (e && e ? e.code : 'unknown'));
        }
      }
    })();
    try {
      return await action();
    } finally {
      stop = true;
      await obs;
      if (samplesOut) writeFileSync(samplesOut, JSON.stringify(samples));
    }
  }

  P.writeFile = async function (path, data, enc) {
    // 非原子实现**没有 tmp 这个概念**：它直接写目标文件。
    // 因此 nonatomic 模式下把「写 tmp」重定向为「写目标」，否则等于替非原子实现
    // 保留了 tmp 这层保护，故障永远打不到目标文件上，A3 就永远假绿。
    if (fault.includes('nonatomic') && target !== '' && /\.tmp-\d+-[a-z0-9]+$/.test(String(path))) {
      path = target;
    }
    if (fault.includes('write-half')) {
      // 模拟「落盘一半磁盘满/断电」：先 truncate 打开 → 写前一半 → 关闭 → 抛错
      // 关键：目标此刻已被截断且内容是半截的 —— 这正是原子写必须防御的中间态
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), enc || 'utf8');
      const h = await real.open(path, 'w');
      try {
        const half = Math.max(1, Math.floor(buf.length / 2));
        await P.write(h, buf.subarray(0, half));
      } finally {
        await h.close().catch(() => {});
      }
      const e = new Error('INJECTED_DISK_FULL_HALFWAY');
      e.code = 'ENOSPC';
      throw e;
    }
    if (fault.includes('observe') && isTarget(path)) {
      return withObservation(() => real.writeFile(path, data, enc));
    }
    return real.writeFile(path, data, enc);
  };

  // 注意判断顺序：nonatomic / nonatomic-half 语义是「实现根本不走 rename」，
  // 因此它们必须**先于** rename-fail 判断 —— 非原子实现下 rename 压根不会被调用，
  // rename-fail 自然不可能触发（否则注入器自己把「非原子」伪装成了「原子但失败」）。
  P.rename = async function (from, to) {
    if (fault.includes('nonatomic')) {
      // D3 修复前的历史真实实现：不走 rename，直接把内容覆盖回目标。
      // 这里必须调 **P.writeFile（可能被再次注入）** 而非 real.writeFile：
      // 非原子实现的写目标就是正规文件本身，后续注入（write-half / observe）理应对它生效，
      // 否则等于替非原子实现挡掉了故障，反而把「非原子」伪装成「安全」。
      const buf = await real.readFile(from);
      return P.writeFile(to, buf);
    }
    if (fault.includes('nonatomic-half')) {
      // 分段慢速覆盖：确保并发观测者一定能抓到中间态
      const buf = await real.readFile(from);
      const h = await real.open(to, 'w');
      const step = Math.max(1, Math.ceil(buf.length / 4));
      for (let i = 0; i < buf.length; i += step) {
        await P.write(h, buf.subarray(i, i + step));
        await new Promise((r) => setTimeout(r, 30));
      }
      await h.close();
      return;
    }
    if (fault.includes('rename-fail')) {
      const e = new Error('INJECTED_RENAME_FAIL');
      e.code = 'EPERM';
      throw e;
    }
    if (fault.includes('observe') && isTarget(to)) {
      return withObservation(() => real.rename(from, to));
    }
    return real.rename(from, to);
  };
}
