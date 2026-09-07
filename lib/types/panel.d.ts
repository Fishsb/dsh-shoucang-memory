/**
 * @dsh-external/shoucang-panel — 宿主半区。
 *
 * 职责：为 client 面板（client.js，纯 DOM）提供 /api/shoucang-panel HTTP RPC：
 *   GET  /roots     已登记守藏根目录列表 + 当前激活 root
 *   POST /set_root  {path, name?} 登记/切换 root（目录须含 shoucang.config.yaml）
 *   GET  /get_root  → {active}
 *   GET  /config    当前 root 的 shoucang.config.yaml 原文 + 关键字段解析
 *   POST /save      {text} 备份先行写入（.bak-<时间戳>）
 *   POST /toggle    {key} 翻转布尔项（boards.* / archive.enabled /
 *                   lifecycle.enabled / scheduler.enabled）
 *
 * 开源红线：零硬编码路径。root 登记表存 state_path（默认 ~/.dsh/storages/
 * shoucang-panel.json，支持 ~ 展开），初始为空——root 由用户在面板里添加。
 * 写操作全部「备份先行」，注释与原格式按原文保留（toggle 只做行级替换）。
 */
import type { Context } from 'cordis';
export declare const name = "@dsh-external/shoucang-panel";
export declare const inject: readonly ["webServer", "systemPrompt", "commands"];
export interface Config {
    state_path: string;
    projectRoots: string;
}
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
    state_path: import("@deepseek-ai/schemastery").default<string, string>;
    projectRoots: import("@deepseek-ai/schemastery").default<string, string>;
}>, Schemastery.ObjectT<{
    state_path: import("@deepseek-ai/schemastery").default<string, string>;
    projectRoots: import("@deepseek-ai/schemastery").default<string, string>;
}>>;
export declare function applyPanel(ctx: Context, config: Config): void;
