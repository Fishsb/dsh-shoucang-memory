/* 本文件由 `scripts/gen-i18n-dict-index.mjs` 生成 —— **禁手改**。
 *
 * 接缝③（2026-09-17 圆桌会议 arch 成因 C 的结构性修法）：词表注册**按目录自动发现**。
 * 目录 5 份词表（cfg · memory · nav · pane-arch · pane-run）。
 *
 * 判因：原实现把「哪几份词表要注册」写成 `body.js` 里的**手写 import 列表** ⇒ 新增词表文件
 *   必须记得去改那一行，漏改的后果是**静默回落成中文**（不是报错）—— 实测因此漏了 3 份 / 700 键。
 *   现改为扫目录生成 ⇒ **新增文件无须改任何清单即生效**；
 *   生成物新鲜度由 `check-i18n-registered.mjs` 判（过期即红）。 */

import { EN as D0 } from './i18n-dict-cfg.js'
import { EN as D1 } from './i18n-dict-memory.js'
import { EN as D2 } from './i18n-dict-nav.js'
import { EN as D3 } from './i18n-dict-pane-arch.js'
import { EN as D4 } from './i18n-dict-pane-run.js'

/** 全部词表的英文值合并成一张（key = 中文原文） */
export var EN = Object.assign({}, D0, D1, D2, D3, D4)
