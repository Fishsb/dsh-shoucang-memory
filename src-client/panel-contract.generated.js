/**
 * 面板接口契约（**生成物 · 禁手写**）。
 * 源：src/panel-contract.ts；生成：node scripts/gen-panel-contract.mjs（已挂在 build:client 前置）。
 * 用途：客户端在**发请求前**预检必填字段，把"喂错数据"拦在本地，而不是等后端 400 一个来回。
 */
export const PANEL_CONTRACT = {
  "$comment": "生成物（npm run build:host && node scripts/gen-panel-contract.mjs）—— 勿手改；源 = src/panel-contract.ts",
  "plugin": "dsh-shoucang-memory",
  "prefix": "/api/shoucang-panel",
  "routeCount": 44,
  "routes": [
    {
      "path": "/roots",
      "summary": "已登记根目录列表",
      "required": [],
      "fields": null
    },
    {
      "path": "/get_root",
      "summary": "当前激活根目录",
      "required": [],
      "fields": null
    },
    {
      "path": "/root/bootstrap",
      "summary": "建单库骨架",
      "required": [],
      "fields": [
        {
          "name": "root",
          "type": "string",
          "optional": true
        },
        {
          "name": "path",
          "type": "string",
          "optional": true
        }
      ]
    },
    {
      "path": "/set_root",
      "summary": "切换/登记根目录",
      "required": [
        "path"
      ],
      "fields": [
        {
          "name": "path",
          "type": "string",
          "optional": false
        },
        {
          "name": "name",
          "type": "string",
          "optional": true
        }
      ]
    },
    {
      "path": "/config",
      "summary": "读配置原文",
      "required": [],
      "fields": null
    },
    {
      "path": "/save",
      "summary": "写配置原文",
      "required": [
        "text"
      ],
      "fields": [
        {
          "name": "text",
          "type": "string",
          "optional": false
        }
      ]
    },
    {
      "path": "/toggle",
      "summary": "翻转布尔键",
      "required": [
        "key"
      ],
      "fields": [
        {
          "name": "key",
          "type": "string",
          "optional": false
        }
      ]
    },
    {
      "path": "/set",
      "summary": "设置标量键",
      "required": [
        "key"
      ],
      "fields": [
        {
          "name": "key",
          "type": "string",
          "optional": false
        },
        {
          "name": "value",
          "type": "any",
          "optional": false
        }
      ]
    },
    {
      "path": "/memory/overview",
      "summary": "索引/容量/候选总览",
      "required": [],
      "fields": null
    },
    {
      "path": "/memory/sections",
      "summary": "索引小节列表",
      "required": [],
      "fields": null
    },
    {
      "path": "/suite",
      "summary": "suite 装配矩阵",
      "required": [],
      "fields": null
    },
    {
      "path": "/mcl/status",
      "summary": "认知环状态",
      "required": [],
      "fields": null
    },
    {
      "path": "/reconcile",
      "summary": "记忆对账",
      "required": [],
      "fields": null
    },
    {
      "path": "/maturation/scan",
      "summary": "成熟度扫描",
      "required": [],
      "fields": null
    },
    {
      "path": "/selfcheck",
      "summary": "自检结果",
      "required": [],
      "fields": null
    },
    {
      "path": "/selfcheck/run",
      "summary": "运行自检",
      "required": [],
      "fields": null
    },
    {
      "path": "/rings",
      "summary": "五环 KPI 与环事件对账",
      "required": [],
      "fields": null
    },
    {
      "path": "/config/recent",
      "summary": "近期配置变更",
      "required": [],
      "fields": null
    },
    {
      "path": "/criteria",
      "summary": "判据注册表 + 台账",
      "required": [],
      "fields": null
    },
    {
      "path": "/sleep/reports",
      "summary": "睡眠汇报列表（日历式留存：份数 · 段数 · 最近一份）",
      "required": [],
      "fields": null
    },
    {
      "path": "/sleep/issues",
      "summary": "睡眠问题统计（suspect-recall=召回面 / suspect-quality=记忆面）",
      "required": [],
      "fields": null
    },
    {
      "path": "/content-types",
      "summary": "内容类型契约：类型分布 · 可达性 · 通路接线",
      "required": [],
      "fields": null
    },
    {
      "path": "/cognition/report",
      "summary": "深睡回执/活性/归档",
      "required": [],
      "fields": null
    },
    {
      "path": "/llm/models",
      "summary": "模型清单",
      "required": [],
      "fields": null
    },
    {
      "path": "/deepsleep",
      "summary": "深睡状态",
      "required": [],
      "fields": null
    },
    {
      "path": "/deepsleep/trigger",
      "summary": "手动触发深睡",
      "required": [],
      "fields": null
    },
    {
      "path": "/distill/run",
      "summary": "手动触发蒸馏",
      "required": [],
      "fields": null
    },
    {
      "path": "/deepsleep/config",
      "summary": "深睡配置读写（白名单补丁）",
      "required": [],
      "fields": [
        {
          "name": "enableDeepSleep",
          "type": "any",
          "optional": true
        },
        {
          "name": "deepSleepProbe",
          "type": "any",
          "optional": true
        },
        {
          "name": "deepSleepIdleMs",
          "type": "any",
          "optional": true
        },
        {
          "name": "deepSleepProbeAfterMs",
          "type": "any",
          "optional": true
        },
        {
          "name": "deepSleepProbeWindowMs",
          "type": "any",
          "optional": true
        }
      ]
    },
    {
      "path": "/distill/config",
      "summary": "蒸馏配置读写（白名单补丁）",
      "required": [],
      "fields": [
        {
          "name": "enableDistill",
          "type": "any",
          "optional": true
        },
        {
          "name": "idleWakeMs",
          "type": "any",
          "optional": true
        },
        {
          "name": "minTurnChars",
          "type": "any",
          "optional": true
        },
        {
          "name": "distillPrescan",
          "type": "any",
          "optional": true
        },
        {
          "name": "llmProvider",
          "type": "any",
          "optional": true
        },
        {
          "name": "llmModel",
          "type": "any",
          "optional": true
        },
        {
          "name": "distillProvider",
          "type": "any",
          "optional": true
        },
        {
          "name": "distillModel",
          "type": "any",
          "optional": true
        },
        {
          "name": "sleepProvider",
          "type": "any",
          "optional": true
        },
        {
          "name": "sleepModel",
          "type": "any",
          "optional": true
        }
      ]
    },
    {
      "path": "/vector/status2",
      "summary": "向量档状态",
      "required": [],
      "fields": null
    },
    {
      "path": "/embed/config",
      "summary": "嵌入配置读写（白名单补丁）",
      "required": [],
      "fields": [
        {
          "name": "embedEnabled",
          "type": "any",
          "optional": true
        },
        {
          "name": "embedBaseUrl",
          "type": "any",
          "optional": true
        },
        {
          "name": "embedModel",
          "type": "any",
          "optional": true
        },
        {
          "name": "embedApiKeyEnv",
          "type": "any",
          "optional": true
        }
      ]
    },
    {
      "path": "/embed/test",
      "summary": "嵌入连通性测试",
      "required": [
        "baseUrl"
      ],
      "fields": [
        {
          "name": "baseUrl",
          "type": "string",
          "optional": true
        },
        {
          "name": "apiKey",
          "type": "string",
          "optional": true
        }
      ]
    },
    {
      "path": "/vector/cache/clear",
      "summary": "清向量缓存",
      "required": [
        "rel",
        "section"
      ],
      "fields": [
        {
          "name": "rel",
          "type": "string",
          "optional": false
        },
        {
          "name": "section",
          "type": "string",
          "optional": false
        },
        {
          "name": "newBody",
          "type": "string",
          "optional": true
        }
      ]
    },
    {
      "path": "/memory/section-edit",
      "summary": "改写小节正文",
      "required": [
        "rel",
        "section"
      ],
      "fields": [
        {
          "name": "rel",
          "type": "string",
          "optional": false
        },
        {
          "name": "section",
          "type": "string",
          "optional": false
        },
        {
          "name": "newBody",
          "type": "string",
          "optional": true
        }
      ]
    },
    {
      "path": "/memory/edit",
      "summary": "行级编辑",
      "required": [
        "file",
        "line",
        "newText"
      ],
      "fields": [
        {
          "name": "file",
          "type": "string",
          "optional": false
        },
        {
          "name": "line",
          "type": "string",
          "optional": false
        },
        {
          "name": "newText",
          "type": "string",
          "optional": false
        }
      ]
    },
    {
      "path": "/memory/remove",
      "summary": "行级删除",
      "required": [
        "file",
        "line"
      ],
      "fields": [
        {
          "name": "file",
          "type": "string",
          "optional": false
        },
        {
          "name": "line",
          "type": "string",
          "optional": false
        },
        {
          "name": "pendingFile",
          "type": "string",
          "optional": true
        }
      ]
    },
    {
      "path": "/memory/approve",
      "summary": "采纳/忽略候选（root 指定双根；action=approve|ignore 语义分离）",
      "required": [
        "pendingFile"
      ],
      "fields": [
        {
          "name": "pendingFile",
          "type": "string",
          "optional": false
        },
        {
          "name": "root",
          "type": "string",
          "optional": true
        },
        {
          "name": "action",
          "type": "string",
          "optional": true
        }
      ]
    },
    {
      "path": "/inject/preview",
      "summary": "热记忆注入预览",
      "required": [],
      "fields": null
    },
    {
      "path": "/inject/stats",
      "summary": "注入统计",
      "required": [],
      "fields": null
    },
    {
      "path": "/arch/records",
      "summary": "记录层：store 人口 · md↔store 逐载体对账 · 写时自证 · 跨文件同文 · 行寻址口径",
      "required": [],
      "fields": null
    },
    {
      "path": "/arch/graph",
      "summary": "断言图：节点/边/各 rel/悬空证据（纯计数，零向量）",
      "required": [],
      "fields": null
    },
    {
      "path": "/arch/observability",
      "summary": "观测面：统一台账实况（按 type 分布/信封完整性）· audit 目录 · legacy 流存否 · 族×域口径",
      "required": [],
      "fields": null
    },
    {
      "path": "/arch/assembly",
      "summary": "装配面：composition root 就绪度（桥=0）· 契约路由数 · 已装新架构模块盘点",
      "required": [],
      "fields": null
    },
    {
      "path": "/mcl/config",
      "summary": "认知环旋钮（白名单补丁：阈值/上限/预算/topK/P2b/REM）",
      "required": [],
      "fields": [
        {
          "name": "mclEnabled",
          "type": "any",
          "optional": true
        },
        {
          "name": "mclFamiliarThreshold",
          "type": "any",
          "optional": true
        },
        {
          "name": "mclMaxNudges",
          "type": "any",
          "optional": true
        },
        {
          "name": "mclBudgetChars",
          "type": "any",
          "optional": true
        },
        {
          "name": "mclTopK",
          "type": "any",
          "optional": true
        },
        {
          "name": "mclAudit",
          "type": "any",
          "optional": true
        },
        {
          "name": "mclMaterialInSystem",
          "type": "any",
          "optional": true
        },
        {
          "name": "enableRemPass",
          "type": "any",
          "optional": true
        }
      ]
    }
  ]
}

/** 按路径取契约（无契约返回 undefined） */
export function contractOf (path) {
  return PANEL_CONTRACT.routes.find((r) => r.path === path)
}
