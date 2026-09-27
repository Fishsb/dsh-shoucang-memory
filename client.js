"use strict";
(() => {
  // src-client/panel-contract.generated.js
  var PANEL_CONTRACT = {
    "$comment": "生成物（npm run build:host && node scripts/gen-panel-contract.mjs）—— 勿手改；源 = src/panel-contract.ts",
    "plugin": "dsh-shoucang-memory",
    "prefix": "/api/shoucang-panel",
    "routeCount": 47,
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
        "summary": "设置标量键（键集 = SET_SCALAR_KEYS，越界由服务端夹取或 400）",
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
            "name": "distillEffort",
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
          },
          {
            "name": "sleepEffort",
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
        "path": "/eval/config",
        "summary": "评估通道配置读写（白名单补丁）",
        "required": [],
        "fields": [
          {
            "name": "evalEnabled",
            "type": "any",
            "optional": true
          },
          {
            "name": "evalBaseUrl",
            "type": "any",
            "optional": true
          },
          {
            "name": "evalModel",
            "type": "any",
            "optional": true
          },
          {
            "name": "evalApiKeyEnv",
            "type": "any",
            "optional": true
          },
          {
            "name": "evalTier",
            "type": "any",
            "optional": true
          },
          {
            "name": "evalEgressAllow",
            "type": "any",
            "optional": true
          }
        ]
      },
      {
        "path": "/eval/test",
        "summary": "评估通道连通性测试（只读；不落库）",
        "required": [],
        "fields": null
      },
      {
        "path": "/eval/stats",
        "summary": "评估通道判定统计（只读；折统一台账 type=eval.decision）",
        "required": [],
        "fields": null
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
  };

  // src-client/contract-global.js
  if (typeof window !== "undefined") window.__SC_CONTRACT__ = PANEL_CONTRACT;

  // src-client/dom.js
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(paths) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", "18");
    s.setAttribute("height", "18");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.8");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    paths.split("|").forEach(function(d) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      s.appendChild(p);
    });
    return s;
  }
  var ICONS = {
    vault: "M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z",
    toggles: "M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M2 14h4|M10 8h4|M18 16h4",
    file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z|M14 3v5h5|M9 13h6|M9 17h6",
    persona: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21v-1a6 6 0 0 1 12 0v1",
    memory: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z|M9 8h6|M9 12h6|M9 16h4",
    overview: "M4 4h7v7H4z|M13 4h7v4h-7z|M13 10h7v10h-7z|M4 13h7v7H4z",
    suite: "M4 8l8-4 8 4-8 4-8-4z|M4 13l8 4 8-4|M4 18l8 4 8-4",
    sleep: "M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z",
    search: "M11 11l3.5 3.5|M12.5 7.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0z",
    observe: "M3 12h4l2.5-6 4 13L16 12h5",
    /* 架构视图图标（2026-09-13）：四象限网格 =「事实面 + 旋钮」。
     * ⚠ 教训：`VIEWS` 第 3 个元素是**这里的 key**；此前我编了个不存在的 `'arch'`
     *   ⇒ nav 渲染取到 `undefined` 后 `.split` 抛错 ⇒ **整个面板起不来**（真机 geo 报"无 shadowRoot"）。
     *   加视图 = 必须同时补图标：否则不是"少个图标"，而是**整页白屏**。 */
    arch: "M4 4h6v6H4z|M14 4h6v6h-6z|M4 14h6v6H4z|M14 14h6v6h-6z",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
  };

  // src-client/i18n.js
  var NS = "shoucang";
  var S = /* @__PURE__ */ (function() {
    return {
      lang: "zh",
      // 当前语言 id
      bound: null,
      // 绑定后的翻译函数（仅非 zh 态非 null）
      attached: false
      // 是否已接入宿主 locale 服务
    };
  })();
  function missBag() {
    if (typeof window === "undefined") return null;
    if (!window.__SC_I18N_MISS__) window.__SC_I18N_MISS__ = [];
    return window.__SC_I18N_MISS__;
  }
  function noteMiss(key) {
    var bag = missBag();
    if (!bag) return;
    if (bag.indexOf(key) === -1) bag.push(key);
  }
  function tr(key, zh, params) {
    var source = zh === void 0 ? key : zh;
    if (S.bound === null) return source;
    var s;
    try {
      s = S.bound(key, params);
    } catch (e) {
      return source;
    }
    if (s === void 0 || s === null || s === "") {
      noteMiss(key);
      return source;
    }
    if (s === key) {
      noteMiss(key);
      return source;
    }
    return s;
  }
  function lang() {
    return S.lang;
  }
  function applyLang(loc) {
    var next = "zh";
    if (loc && typeof loc.getLocale === "function") {
      try {
        var snap = loc.getLocale();
        if (snap && typeof snap.active === "string") next = snap.active;
      } catch (e) {
        next = "zh";
      }
    }
    if (next === S.lang) return false;
    S.lang = next;
    S.bound = loc && next !== "zh" && typeof loc.bind === "function" ? loc.bind(NS) : null;
    return true;
  }
  function registerDicts(loc, dicts) {
    var offs = [];
    try {
      if (dicts.zh) offs.push(loc.register(NS, "zh", dicts.zh));
      if (dicts.en) offs.push(loc.register(NS, "en", dicts.en));
    } catch (e) {
      return null;
    }
    return function() {
      offs.forEach(function(off) {
        try {
          off();
        } catch (e) {
        }
      });
    };
  }
  function attachLocale(ctx, dicts, hooks) {
    var h = hooks || {};
    var loc = null;
    try {
      loc = ctx && typeof ctx.get === "function" ? ctx.get("locale") : null;
    } catch (e) {
      loc = null;
    }
    if (loc) {
      S.attached = true;
      if (h.effect && typeof loc.subscribe === "function") {
        h.effect(function() {
          var offSub = loc.subscribe(function() {
            if (applyLang(loc) && h.onChange) h.onChange();
          });
          var offReg = registerDicts(loc, dicts);
          return function() {
            try {
              offSub();
            } catch (e) {
            }
            if (offReg) offReg();
          };
        });
      } else {
        registerDicts(loc, dicts);
      }
      applyLang(loc);
      return true;
    }
    try {
      if (ctx && typeof ctx.inject === "function") {
        ctx.inject(["locale"], function(scoped) {
          var s = scoped && scoped.locale ? scoped.locale : null;
          if (!s) return;
          S.attached = true;
          if (h.effect && typeof s.subscribe === "function") {
            h.effect(function() {
              var offSub = s.subscribe(function() {
                if (applyLang(s) && h.onChange) h.onChange();
              });
              var offReg = registerDicts(s, dicts);
              return function() {
                try {
                  offSub();
                } catch (e) {
                }
                ;
                if (offReg) offReg();
              };
            });
          } else {
            registerDicts(s, dicts);
          }
          if (applyLang(s) && h.onChange) h.onChange();
        });
        return true;
      }
    } catch (e) {
    }
    S.lang = "zh";
    S.bound = null;
    return false;
  }

  // src-client/state.js
  var Bus = /* @__PURE__ */ (function() {
    var m = {};
    return {
      on: function(k, fn) {
        (m[k] = m[k] || []).push(fn);
        return function() {
          m[k] = (m[k] || []).filter(function(f) {
            return f !== fn;
          });
        };
      },
      emit: function(k, p) {
        (m[k] || []).slice().forEach(function(f) {
          try {
            f(p);
          } catch (e) {
          }
        });
      }
    };
  })();
  var Store = /* @__PURE__ */ (function() {
    var s = { view: "file", logs: [], progress: {}, metrics: {}, errors: [] };
    var subs = [];
    return {
      get: function(k) {
        return k === void 0 ? s : s[k];
      },
      set: function(k, v) {
        var old = s[k];
        if (old === v) return v;
        s[k] = v;
        subs.forEach(function(f) {
          try {
            f(k, v, old);
          } catch (e) {
          }
        });
        Bus.emit("store:" + k, v);
        return v;
      },
      patch: function(k, o) {
        var base = typeof s[k] === "object" && s[k] ? s[k] : {};
        var next = Object.assign({}, base, o || {});
        return Store.set(k, next);
      },
      sub: function(fn) {
        subs.push(fn);
        return function() {
          subs = subs.filter(function(f) {
            return f !== fn;
          });
        };
      }
    };
  })();
  var statusSinkBox = /* @__PURE__ */ (function() {
    var fn = null;
    return { set: function(f) {
      fn = f;
    }, get: function() {
      return fn;
    } };
  })();
  var setLogStatusSink = statusSinkBox.set;
  var Log = /* @__PURE__ */ (function() {
    var MAX = 500;
    function add(level, msg, ctx) {
      var e = { t: Date.now(), level: level || "info", msg: String(msg), ctx: ctx || null };
      var a = (Store.get("logs") || []).concat([e]);
      if (a.length > MAX) a = a.slice(a.length - MAX);
      Store.set("logs", a);
      Bus.emit("log", e);
      if (level === "error") {
        var _s = statusSinkBox.get();
        if (_s) _s(msg, "error");
      }
      return e;
    }
    return {
      add,
      info: function(m, c) {
        return add("info", m, c);
      },
      warn: function(m, c) {
        return add("warn", m, c);
      },
      error: function(m, c) {
        return add("error", m, c);
      },
      clear: function() {
        Store.set("logs", []);
        Bus.emit("log", null);
      }
    };
  })();
  var Prog = {
    start: function(id, label) {
      Store.patch("progress", Object.assign({}, Store.get("progress"), make(id, { id, label: label || "", pct: 0, note: tr("进行中"), on: true })));
      Bus.emit("progress", Store.get("progress"));
    },
    set: function(id, pct, note) {
      var cur = (Store.get("progress") || {})[id];
      if (!cur) return;
      Store.patch("progress", Object.assign({}, Store.get("progress"), make(id, Object.assign({}, cur, { pct: Math.max(0, Math.min(100, pct || 0)), note: note || cur.note }))));
      Bus.emit("progress", Store.get("progress"));
    },
    done: function(id, ok, msg) {
      var cur = (Store.get("progress") || {})[id];
      if (!cur) return;
      var p = Object.assign({}, Store.get("progress"));
      p[id] = Object.assign({}, cur, { on: false, pct: 100, note: msg || (ok ? tr("完成") : tr("失败")), ok: ok !== false });
      Store.set("progress", p);
      Bus.emit("progress", p);
      var self = this;
      setTimeout(function() {
        var q = Object.assign({}, Store.get("progress"));
        delete q[id];
        Store.set("progress", q);
        Bus.emit("progress", q);
      }, ok === false ? 6e3 : 1800);
    }
  };
  var Cfg = /* @__PURE__ */ (function() {
    var KEY = "shoucang.ui.cfg.v1";
    var DEF = {
      density: "comfortable",
      // comfortable | compact
      navWidth: 216,
      // 左导航宽度 px（v9 对齐：方案 --nav-w 216）
      autoRefresh: true,
      // 打开面板/写操作后自动刷新
      refreshMs: 6e4,
      // 轮询间隔（0=关闭）
      showLogs: false,
      // 状态栏上方是否显示日志面板（v9 对齐：默认折叠，Ctrl/⌘+Shift+L 唤出）
      logLevel: "info",
      // info | warn | error
      overviewMode: true,
      // 概览—详情分层（列表默认折叠详情）
      maxRows: 50,
      // 长列表默认折叠阈值
      startView: "overview",
      // 启动时视图（深链 > 上次视图 > 此项）
      navGroups: true,
      // 导航分组显示（v9 设置页该行：按语义显示分组标题）
      footBar: true,
      // 页脚健康条（v9 设置页该行：常驻显示记忆库状态与库路径）
      skin: "v9"
      // 皮肤：v9（方案调色板）| host（跟随宿主主题令牌）
    };
    var cache = null;
    function load() {
      if (cache) return cache;
      cache = Object.assign({}, DEF);
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) {
          var o = JSON.parse(raw);
          if (o && typeof o === "object") cache = Object.assign(cache, o);
        }
      } catch (e) {
      }
      return cache;
    }
    return {
      get: function(k, d) {
        var c = load();
        return k === void 0 ? c : c[k] !== void 0 ? c[k] : d;
      },
      set: function(k, v) {
        var c = load();
        c[k] = v;
        cache = c;
        try {
          localStorage.setItem(KEY, JSON.stringify(c));
        } catch (e) {
        }
        Bus.emit("cfg:" + k, v);
        return v;
      },
      reset: function() {
        cache = Object.assign({}, DEF);
        try {
          localStorage.removeItem(KEY);
        } catch (e) {
        }
        Bus.emit("cfg", cache);
        return cache;
      },
      defs: function() {
        return Object.assign({}, DEF);
      }
    };
  })();
  var Fold = /* @__PURE__ */ (function() {
    var m = {};
    var hasOwn = Object.prototype.hasOwnProperty;
    function norm(k) {
      return String(k === void 0 || k === null ? "" : k);
    }
    return {
      /* 读：未登记 ⇒ 用调用方给的默认值（默认值不入库，各处可各自定义缺省） */
      get: function(key, dflt) {
        var s = norm(key);
        return hasOwn.call(m, s) ? m[s] : !!dflt;
      },
      /* 写：同值不广播（避免 paint↔set 回环） */
      set: function(key, v) {
        var s = norm(key), next = !!v;
        if (hasOwn.call(m, s) && m[s] === next) return next;
        m[s] = next;
        Bus.emit("fold", { key: s, open: next });
        return next;
      },
      toggle: function(key, dflt) {
        return Fold.set(key, !Fold.get(key, dflt));
      },
      /* 清空：按前缀或全清。切视图 / 换数据源时调用，防止旧 key 的状态残留到新数据上。 */
      clear: function(prefix) {
        var p = prefix === void 0 || prefix === null ? null : String(prefix);
        var hit = Object.keys(m).filter(function(s) {
          return p === null || s.indexOf(p) === 0;
        });
        hit.forEach(function(s) {
          delete m[s];
        });
        if (hit.length) Bus.emit("fold:clear", { prefix: p, keys: hit });
        return hit.length;
      },
      keys: function() {
        return Object.keys(m);
      },
      size: function() {
        return Object.keys(m).length;
      },
      _raw: function() {
        return m;
      }
    };
  })();

  // src-client/app-state.js
  var appState = {
    /** RPC 句柄（`api()`）——由入口在启动时注入。**pane 模块经它取**，而不是各自 import `api.js`
     *  （那会让"谁都能 import 全局服务"，且 pane 与入口的依赖方向变乱）。 */
    api: null,
    /** 状态栏写入器（`status()`）——pane 模块经它报状态，而非 import 全局。 */
    statusFn: null,
    /** 错误定位器（`fail()`）。 */
    failFn: null,
    /** 当前视图重绘器（`refreshCurrentView()`）——pane 改配置后触发刷新。 */
    refreshView: null,
    /** DOM 句柄表（`refs`）——**可变**,UI1/C′ 原则：可变句柄统一在本容器。 */
    refs: null,
    /** 视图注册表（`VIEWS`）——设置页需按视图名跳转/遍历。**只读**语义。 */
    views: null,
    /** 数值格式化（`dsNumber`）。 */
    dsNumber: null,
    /** 深睡/运行附加块渲染器（`renderRunExtras`）——运行观测视图调用。 */
    renderRunExtras: null,
    /** 日志面板应用器（`applyLogPanel`）。 */
    applyLogPanel: null,
    /** 带上下文标签的 RPC 包装（`apiCtx`）——总览卡片用它报错定位。 */
    apiCtx: null,
    /** 操作卡构造器（`opCard`）——总览/观测视图的进度卡。 */
    opCard: null,
    /** 当前视图名（`show()` 维护；`refreshCurrentView` 读） */
    currentView: null,
    /** 轮询定时器句柄（`restartPolling` 写；`0`/`null` 表示未启动） */
    pollTimer: null,
    /** 契约按路径索引（`contractOf` 惰性构建的缓存；未构建为 `null`） */
    contractByPath: null,
    /** 折叠哨兵队列（`deferFold` 入队 / `flushFolds` 取出清空） */
    foldQueue: [],
    /** 记忆视图滚动位置（`renderMemoryExpanded` 与 note 之间传递） */
    memoryViewScroll: 0,
    /** 从 note 返回时的重绘函数（`openMemoryNote` 写 / 返回时读） */
    noteReturnRender: null,
    /** 侧栏挂载用的 DOM 观察者 */
    sidebarObserver: null,
    /** 侧栏挂载重试计数 */
    sidebarTries: 0,
    /** 插槽注册返回的 React 句柄 */
    slotReact: null,
    /* ── 接缝②（2026-09-17 阶段 3）：以下 7 个字段原为「**注入但无声明行**」──
     *  它们是 `body.js` 注入、被 pane 消费的跨模块句柄，却不在本容器声明。
     *  实测（施工期）：app-state 声明 20 / body.js 注入 24 ⇒ **7 个无声明行**。
     *  后果：契约面**不完整** —— 读者按本文件无法知道存在这些句柄，且拼错字段名
     *  （消费 `appState.xxx` 而无人注入）**静默为 undefined**，无任何门禁判它错。
     *  现补齐声明；并新增 `scripts/check-appstate-contract.mjs` 做**四方对账**
     *  （声明 / body 注入 / pane 写 / 全仓消费）—— 任一方出现契约外字段即红。 */
    /** 视图切换器（`show()`）——pane 需按视图名跳转。 */
    show: null,
    /** 开关变更处理器集合（`switchKeys`）——设置/参数页写配置后按 key 派发。 */
    switchKeys: null,
    /** 配置行折叠器（`makeToggle`）——设置页与参数页共用的开关行构造。 */
    makeToggle: null,
    /** 控件元数据徽标构造器（`metaBadges`）——设置行「作用域/生效态」徽标。 */
    metaBadges: null,
    /** 视图行过滤器（`filterViewRows`）——页首搜索框消费。 */
    filterViewRows: null,
    /** 折叠延迟入队（`deferFold`）——渲染期延后折叠，避免强制重排。 */
    deferFold: null,
    /** 折叠队列冲刷（`flushFolds`）——与 `deferFold`/`foldQueue` 配套。 */
    flushFolds: null,
    /** 小节正文渲染器（`renderNoteSections`）—— **为破环而注入**（2026-09-17 阶段 5）：
     *  `panes-memory.js` 原直接 import 它，与 `panes-memory-detail.js` 构成双向环；
     *  改由 `body.js` 注入 ⇒ 依赖单向（detail → memory）。 */
    renderNoteSections: null
  };

  // src-client/host-ui.js
  var S2 = {
    /** 模块加载器给出的 require（由 body.js 启动时注入）。 */
    requireFn: null,
    /** 宿主模块缓存：undefined = 未探测，null = 探测过但拿不到。 */
    react: void 0,
    reactDomClient: void 0,
    primitives: void 0,
    probed: false
  };
  function setRequire(fn) {
    S2.requireFn = typeof fn === "function" ? fn : null;
  }
  function tryRequire(name) {
    if (!S2.requireFn) return null;
    try {
      return S2.requireFn(name);
    } catch (e) {
      return null;
    }
  }
  function probe() {
    if (S2.probed) return;
    S2.probed = true;
    S2.react = tryRequire("react");
    S2.reactDomClient = tryRequire("react-dom/client");
    S2.primitives = tryRequire("@deepseek-ai/dsh-client-ui-primitives");
  }
  function hostPrimitives() {
    probe();
    return S2.primitives || null;
  }
  function hostComponent(name) {
    const p = hostPrimitives();
    return p && typeof p[name] === "function" ? p[name] : null;
  }
  function reactEl() {
    probe();
    return S2.react && S2.react.createElement || null;
  }
  function mountReact(container, renderFn) {
    probe();
    if (!container || !S2.react || !S2.reactDomClient || !S2.reactDomClient.createRoot) return null;
    let root;
    try {
      root = S2.reactDomClient.createRoot(container);
    } catch (e) {
      return null;
    }
    const update = function() {
      try {
        root.render(renderFn());
      } catch (e) {
      }
    };
    update();
    return {
      update,
      unmount: function() {
        try {
          root.unmount();
        } catch (e) {
        }
      }
    };
  }

  // src-client/ui-kit.js
  var headEpoch = 0;
  var headUsed = -1;
  var UI = {
    /** 渲染层每轮调用：允许本轮写入一次页头（原 `headEpoch++` 的等价物）。
     *  ⚠ **必须写在对象字面量里**，不得事后 `UI.bumpHeadEpoch = …` 赋值 ——
     *  `check-ui-contract` ②b 从 UI 对象的**花括号切片**取成员名单，赋值式添加它扫不到
     *  （实测因此报「UI 成员缺失：bumpHeadEpoch」—— 而该护栏的语义正是"渲染时会抛 TypeError"）。 */
    bumpHeadEpoch: function() {
      headEpoch++;
    },
    /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item） */
    /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item）。
    * opts:
    *   cls          —— 附加类名
    *   children     —— 数组，追加为 row 的平级子节点（如徽标 + 控件）
    *
    * ⚠ 开关收敛（接缝① · 2026-09-17 阶段 2c）：原设计有 **四开关**（文件自陈「三处三种形态」）——
    *   extra（挂进 .setting-item-info **内**）与 children（挂 row **平级**）让**同一语义**
    *   （作用域徽标）落在两处 ⇒ 实测徽标左边界在设置页与参数页**相差 612px**（898 vs 286）。
    *   现只留 children：行形状**唯一** —— [info] [children…]，次序与内容由调用方决定。
    *   （extra 唯一使用点 panes-settings.js 已改；wrapControl 随之无消费者，一并删除。） */
    item: function(name, desc, control, opts) {
      var o = opts || {};
      var row = el("div", "setting-item" + (o.cls ? " " + o.cls : ""));
      var info = el("div", "setting-item-info");
      if (name) info.appendChild(el("div", "setting-item-name", name));
      if (desc) info.appendChild(el("div", "setting-item-desc", desc));
      row.appendChild(info);
      if (control) {
        var c = el("div", "setting-item-control");
        c.appendChild(control);
        row.appendChild(c);
      }
      (o.children || []).forEach(function(n) {
        if (n) row.appendChild(n);
      });
      return row;
    },
    /* 开关：单一实现 = input.checkbox-container（与 makeToggle / 蒸馏 / 向量三处直建写法同源）。
     * 旧实现返回 label 包裹 input —— 内侧原生 checkbox 未被隐藏，胶囊上叠了一个系统勾选框，
     * 与其它三处的开关形态不一致（U4 统一控件规范修复）。 */
    /* 开关（S3：手写 checkbox → 组件库 <wa-switch>）。
     * 契约读自 switch.d.ts：`checked` 属性 + `change` 事件；parts switch/control/thumb/label。
     * 旧实现挂的 .checkbox-container 类随之退役（对应 CSS 规则已删，避免死规则）。 */
    toggle: function(checked, onChange, label) {
      var HS = hostComponent("Switch"), h = reactEl();
      if (HS && h) {
        var box = el("span", "sc-host-switch");
        var cur = !!checked;
        var m = mountReact(box, function() {
          return h(HS, {
            checked: cur,
            label: label || "",
            onChange: function(next) {
              cur = !!next;
              onChange(!!next);
              m && m.update();
            }
          });
        });
        if (m) return box;
      }
      var sw = el("input", "checkbox-container");
      sw.type = "checkbox";
      sw.checked = !!checked;
      if (label) sw.setAttribute("aria-label", label);
      sw.addEventListener("change", function() {
        onChange(!!sw.checked);
      });
      return sw;
    },
    /* ── 卡片原语（v9 对齐 · 补上缺失的「卡片层」）──
     * v9 的层级是 页头 → **卡片(.card：卡头 + 卡体)** → 卡内小节 → 行；
     * 面板此前是「分节标题 + 平铺卡片」，整页少一层容器 ⇒ 多板块读起来是散块而非分组。
     * opts: { sub } 卡头副文本；{ right } 卡头右侧节点（数组或单节点，v9 放路由 chip / pill）。
     * 返回 { box, head, body }：**后续内容 append 到 body**（= v9 的 .card > .bd）。 */
    card: function(title, opts) {
      var o = opts || {};
      var box = el("div", "sc-card");
      var head = null;
      if (title) {
        head = el("div", "sc-card-hd");
        head.appendChild(el("span", null, title));
        if (o.sub) head.appendChild(el("span", "sub", o.sub));
        if (o.right) {
          var r = el("div", "right");
          (Array.isArray(o.right) ? o.right : [o.right]).forEach(function(n) {
            if (n) r.appendChild(n);
          });
          head.appendChild(r);
        }
        box.appendChild(head);
      }
      var body = el("div", "sc-card-bd");
      box.appendChild(body);
      return { box, head, body };
    },
    /* 卡进 Tab 面板（v9 §7）：原型的每个 Tab 内是**一张卡**（div.card.plain，卡体直接含设置行），
     * 面板此前是裸行平铺 ⇒ 少一层容器。返回卡体，调用方直接 appendChild 设置行。 */
    cardIn: function(pane, opts) {
      var c = UI.card(null, opts);
      if (pane) pane.appendChild(c.box);
      return c.body;
    },
    /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 sc-h1 / sc-desc）。
     * v9 对齐：页头挂在固定槽 #scpanl-headslot（**不随内容滚动**），渲染时自清上一次的页头；
     * 槽不可用时（老结构/单测夹具）回退为返回游离节点，调用方 appendChild 仍可用。 */
    pageHead: function(title, desc, opts) {
      var o = opts || {};
      var box = el("div", "sc-pagehead");
      var main = el("div", "sc-ph-main");
      main.appendChild(el("h2", "sc-h1", title));
      var descEl = null;
      if (desc) {
        descEl = el("div", "sc-desc", desc);
        main.appendChild(descEl);
      }
      if (o.routes && o.routes.length) {
        if (o.routesInline && descEl) {
          o.routes.forEach(function(r) {
            descEl.appendChild(el("span", "sc-src", r));
          });
        } else {
          var row = el("div", "sc-routes");
          o.routes.forEach(function(r) {
            row.appendChild(el("span", "sc-src", r));
          });
          main.appendChild(row);
        }
      }
      box.appendChild(main);
      var acts = el("div", "sc-ph-acts");
      if (o.search) {
        var srch = el("label", "sc-srch");
        srch.appendChild(svg(ICONS.search));
        var inp = document.createElement("input");
        inp.type = "search";
        inp.placeholder = o.search.placeholder || tr("过滤…");
        inp.setAttribute("aria-label", o.search.placeholder || tr("过滤"));
        inp.oninput = function() {
          if (o.search.onInput) o.search.onInput(String(inp.value || "").trim());
        };
        srch.appendChild(inp);
        acts.appendChild(srch);
      }
      if (o.refresh) {
        acts.appendChild(UI.button(tr("刷新"), function() {
          appState.refreshView();
          appState.statusFn(tr("已重新取数"));
        }, { title: tr("重新取数并重绘本页") }));
      }
      (o.actions || []).forEach(function(n) {
        if (n) acts.appendChild(n);
      });
      if (acts.children.length) box.appendChild(acts);
      var slot = document.getElementById("scpanl-headslot");
      if (slot) {
        if (headUsed === headEpoch) return box;
        slot.textContent = "";
        slot.appendChild(box);
        headUsed = headEpoch;
      }
      return box;
    },
    /* 文本/数字输入 */
    input: function(value, onChange, opts) {
      var o = opts || {};
      var i = document.createElement("input");
      i.type = o.type || "text";
      i.value = value === void 0 || value === null ? "" : String(value);
      if (o.placeholder) i.placeholder = o.placeholder;
      if (o.ariaLabel) i.setAttribute("aria-label", o.ariaLabel);
      if (o.width) i.style.setProperty("--sc-in-w", o.width);
      if (o.onEnter) i.onkeydown = function(e) {
        if (e.key === "Enter") o.onEnter(i.value);
      };
      else if (onChange) i.onchange = function() {
        onChange(i.value);
      };
      return i;
    },
    /* 下拉 */
    /* 下拉：**原生 <select>**（S3 二度回滚 · 2026-09-13）。
     * 两次尝试 <wa-select> 均判退化，判因（第二次是**视觉复核+像素穷举**给出的，不是自评）：
     *   ① **箭头没画出来**——shadow DOM 里确实有 <wa-icon> 元素，但**渲染尺寸为 0**（像素扫描：文字右侧全空）。
     *      注意教训：我当时的断言只验「元素存在」，于是**假绿**；必须验**渲染尺寸**（bbox > 0）。
     *   ② ::part(combobox) 填充未生效（实测填充 = 卡片底色，与同排数字输入"一亮一暗"）。
     *   ③ 宽度失控：控件 173px vs 原 ~66px，左缘与同排输入不再对齐。
     * 结论：WA select 的采用**前置未真正满足**（图标 registry 注册了但图标没渲染出来）。原生 select 三项都对，
     * 故回滚；要再采用，先把「图标真能渲染」用**渲染尺寸断言**证明，再谈替换。 */
    select: function(options, value, onChange, ariaLabel) {
      var s = document.createElement("select");
      if (ariaLabel) s.setAttribute("aria-label", ariaLabel);
      (options || []).forEach(function(op) {
        var o = document.createElement("option");
        o.value = String(op.value);
        o.textContent = op.label;
        if (String(op.value) === String(value)) o.selected = true;
        s.appendChild(o);
      });
      s.onchange = function() {
        onChange(s.value);
      };
      return s;
    },
    /* 按钮 */
    /* 按钮（S3：组件库 <wa-button>，2026-09-13 前置条件达成后**重做**）。
     * 上一轮曾因观感退化回滚，根因是**没有接管 WA 的尺寸层**（其字号由 --wa-font-size-scale 派生，
     *   默认 1rem=16px ⇒ 按钮 35–43px、品牌蓝）。本轮先做了尺寸层接管（font-size-scale .78 / space-scale .375 /
     *   radius-scale 1）并**实测**：xs 27px / **s 30px** / m 34px / l 43px（字号 10/11/12.48/16px）
     *   ⇒ 选 size="s" 与手写实现（30px）等高，观感一致。
     * 契约读自 webawesome button.d.ts：variant neutral|brand|danger、appearance filled|outlined、size、loading、pill。
     * API 与行为完全保留（text/onClick/{primary,danger,title,confirm,async,busyText,okText}）⇒ 13 个调用点零改动。 */
    button: function(text, onClick, opts) {
      var o = opts || {};
      var HB = hostComponent("Button"), h = reactEl();
      var b = null, hostMode = false, m = null, curDis = false, curText = text;
      if (HB && h) {
        var box = el("span", "sc-host-btn");
        hostMode = true;
        m = mountReact(box, function() {
          return h(HB, {
            variant: o.primary ? "primary" : o.danger ? "outline" : "ghost",
            size: "sm",
            className: o.pill ? "sc-pill" : "",
            disabled: curDis,
            title: o.title || "",
            onClick: handleClick
          }, curText);
        });
        if (m) b = box;
      }
      if (!hostMode) {
        b = el("button", "sc-btn" + (o.primary ? " sc-btn-primary" : ""));
        b.type = "button";
        if (o.title) b.title = o.title;
        b.textContent = text;
        b.onclick = handleClick;
      }
      function handleClick() {
        if (o.confirm && !confirm(o.confirm)) return;
        if (!o.async) {
          try {
            onClick();
          } catch (e) {
            appState.failFn(e);
          }
          return;
        }
        setDisabled(true, o.busyText || null);
        Promise.resolve().then(onClick).then(function(r) {
          Log.info(o.okText || text + tr(" 完成"));
          return r;
        }).catch(appState.failFn).then(function() {
          setDisabled(false, null);
        });
      }
      function setDisabled(d, busyText) {
        curDis = !!d;
        if (busyText != null) curText = busyText;
        else curText = text;
        if (hostMode) {
          if (m) m.update();
        } else {
          b.disabled = curDis;
          if (curDis) b.setAttribute("loading", "");
          else b.removeAttribute("loading");
          b.textContent = curText;
        }
      }
      return b;
    },
    /* 徽标 */
    badge: function(text, kind) {
      var b = el("span", "sc-badge" + (kind ? " sc-badge-" + kind : ""), text);
      return b;
    },
    /* 状态徽标（sc-ds-badge：圆点 + 文本）—— 后台进程状态行的**唯一构造入口**。
     * 此前 10 处各写三行「建 div → 塞 dot → 塞文本」，其中 3 枚还要异步回填，
     * 靠 `querySelectorAll('span')[1]` 按 DOM 位置取文本节点（改结构即断）。
     * 现返回句柄：setText/setKind 直接持有节点引用，不再依赖位置。 */
    dsBadge: function(text, kind) {
      var box = el("div", "sc-ds-badge" + (kind ? " " + kind : ""));
      box.appendChild(el("span", "dot"));
      var t = el("span", null, "");
      box.appendChild(t);
      function render(s) {
        t.textContent = "";
        var str = String(s === void 0 || s === null ? "" : s);
        var m = /^(.*?)([^\s]*\d[^\s]*)\s*$/.exec(str);
        if (m && m[1]) {
          t.appendChild(document.createTextNode(m[1]));
          t.appendChild(el("b", null, m[2]));
        } else {
          t.textContent = str;
        }
      }
      var h = {
        box,
        setText: function(s) {
          render(s);
          return h;
        },
        setKind: function(k) {
          box.className = "sc-ds-badge" + (k ? " " + k : "");
          return h;
        },
        setTitle: function(s) {
          box.title = s;
          return h;
        }
      };
      render(text);
      return h;
    },
    /* ── 折叠原语：展开/收起的**唯一实现**（collapsible / more / 小节树全部经它） ──
     * 关键差异（对比旧实现）：状态存在 Fold 里而不是 DOM class 或闭包变量，
     *   ⇒ ① 重绘 / 编程改动不会失同步 ② 嵌套项各用各的 key，互不影响
     *     ③ 初始态「先画后插」，无「先展开再收起」的抖动 ④ 支持 disabled / 空数据 / 异步中。
     * opts:
     *   key       必填（缺省用 'fold:'+title）。稳定键；换数据源时用 Fold.clear(前缀) 清残
     *   variant   'card'（默认 .sc-fold 卡片） | 'more'（.sc-more-btn 行式，两个平级节点）
     *   title/summary  card 变体；label = more 变体收起态文案（展开态统一「收起 ▴」）
     *   open      默认展开（仅未登记时生效，之后以 Fold 中登记值为准）
     *   disabled  禁用：不响应点击 + aria-disabled（CSS 的 [aria-disabled] 已负责降透明度）
     *   emptyText seal() 时 body 为空则补此占位；传 false 关闭该行为
     * 返回控件：{ box, head, body, nodes, open(), setOpen(v), sync(), busy(v), seal(), appendTo(host) } */
    fold: function(opts) {
      var o = opts || {};
      var isMore = o.variant === "more";
      var dflt = !!o.open;
      var label = o.label || tr("展开");
      var nodes = [];
      var box = isMore ? null : el("div", "sc-fold");
      var head = isMore ? el("button", "sc-more-btn") : el("div", "sc-fold-head");
      if (isMore) head.type = "button";
      var arrow = isMore ? null : el("span", "sc-fold-arrow");
      var body = isMore ? el("div", "sc-more-body") : el("div", "sc-fold-body");
      if (isMore) {
        nodes.push(head, body);
      } else {
        head.appendChild(arrow);
        head.appendChild(el("span", null, o.title || ""));
        if (o.summary) head.appendChild(el("span", "sc-fold-summary", o.summary));
        box.appendChild(head);
        box.appendChild(body);
        nodes.push(box);
      }
      var ctl = { box, head, body, nodes, key: String(o.key) };
      function current() {
        return Fold.get(o.key, dflt);
      }
      function paint(open) {
        if (isMore) {
          body.classList.toggle("sc-hidden", !open);
          head.textContent = open ? tr("收起 ▴") : label + " ▾";
        } else {
          box.classList.toggle("open", open);
          arrow.textContent = open ? "▾" : "▸";
        }
        head.setAttribute("aria-expanded", open ? "true" : "false");
      }
      ctl.isOpen = current;
      ctl.setOpen = function(v) {
        paint(Fold.set(o.key, v));
        return ctl;
      };
      ctl.sync = function() {
        paint(current());
        return ctl;
      };
      ctl.busy = function(v) {
        body.classList.toggle("sc-loading", !!v);
        return ctl;
      };
      ctl.empty = function() {
        return body.childNodes.length === 0;
      };
      ctl.seal = function() {
        if (ctl.empty() && o.emptyText !== false) {
          body.appendChild(el("div", "sc-mem-empty", o.emptyText || tr("（无内容）")));
        }
        return ctl;
      };
      ctl.appendTo = function(host) {
        nodes.forEach(function(n) {
          host.appendChild(n);
        });
        return ctl;
      };
      function act() {
        if (o.disabled) return;
        paint(Fold.toggle(o.key, dflt));
      }
      head.onclick = act;
      if (!isMore) {
        head.setAttribute("role", "button");
        head.setAttribute("tabindex", "0");
        head.onkeydown = function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            act();
          }
        };
      }
      if (o.disabled) head.setAttribute("aria-disabled", "true");
      paint(current());
      var everMounted = false;
      function alive() {
        var any = nodes.some(function(n) {
          return n.isConnected === true;
        });
        if (any) {
          everMounted = true;
          return true;
        }
        return !everMounted;
      }
      function unsubscribe() {
        off1();
        off2();
      }
      var off1 = Bus.on("fold", function(p) {
        if (!alive()) {
          unsubscribe();
          return;
        }
        if (p && p.key === ctl.key) ctl.sync();
      });
      var off2 = Bus.on("fold:clear", function() {
        if (!alive()) {
          unsubscribe();
          return;
        }
        ctl.sync();
      });
      return ctl;
    },
    /* 分段 Tab（P2）：一次只面对一组。选中态存 Cfg（重绘后保持）；**绝不触碰 Fold** ——
     * 折叠态的生命周期边界只有「换视图」（L3096），Tab 切换只切 .sc-hidden。 */
    /* 分段 Tab（S3：改用组件库 <wa-tab-group>，不再手写 tab 逻辑与样式）。
     * 契约（读自 webawesome tab-group.d.ts）：<wa-tab slot="nav" panel=ID> + <wa-tab-panel name=ID>；
     *   active 属性设初始态；wa-tab-show 事件回写 Cfg ⇒ 选中态持久化与旧实现等价；parts: nav/tabs/body。
     * 返回句柄与旧实现**完全一致**（{ box, select(id), pane(id) }），故调用点零改动、可随时回滚。 */
    collapsible: function(title, bodyNode, opts) {
      var o = opts || {};
      var f = UI.fold({
        key: o.key || "fold:" + title,
        variant: "card",
        title,
        summary: o.summary,
        open: o.open,
        disabled: o.disabled,
        emptyText: o.emptyText
      });
      if (bodyNode) f.body.appendChild(bodyNode);
      return f.box;
    },
    /* 容量/指标 KPI 卡（P3）：**画像 / 记忆库 / 运行总览三处共用的唯一实现**。
     * v9 裁决：容量类信息统一为「大数值 + 百分比 + 进度条」；无容量门的载体给 .na 虚线空槽保持槽位一致。
     * opts: { val, txt(文字型主值), sub, pct(null=无门), kind('' | ok | suspect | stalled) }
     * 返回 { box, set(val, sub, isTxt), fill(pct, kind) } */
    tabs: function(key, defs) {
      var box = el("div", "sc-tabbox");
      var cur = Cfg.get("tab:" + key, (defs[0] || {}).id);
      var valid = false;
      defs.forEach(function(d) {
        if (d.id === cur) valid = true;
      });
      if (!valid) cur = (defs[0] || {}).id;
      var panes = {};
      defs.forEach(function(d) {
        d.pane.classList.add("sc-tabpane");
        panes[d.id] = d.pane;
        box.appendChild(d.pane);
      });
      function applyPane(id) {
        defs.forEach(function(d) {
          if (d.id === id) d.pane.classList.remove("sc-hidden");
          else d.pane.classList.add("sc-hidden");
        });
      }
      function setCur(id) {
        cur = id;
        applyPane(id);
      }
      var HST = hostComponent("SegmentedTabs"), h = reactEl();
      var m = null;
      if (HST && h) {
        var navBox = el("div", "sc-tabnav");
        box.insertBefore(navBox, box.firstChild);
        m = mountReact(navBox, function() {
          return h(HST, {
            items: defs.map(function(d) {
              return { value: d.id, label: d.label, id: "tab-" + key + "-" + d.id, panelId: "panel-" + key + "-" + d.id };
            }),
            value: cur,
            label: key,
            onChange: function(id) {
              setCur(id);
              Cfg.set("tab:" + key, id);
              if (m) m.update();
            }
          });
        });
      }
      if (!m) {
        var nav = el("div", "sc-tabnav");
        box.insertBefore(nav, box.firstChild);
        defs.forEach(function(d) {
          var t = el("button", "sc-tabbtn", d.label);
          t.onclick = function() {
            defs.forEach(function(x) {
              x.btn.className = "sc-tabbtn";
            });
            t.className = "sc-tabbtn sc-on";
            setCur(d.id);
            Cfg.set("tab:" + key, d.id);
          };
          d.btn = t;
          nav.appendChild(t);
        });
        m = { update: function() {
        } };
      }
      applyPane(cur);
      return {
        box,
        select: function(id) {
          setCur(id);
          if (m) m.update();
        },
        pane: function(id) {
          return panes[id] || null;
        }
      };
    },
    kpi: function(top, opts) {
      var o = opts || {};
      var c = el("div", "sc-kpi");
      var topEl = el("div", "sc-kpi-top");
      var DOTK = { ended: "ok", running: "ok", probing: "info", suspect: "warn", stalled: "err" };
      var dotCls = function(k) {
        return "sc-dot " + (DOTK[k] || k || "ok");
      };
      var dot = null;
      if (o.kind) {
        dot = el("span", dotCls(o.kind));
        topEl.appendChild(dot);
      }
      topEl.appendChild(el("span", null, top));
      c.appendChild(topEl);
      var v = el("div", "sc-kpi-val" + (o.txt ? " txt" : ""), o.val === void 0 || o.val === null ? "—" : String(o.val));
      c.appendChild(v);
      var sub = el("div", "sc-kpi-sub", o.sub || "");
      c.appendChild(sub);
      var bar = null;
      if (!o.plain) {
        bar = el("div", "sc-kpi-bar" + (o.pct === null || o.pct === void 0 ? " na" : ""));
        var fill = el("i", o.kind || "");
        if (o.pct !== null && o.pct !== void 0) fill.style.setProperty("--sc-pct", o.pct + "%");
        bar.appendChild(fill);
        c.appendChild(bar);
      }
      var h = {
        box: c,
        set: function(val, subText, isTxt) {
          v.textContent = val === void 0 || val === null ? "—" : String(val);
          v.className = "sc-kpi-val" + (isTxt ? " txt" : "");
          if (subText !== void 0) sub.textContent = subText || "";
          return h;
        },
        fill: function(pct, kind) {
          if (dot && kind !== void 0) dot.className = dotCls(kind);
          if (!bar) return h;
          if (pct === null || pct === void 0) {
            bar.classList.add("na");
            return h;
          }
          bar.classList.remove("na");
          bar.firstChild.style.setProperty("--sc-pct", pct + "%");
          if (kind !== void 0) bar.firstChild.className = kind === "ended" ? "ok" : kind;
          return h;
        }
      };
      return h;
    },
    /* 进度条（C1）。P0-1（2026-09-13）：条体改由组件库承载 ——
     *   外壳 `div.sc-prog` 保留（承载行间距与下方文字），`<wa-progress-bar>` 负责条本身。
     *   尺寸/配色由 CSS 侧接管组件变量（见上方 .sc-prog-bar 规则），此处只驱动 `value`。 */
    progress: function(id) {
      var box = el("div", "sc-prog");
      var track = el("div", "sc-prog-track");
      var fill = el("div", "sc-prog-fill");
      track.appendChild(fill);
      var txt = el("div", "sc-prog-txt", "");
      box.appendChild(track);
      box.appendChild(txt);
      function render(p) {
        var s = (p || {})[id];
        if (!s || !s.on) {
          box.classList.add("sc-hidden");
          return;
        }
        box.classList.remove("sc-hidden");
        fill.style.width = Math.max(0, Math.min(100, s.pct || 0)) + "%";
        txt.textContent = (s.label ? s.label + " · " : "") + (s.pct || 0) + "% · " + (s.note || "");
      }
      render(Store.get("progress"));
      Bus.on("progress", render);
      return box;
    },
    /* 键值对（信息密度） */
    kv: function(pairs) {
      var w = el("div", "sc-kv");
      (pairs || []).forEach(function(p) {
        var r = el("div", "sc-kv-row");
        r.appendChild(el("span", "sc-kv-k", p[0]));
        r.appendChild(el("span", "sc-kv-v", p[1]));
        w.appendChild(r);
      });
      return w;
    }
  };
  function numSetting(name, desc, val, key, unit, step) {
    var isFloat = typeof step === "number" && step < 1;
    var wrap = el("div", "sc-num-wrap");
    var inp = el("input");
    inp.type = "number";
    inp.className = "sc-input";
    inp.min = "0";
    inp.step = String(step || 100);
    inp.value = String(val);
    var unitEl = el("span", "sc-range-label", unit || "");
    inp.onchange = function() {
      var v = String(isFloat ? Math.max(0, parseFloat(inp.value) || 0) : Math.max(0, parseInt(inp.value, 10) || 0));
      appState.api("/set", { method: "POST", body: JSON.stringify({ key, value: v }) }).then(function() {
        appState.statusFn("✓ " + key + " = " + v);
      }).catch(appState.failFn);
    };
    wrap.appendChild(inp);
    wrap.appendChild(unitEl);
    return UI.item(name, desc, null, { children: [appState.metaBadges(key), wrap] });
  }
  function enumSetting(name, desc, val, key, options) {
    var wrap = el("div", "sc-num-wrap");
    var sel = el("select", "sc-input");
    (options || []).forEach(function(o) {
      var opt = el("option");
      opt.value = o.v;
      opt.textContent = o.label;
      if (String(o.v) === String(val)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = function() {
      var v = String(sel.value);
      appState.api("/set", { method: "POST", body: JSON.stringify({ key, value: v }) }).then(function() {
        appState.statusFn("✓ " + key + " = " + v);
      }).catch(appState.failFn);
    };
    wrap.appendChild(sel);
    return UI.item(name, desc, null, { children: [appState.metaBadges(key), wrap] });
  }

  // src-client/host-slots.js
  function registerHostSlots(p) {
    var ctx = p.ctx;
    var reactEl2 = p.reactEl;
    var openPanel = p.openPanel;
    var SC_ICON = p.iconSrc;
    var tr2 = p.Tr;
    var ShoucangSettingsSection = p.SettingsSection;
    var SLOT_OK = !!(reactEl2 && typeof reactEl2.createElement === "function" && ctx && typeof ctx.effect === "function" && ctx.slots && typeof ctx.slots.inject === "function" && typeof ctx.slots.register === "function");
    if (!SLOT_OK) return false;
    ctx.effect(function() {
      return ctx.slots.inject("sidebar.footer.action", function() {
        var open = openPanel;
        var ShoucangToggle = function() {
          if (!reactEl2 || typeof reactEl2.createElement !== "function") return null;
          return reactEl2.createElement(
            "button",
            { type: "button", title: tr2("守藏面板"), className: "sc-trigger", onClick: function() {
              open();
            } },
            reactEl2.createElement("img", { src: SC_ICON, alt: tr2("守"), style: { width: 22, height: 22, display: "block" } }),
            reactEl2.createElement("span", { className: "sc-trigger-label" }, tr2("守藏"))
          );
        };
        return ctx.slots.register({
          name: "sidebar.footer.action",
          id: "shoucang-panel-toggle",
          label: function() {
            return tr2("守藏面板");
          }
        }, ShoucangToggle);
      });
    }, "shoucang-panel: footer action");
    ctx.effect(function() {
      return ctx.slots.inject("settings.section", function() {
        return ctx.slots.register({
          name: "settings.section",
          id: "shoucang",
          order: 60,
          label: function() {
            return tr2("守藏");
          }
        }, ShoucangSettingsSection);
      });
    }, "shoucang-panel: settings section");
    ctx.effect(function() {
      return ctx.slots.inject("sidebar.panellist", function() {
        var open = openPanel;
        var ShoucangPanelIcon = function(props) {
          var size = props && props.size || 20;
          if (!reactEl2 || typeof reactEl2.createElement !== "function") return null;
          return reactEl2.createElement(
            "button",
            {
              type: "button",
              title: tr2("守藏面板"),
              "aria-label": tr2("守藏面板"),
              className: "sc-panel-icon" + (props && props.active ? " on" : ""),
              onClick: function() {
                open();
              }
            },
            reactEl2.createElement("img", {
              src: SC_ICON,
              alt: "",
              width: size,
              height: size,
              style: { width: size, height: size, display: "block", pointerEvents: "none" }
            })
          );
        };
        return ctx.slots.register({
          name: "sidebar.panellist",
          id: "shoucang",
          order: 60,
          label: function() {
            return tr2("守藏面板");
          }
        }, ShoucangPanelIcon);
      });
    }, "shoucang-panel: panellist icon");
    return true;
  }

  // src-client/derive.js
  var Derive = /* @__PURE__ */ (function() {
    var VEC_DOWN = { off: "stalled", unreachable: "stalled" };
    var VEC_LABEL = {
      fusion: "融合",
      "gpu-ready": "本机就绪",
      lexical: "词法",
      cloud: "云端",
      unreachable: "服务未连",
      off: "关"
    };
    var CAP_PCT = { stalled: 85, suspect: 60 };
    var BACKREF_LIMIT = 8;
    var SUITE_STATUS = {
      both: { text: "已装配", kind: "ok", tip: "注入器 + profile 双基准" },
      injected: { text: "已装配", kind: "ok", tip: "注入器装配" },
      profile: { text: "已装配", kind: "ok", tip: "profile 装配" },
      missing: { text: "未装配", kind: "error", tip: "两基准均未装配（member 独立可装）" }
    };
    var SUITE_FALLBACK = { text: "未装配", kind: "info", tip: "状态未知" };
    function s(v, dflt) {
      return String(v === void 0 || v === null || v === "" ? dflt : v);
    }
    var hasOwn2 = Object.prototype.hasOwnProperty;
    function pick(o, k, dflt) {
      return hasOwn2.call(o, k) ? o[k] : dflt;
    }
    return {
      CAP_PCT,
      BACKREF_LIMIT,
      VEC_LABEL,
      VEC_DOWN,
      SUITE_STATUS,
      /* provider → 徽章 kind。running 档由调用方显式给出（各视图口径不同，见上注）。 */
      providerKind: function(p, runningList) {
        var k = s(p, "off");
        if (runningList && runningList.indexOf(k) >= 0) return "running";
        return pick(VEC_DOWN, k, "ended");
      },
      /* provider 是否未就绪（off / unreachable）——决定是否出兜底/引导提示。
      * 注意不做 'off' 兜底：原判据 `p === 'off' || p === 'unreachable'` 在 p 缺失时为 false
      * （记忆板块 §7 传的是裸 `data.vector.provider`），兜底会把「未上报」误判成「已关闭」。 */
      providerDown: function(p) {
        return hasOwn2.call(VEC_DOWN, String(p));
      },
      vecLabel: function(p) {
        return pick(VEC_LABEL, s(p, "off"), tr("关"));
      },
      capKind: function(pct) {
        var n = Number(pct) || 0;
        return n >= CAP_PCT.stalled ? "stalled" : n >= CAP_PCT.suspect ? "suspect" : "ended";
      },
      suiteStatus: function(st) {
        return pick(SUITE_STATUS, String(st), SUITE_FALLBACK);
      },
      /* 判空：替代散落的 `x && x.length`（20+ 处）。注意与 `!x.length` 的差异——
         后者在 x 为 null/undefined 时直接抛错，has() 返回 false（把崩溃变成空态）。 */
      has: function(v) {
        return !!(v && v.length);
      },
      /* 取数：替代 `(x || []).length`（取值场景用，缺省 0） */
      count: function(v) {
        return v && v.length || 0;
      },
      /* 千分位（v9 对齐：`3,204` / `3,100 / 5,000 字符`；此前裸数字） */
      num: function(v) {
        if (v === null || v === void 0 || v === "") return "—";
        var s2 = String(v);
        return /^-?\d+$/.test(s2) ? s2.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s2;
      },
      /* 向量区可见性：原判据 `data.vector && data.vector.enabled !== false` */
      vectorOn: function(data) {
        return !!(data && data.vector && data.vector.enabled !== false);
      }
    };
  })();
  function fmtTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      var p = function(n) {
        return (n < 10 ? "0" : "") + n;
      };
      return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    } catch (e) {
      return String(iso).slice(0, 16);
    }
  }

  // src-client/tag-label.js
  var TAG_LABELS = {
    // —— agent 索引侧（英文键）——
    env: ["环境", "Environment"],
    tool: ["工具", "Tool"],
    flow: ["流程", "Flow"],
    lesson: ["教训", "Lesson"],
    release: ["发布", "Release"],
    user: ["用户", "User"],
    agent: ["智能体", "Agent"],
    // —— 用户索引侧（中文键）——
    "身份": ["身份", "Identity"],
    "使命": ["使命", "Mission"],
    "边界": ["边界", "Boundary"],
    "性格": ["性格", "Trait"],
    "认知": ["认知", "Cognition"],
    "演化": ["演化", "Evolution"],
    "偏好": ["偏好", "Preference"],
    "习惯": ["习惯", "Habit"],
    "原则": ["原则", "Principle"],
    "路径": ["路径", "Task path"],
    "经验": ["经验", "Experience"],
    "教训": ["教训", "Lesson"],
    "环境": ["环境", "Environment"],
    "硬件": ["硬件", "Hardware"]
  };
  function tagLabel(tag, loc, onMiss) {
    var t = String(tag == null ? "" : tag).trim();
    if (!t) return "?";
    var row = TAG_LABELS[t];
    if (!row) {
      if (typeof onMiss === "function") {
        try {
          onMiss(t);
        } catch (e) {
        }
      }
      return t;
    }
    return loc === "zh" ? row[0] : row[1];
  }

  // src-client/panes-memory.js
  function openMemoryNote(pointer, autoSection, returnRender) {
    if (!pointer) {
      appState.statusFn(tr("该条目无 notes 跳转目标"));
      return;
    }
    var rel = String(pointer).split("§")[0].trim();
    if (!/^notes\/[a-z]+\.md$/.test(rel)) {
      appState.statusFn(tr("指针目标非 notes 白名单：") + pointer);
      return;
    }
    appState.memoryViewScroll = appState.refs.view.scrollTop;
    appState.noteReturnRender = returnRender || null;
    appState.api("/memory/sections?rel=" + encodeURIComponent(rel)).then(function(r) {
      if (!r || !r.present) {
        appState.statusFn(r && r.error || tr("小节不可用"));
        return;
      }
      Fold.clear("note:");
      appState.renderNoteSections(appState.refs.view, r);
      if (autoSection) locateSection(appState.refs.view, autoSection, r);
    }).catch(appState.failFn);
  }
  function locateSection(view, autoSection, data) {
    var raw = String(autoSection || "").trim();
    if (!raw) return;
    var idx = data && data.pointerIndex || {};
    var ent = idx[raw] || null;
    var heads = view.querySelectorAll("[data-fold-key]");
    var setAndScroll = function(foldKey) {
      if (!foldKey) return false;
      Fold.set(foldKey, true);
      var target = null;
      Array.prototype.forEach.call(heads, function(h) {
        if (h.getAttribute("data-fold-key") === foldKey) target = h;
      });
      if (!target) return false;
      var scroll = function() {
        try {
          if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch (e) {
        }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(scroll);
      else scroll();
      return true;
    };
    if (!ent) {
      appState.statusFn(tr("小节未找到（指针锚：") + raw + tr("）——已显示整篇，未自动展开"));
      return;
    }
    if (ent.resolveState === "exists" || ent.resolveState === "partial") {
      if (setAndScroll(ent.foldKey)) return;
      appState.statusFn(tr("小节未找到（指针锚：") + raw + tr("）——已显示整篇，未自动展开"));
      return;
    }
    if (ent.resolveState === "ambiguous") {
      var names = Derive.has(ent.cands) ? ent.cands.slice(0, 4).join(" / ") : "";
      appState.statusFn(tr("该指针命中 ") + Derive.count(ent.cands) + tr(" 个同名/包含小节，无法唯一定位（未展开）：") + names);
      return;
    }
    appState.statusFn(tr("小节未找到（指针锚：") + raw + tr("）——已显示整篇，未自动展开"));
  }
  function makeMemoryPointerRow(title, pointer, meta, summary) {
    var row = el("div", "sc-pointer");
    var main = el("div", "sc-pointer-main");
    var head = el("div", "sc-pointer-head");
    head.appendChild(el("span", "sc-pointer-title", title));
    if (meta) head.appendChild(el("span", "sc-pointer-meta", meta));
    main.appendChild(head);
    if (summary) main.appendChild(el("div", "sc-pointer-summary", summary));
    row.appendChild(main);
    if (pointer) row.appendChild(el("span", "sc-pointer-go", "↗"));
    var p = pointer, sec = String(pointer || "").split("§")[1] || "";
    row.addEventListener("click", function() {
      openMemoryNote(p, sec.trim() || null);
    });
    return row;
  }
  function idxHue(tag) {
    var map = { env: 180, tool: 212, flow: 262, lesson: 28, release: 320, 身份: 330, 偏好: 348, 习惯: 12, 硬件: 200, 环境: 190, 演化: 150, 经验: 45 };
    return map[tag] != null ? map[tag] : 254;
  }
  function idxPill(tag) {
    var h = idxHue(tag);
    var name = tagLabel(tag, lang(), function(miss) {
      try {
        Log.warn(tr("标签未登记于映射表：") + miss + tr("（已按原样显示；请同步 tag-label.js）"));
      } catch (e) {
      }
    });
    var text = name;
    var pill = el("span", "sc-idx-tag hued", text);
    pill.style.setProperty("--sc-tag-h", String(h));
    pill.title = tag || "";
    pill.setAttribute("aria-label", (tag || "") + (name !== tag ? " (" + name + ")" : ""));
    return pill;
  }
  var TAG_ORDER = [
    "env",
    "环境",
    "tool",
    "flow",
    "lesson",
    "教训",
    "release",
    "user",
    "agent",
    "原则",
    "路径",
    "经验",
    "身份",
    "使命",
    "边界",
    "性格",
    "认知",
    "演化",
    "偏好",
    "习惯",
    "硬件"
  ];
  var TAG_ORDER_ZH = [
    "环境",
    "工具",
    "流程",
    "教训",
    "发布",
    "用户",
    "智能体",
    "原则",
    "路径",
    "经验",
    "身份",
    "使命",
    "边界",
    "性格",
    "认知",
    "演化",
    "偏好",
    "习惯",
    "硬件"
  ];
  function renderIndexRows(container, lines, returnRender) {
    var arr = (lines || []).slice();
    var bad = 0;
    arr = arr.filter(function(ln) {
      var ok = !!ln && typeof ln === "object";
      if (!ok) bad++;
      return ok;
    });
    if (bad) {
      try {
        Log.warn(tr("renderIndexRows：跳过 ") + bad + tr(" 条格式异常索引行（期望 { tag, subject, pointer }）"));
      } catch (e) {
      }
      container.appendChild(el("div", "sc-mem-empty", "⚠ " + bad + tr(" 条索引行数据格式异常已跳过（期望 { tag, subject, pointer }）")));
    }
    arr.sort(function(a, b) {
      var ia = TAG_ORDER.indexOf(String(a.tag || "").toLowerCase());
      if (ia === -1) ia = TAG_ORDER.length;
      var ib = TAG_ORDER.indexOf(String(b.tag || "").toLowerCase());
      if (ib === -1) ib = TAG_ORDER.length;
      return ia - ib;
    });
    var tagCount = {};
    arr.forEach(function(l) {
      var t = String(l.tag || "").trim();
      if (t) tagCount[t] = (tagCount[t] || 0) + 1;
    });
    var lastTag = null;
    arr.forEach(function(ln) {
      var t = String(ln.tag || "").trim();
      if (t !== lastTag) {
        lastTag = t;
        var head = el("div", "sc-idx-group");
        head.appendChild(idxPill(ln.tag));
        head.appendChild(el("span", "sc-idx-group-n", Derive.num(tagCount[t] || 1) + tr(" 条")));
        container.appendChild(head);
      }
      var row = el("div", "sc-idx-row");
      row.appendChild(el("span", "sc-idx-subject", ln.subject || ""));
      if (ln.pointer) row.appendChild(el("span", "sc-idx-pointer", ln.pointer));
      var ptr = ln.pointer, sec = String(ln.pointer || "").split("§")[1] || "";
      row.addEventListener("click", function() {
        openMemoryNote(ptr, sec.trim() || null, returnRender);
      });
      row.title = (ln.subject || "") + (ln.pointer ? " → " + ln.pointer : "") + tr(" · 点击进详情");
      container.appendChild(row);
    });
  }
  function renderPersona(view, data) {
    view.textContent = "";
    UI.pageHead(tr("画像"), tr("USER.md（用户画像）与 AGENT.md（Agent 画像）的唯一展示位。"), {
      routes: ["/memory/overview"],
      actions: [el("span", "sc-proto-note", tr("压缩执行位：下方 USER.md 卡"))]
    });
    if (!data || !data.present || !Derive.has(data.indexes)) {
      appState.statusFn(data && data.error || tr("记忆库画像不可用"));
      return;
    }
    var pair = data.indexes.filter(function(f) {
      return f.name === "USER.md" || f.name === "AGENT.md";
    });
    var totalRows = 0;
    var grid = el("div", "sc-kpis sc-kpis-2");
    pair.forEach(function(f) {
      var pct = f.cap ? Math.round((f.chars || 0) / f.cap * 100) : null;
      grid.appendChild(UI.kpi(f.name.replace(".md", "") + tr(" 容量"), {
        val: pct === null ? Derive.num(f.chars || 0) : pct + "%",
        sub: Derive.num(f.chars || 0) + " / " + Derive.num(f.cap || "—") + tr(" 字符 · ") + Derive.count(f.lines) + tr(" 条画像"),
        pct,
        kind: pct === null ? "" : Derive.capKind(pct)
      }).box);
    });
    view.appendChild(grid);
    var statGrid = el("div", "sc-mem-grid");
    statGrid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    pair.forEach(function(f) {
      var byTag = {};
      (f.lines || []).forEach(function(ln) {
        var t = String(ln && ln.tag || "").trim();
        if (!t) return;
        var disp = tagLabel(t, lang());
        byTag[disp] = (byTag[disp] || 0) + 1;
      });
      var parts = Object.keys(byTag).sort(function(a, b) {
        var ia = TAG_ORDER_ZH.indexOf(a);
        if (ia === -1) ia = TAG_ORDER_ZH.length;
        var ib = TAG_ORDER_ZH.indexOf(b);
        if (ib === -1) ib = TAG_ORDER_ZH.length;
        return ia - ib || a.localeCompare(b);
      }).map(function(k) {
        return k + " " + byTag[k];
      });
      var pct = f.cap ? Math.round((f.chars || 0) / f.cap * 100) : null;
      var tip = pct !== null && pct >= 80 ? tr("容量 ") + Derive.num(f.chars) + " / " + Derive.num(f.cap) + tr(" —— 超过 80% 时在此显示一行提示；红线由 write_gate 写入时强制。") : f.cap ? tr("容量 ") + Derive.num(f.chars) + " / " + Derive.num(f.cap) + tr(" —— [原则] / [路径] 行数在「总览 · 本月成长」按月跟踪。") : tr("暂无容量门。");
      var s = el("div", "sc-mem-stat");
      s.appendChild(el("div", "sc-mem-stat-label", f.name.replace(".md", "") + tr(" 构成")));
      s.appendChild(el("div", "sc-mem-stat-value", Derive.count(f.lines) + tr(" 条")));
      s.appendChild(el("div", "sc-mem-stat-sub", Derive.has(parts) ? parts.join(" · ") : tr("（暂无标签行）")));
      s.appendChild(el("div", "sc-mem-stat-rule", tip));
      statGrid.appendChild(s);
    });
    view.appendChild(statGrid);
    var mat = data.maturity || {};
    var matBins = Array.isArray(mat.bins) ? mat.bins : [];
    var matTotal = Number(mat.total || 0);
    var matGate = Number(mat.gate || 0.5);
    var matMax = Math.max.apply(null, [1].concat(matBins.map(function(n) {
      return Number(n) || 0;
    })));
    var matCard = UI.card(tr("成熟度分布"), {
      sub: tr("v4 新增 · 按 0.2 分档统计库内小节数"),
      right: [el("span", "sc-src", "/memory/overview")]
    });
    var histWrap = el("div", "sc-hist-wrap");
    var hist = el("div", "sc-hist");
    ["0–.2", ".2–.4", ".4–.6", ".6–.8", ".8–1"].forEach(function(b, bi) {
      var n = Number(matBins[bi] || 0);
      var bar = el("i");
      if (n > 0) bar.style.height = Math.round(n / matMax * 100) + "%";
      bar.title = b + "：" + n + tr(" 节");
      bar.appendChild(el("b", null, b));
      hist.appendChild(bar);
    });
    histWrap.appendChild(hist);
    matCard.body.appendChild(histWrap);
    matCard.body.appendChild(el("div", "sc-mem-stat-rule", matTotal ? tr("共 ") + matTotal + tr(" 节：A ≥ ") + matGate + tr("（升格线）才具备升格为 [原则] / [路径] 的稳定条件。") + tr("口径：库内 audit/maturation.jsonl 按 A 值 0.2 分档的小节数。") : tr("成熟度台账为空：库内 audit/maturation.jsonl 尚无记录（跑一次成熟度扫描即写入）。")));
    view.appendChild(matCard.box);
    pair.forEach(function(f, idx) {
      totalRows += Derive.count(f.lines);
      var title = f.name && f.label ? String(f.name) + " · " + String(f.label) : f.label || String(f.name || "").replace(/\.md$/, "");
      var right = [el("span", "sc-src", "/memory/overview · " + String(f.name || ""))];
      if (idx === 0) {
        right.push(UI.button(tr("压缩画像"), function() {
          appState.statusFn(tr("画像压缩（深度睡眠归纳）触发中…"));
          return appState.api("/deepsleep/trigger", { method: "POST", body: "{}" }).then(function(rr) {
            appState.statusFn(rr && rr.ok ? tr("✓ 已触发深睡归纳（高分重复条目将折叠为索引项）") : tr("⚠ 触发失败：") + (rr && rr.error || ""));
          });
        }, {
          async: true,
          busyText: tr("压缩中…"),
          okText: tr("已触发归纳"),
          title: tr("画像压缩：触发一次深度睡眠归纳，由树整理把高分重复条目折叠为索引项（无独立端点）"),
          confirm: tr("「压缩画像」= 触发一次深度睡眠归纳，由深睡树整理折叠高分重复条目。立即执行？")
        }));
      }
      var c = UI.card(title, {
        sub: Derive.count(f.lines) + tr(" 条"),
        right
      });
      view.appendChild(c.box);
      if (!Derive.has(f.lines)) {
        c.body.appendChild(el("div", "sc-mem-empty", tr("（暂无指针行）")));
        return;
      }
      var list = el("div", "sc-idx-list");
      renderIndexRows(list, f.lines, renderPersona);
      c.body.appendChild(list);
    });
    view.appendChild(el("div", "sc-note", tr("注：容量百分比与容量条按 write_gate 的实际上限计算；指针行点击可直达 notes/ 对应小节。")));
    appState.statusFn(tr("画像 · ") + totalRows + tr(" 条指针"));
  }

  // src-client/panes-overview.js
  function ovCRow(title, desc, right) {
    var r = el("div", "sc-crow");
    var l = el("div");
    l.appendChild(el("div", "sc-ct", title));
    if (desc) l.appendChild(el("div", "sc-cd", desc));
    r.appendChild(l);
    var rr = el("div", "sc-right");
    (right || []).forEach(function(n) {
      if (n) rr.appendChild(n);
    });
    r.appendChild(rr);
    return r;
  }
  function ovPill(text, kind, mono) {
    return el("span", "sc-pill" + (kind ? " " + kind : "") + (mono ? " mono" : ""), text);
  }
  function ovAgo(ts) {
    var t = typeof ts === "number" ? ts : ts ? Date.parse(String(ts)) : 0;
    if (!t || isNaN(t)) return "";
    var m = Math.max(0, Math.round((Date.now() - t) / 6e4));
    if (m < 1) return tr("刚刚");
    if (m < 60) return m + tr(" 分钟前");
    if (m < 1440) return Math.round(m / 60) + tr(" 小时前");
    return Math.round(m / 1440) + tr(" 天前");
  }
  function ovMorningCard() {
    var card = UI.card(tr("睡眠汇报"), { sub: tr("读取中…"), right: [el("span", "sc-src", "/sleep/reports · /sleep/issues")] });
    var box = el("div");
    box.appendChild(el("div", "sc-desc", tr("读取中…")));
    card.body.appendChild(box);
    Promise.all([
      appState.api("/sleep/reports").catch(function() {
        return {};
      }),
      appState.api("/sleep/issues").catch(function() {
        return {};
      })
    ]).then(function(rs) {
      var rep = rs[0] || {}, iss = rs[1] || {}, round = iss.lastRound || {}, st = round.stats || {};
      var days = rep.days || [];
      var sub = card.head && card.head.querySelector(".sub");
      if (sub) sub.textContent = rep.present ? tr("共 ") + Derive.num(rep.count || 0) + tr(" 期 · 最近 ") + String((days[0] || {}).date || "") : tr("尚无汇报");
      box.textContent = "";
      if (!rep.present || !iss.lastRound) {
        box.appendChild(el("div", "sc-desc", tr("尚未产出睡眠汇报（深睡轮跑完才有）。")));
        return;
      }
      var byTag = iss.byTag || {};
      var produced = Number(round.added || 0) + Number(round.replaced || 0);
      box.appendChild(ovCRow(
        tr("提存"),
        tr("新增 ") + Derive.num(round.added || 0) + tr(" · 替换 ") + Derive.num(round.replaced || 0) + (round.produceOff ? tr(" · 本月停产（口径）") : ""),
        [ovPill("+" + Derive.num(produced), "ok")]
      ));
      box.appendChild(ovCRow(
        tr("压缩"),
        tr("树 ") + Derive.num(round.tree || 0) + tr(" · 指针 ") + Derive.num(round.pointers || 0) + tr(" · 归档 ") + Derive.num(round.archived || 0),
        [ovPill(tr("保留 ") + Derive.num(round.kept || 0), null, true)]
      ));
      box.appendChild(ovCRow(
        tr("问题"),
        tr("未处理 ") + Derive.num(iss.issues || 0) + tr(" 条 · 召回面 ") + Derive.num(byTag["suspect-recall"] || 0) + tr(" / 记忆面 ") + Derive.num(byTag["suspect-quality"] || 0),
        [ovPill(tr("分母 影响账 ") + Derive.num(st.rows || 0) + tr(" 条"))]
      ));
      var recent = days.slice(0, 3).map(function(d) {
        return String(d.date) + " · " + Derive.num(d.sections || 0) + tr(" 段");
      });
      box.appendChild(ovCRow(tr("最近几期"), recent.join("　·　") || "—", [ovPill(tr("可回看"), "info")]));
    }).catch(function() {
      box.textContent = "";
      box.appendChild(el("div", "sc-desc", tr("睡眠汇报读取失败（/sleep/reports）。")));
    });
    return card.box;
  }
  function ovTimelineCard() {
    var card = UI.card(tr("最近动态"), { right: [ovPill(tr("最近 24 小时"))] });
    var tl = el("div", "sc-tl");
    tl.appendChild(el("div", "sc-desc", tr("读取中…")));
    card.body.appendChild(tl);
    Promise.all([
      appState.api("/memory/overview").catch(function() {
        return {};
      }),
      appState.api("/deepsleep").catch(function() {
        return {};
      })
    ]).then(function(rs) {
      var d = rs[0] || {}, sl = rs[1] || {};
      var ds = d.distillStats || {}, g = d.growth || {}, pend = d.pending || {};
      var it = [];
      if (ds.last && ds.last.at) {
        it.push({
          t: Date.parse(ds.last.at) || 0,
          k: "ok",
          title: tr("蒸馏完成 · 本月 ") + Derive.num(ds.runs || 0) + tr(" 次"),
          desc: tr("累计入库 ") + Derive.num(ds.added || 0) + tr(" 条 · 异常 ") + Derive.num(ds.failed || 0) + tr(" 条"),
          time: ovAgo(ds.last.at)
        });
      }
      if (g.sleep && g.sleep.passes) {
        it.push({
          t: Number(sl.lastDeepSleepAt) || 0,
          k: "ok",
          title: tr("深度睡眠整理 · 本月 ") + Derive.num(g.sleep.passes) + tr(" 次"),
          desc: tr("习得原则 ") + Derive.num(g.sleep.principleAdded || 0) + tr(" · 替换 ") + Derive.num(g.sleep.replaced || 0) + tr(" · 画像 ") + Derive.num(g.sleep.profilesAdded || 0),
          time: sl.lastDeepSleepAt ? ovAgo(sl.lastDeepSleepAt) : tr("本月")
        });
      }
      (d.indexes || []).forEach(function(f) {
        if (!f || !f.cap) return;
        var pct = Math.round((f.chars || 0) / f.cap * 100);
        if (pct < 80) return;
        it.push({
          t: 0,
          k: "warn",
          title: tr("容量预警 · ") + String(f.name || "") + tr(" 达 ") + pct + "%",
          desc: tr("红线由 write_gate 写入时强制；建议在下一次深睡中执行画像压缩"),
          time: tr("阈值 80%")
        });
      });
      if (pend.count) {
        it.push({
          t: 0,
          k: pend.count > 5 ? "warn" : "",
          title: tr("候选待裁决 · ") + Derive.num(pend.count) + tr(" 条"),
          desc: tr("24h 内新增 ") + Derive.num(pend.last24h || 0) + tr(" 条"),
          time: tr("待处理")
        });
      }
      tl.textContent = "";
      if (!Derive.has(it)) {
        tl.appendChild(el("div", "sc-desc", tr("暂无动态。")));
        return;
      }
      it.sort(function(a, b) {
        return (b.t || 0) - (a.t || 0);
      });
      it.slice(0, 4).forEach(function(x) {
        var box = el("div", "sc-tl-item" + (x.k ? " " + x.k : ""));
        box.appendChild(el("div", "sc-tl-t", x.title));
        box.appendChild(el("div", "sc-tl-d", x.desc));
        box.appendChild(el("div", "sc-tl-time", x.time));
        tl.appendChild(box);
      });
    });
    return card.box;
  }
  function ovCriteriaCard() {
    var card = UI.card(tr("判据与重排门"), {
      sub: tr("现状已有 · 仅改归属"),
      right: [el("span", "sc-src", "GET /criteria")]
    });
    var mini = el("div", "sc-mini");
    var note = el("div", "sc-mem-stat-rule", tr("读取中…"));
    card.body.appendChild(mini);
    card.body.appendChild(note);
    appState.api("/criteria").then(function(c) {
      var o = c || {};
      var gate = o.rerankGate || {}, h = o.health || {}, bg = o.bankGit || {}, led = o.ledger || {};
      mini.textContent = "";
      var put = function(k, v) {
        mini.appendChild(el("div", "k", k));
        mini.appendChild(el("div", "v", v));
      };
      put(tr("判据版本"), String(o.version || "—"));
      put(tr("台账行数"), Derive.num(led.rows || 0));
      put(tr("notes 告警阈值"), h.notesWarn == null ? "—" : Derive.num(h.notesWarn));
      put(tr("重排门"), Derive.num(gate.indexRows || 0) + " / " + Derive.num(gate.threshold || 0) + tr(" · 行数门") + (gate.ready ? tr("已达") : tr("未达")));
      put(tr("库版本"), Derive.num(bg.commits || 0) + tr(" 提交"));
      note.textContent = tr("健康度 health.R / K 与 caps 由 criteria-gate.json 提供；本卡只读。");
    }).catch(function() {
      note.textContent = tr("判据台账读取失败（GET /criteria）。");
    });
    return card.box;
  }
  function ovQuickCard() {
    var card = UI.card(tr("快捷操作"));
    var row = el("div", "sc-toolbar");
    row.style.flexWrap = "wrap";
    var res = el("div", "sc-desc", "");
    row.appendChild(UI.button(tr("测试嵌入连通"), function() {
      res.textContent = tr("读取配置…");
      return appState.api("/embed/config").then(function(c) {
        var g = c && c.effective || c && c.persisted || {};
        var baseUrl = String(g.baseUrl || g.embedBaseUrl || "").trim();
        if (!baseUrl) {
          res.textContent = tr("✗ 未配置 embedBaseUrl（且缺省不可用）");
          return;
        }
        var dflt = c && c.isDefault || {};
        var src = dflt.embedBaseUrl ? tr("（缺省在用）") : tr("（已落盘）");
        res.textContent = tr("测试中… ") + baseUrl + src;
        return appState.apiCtx("/embed/test", {
          method: "POST",
          body: JSON.stringify({ baseUrl, apiKey: String(g.apiKey || g.embedApiKey || "").trim() })
        }, tr("嵌入连通性")).then(function(r) {
          res.textContent = r && r.error ? "✗ " + r.error + " · " + baseUrl + src : tr("✓ 可达 · ") + Derive.count(r && r.models) + tr(" 个模型 · ") + baseUrl + src;
        });
      }).catch(function(e) {
        res.textContent = "✗ " + e.message;
      });
    }, { async: true, busyText: tr("测试中…"), okText: tr("嵌入连通性测试完成"), title: tr("POST /embed/test —— 验证当前 embedding 配置是否可用") }));
    row.appendChild(UI.button(tr("根目录引导"), function() {
      res.textContent = tr("执行中…");
      return appState.apiCtx("/root/bootstrap", { method: "POST", body: JSON.stringify({}) }, tr("根目录引导")).then(function(r) {
        res.textContent = "✓ " + JSON.stringify(r).slice(0, 200);
      }).catch(function(e) {
        res.textContent = "✗ " + e.message;
      });
    }, { async: true, busyText: tr("执行中…"), okText: tr("根目录引导完成"), confirm: tr("执行根目录引导会尝试创建缺失的目录结构，确认继续？") }));
    row.appendChild(UI.button(tr("成熟度扫描"), function() {
      res.textContent = tr("扫描中…");
      return appState.apiCtx("/maturation/scan", { method: "POST", body: JSON.stringify({}) }, tr("成熟度扫描")).then(function(r) {
        res.textContent = r && r.active ? tr("✓ 扫描完成（分档已写入 audit/maturation.jsonl）") : "⚠ " + (r && r.error || tr("未生成"));
      }).catch(function(e) {
        res.textContent = "✗ " + e.message;
      });
    }, { async: true, busyText: tr("扫描中…"), okText: tr("成熟度扫描完成"), title: tr("POST /maturation/scan —— 重算库内小节成熟度并覆盖台账（只写台账，不改记忆内容）") }));
    row.appendChild(UI.button(tr("账本对账"), function() {
      res.textContent = tr("对账中…");
      return appState.apiCtx("/reconcile", { method: "POST", body: JSON.stringify({}) }, tr("账本对账")).then(function(r) {
        res.textContent = r && r.active ? tr("✓ 对账完成") : "⚠ " + (r && r.error || tr("失败"));
      }).catch(function(e) {
        res.textContent = "✗ " + e.message;
      });
    }, { async: true, busyText: tr("对账中…"), okText: tr("账本对账完成"), title: tr("POST /reconcile —— 记忆库对账（只读汇总）") }));
    card.body.appendChild(row);
    card.body.appendChild(res);
    return card.box;
  }
  function renderViewOverview(view) {
    view.textContent = "";
    UI.pageHead(tr("运行总览"), tr("一屏回答「现在怎么样」。徽章行 = 原记忆板块 §0 的 7 枚状态徽章，整体提升为独立首屏。"), {
      routes: ["/memory/overview", "/cognition/report", "/mcl/status"],
      refresh: true,
      actions: [el("span", "sc-proto-note", tr("蒸馏执行位：下方操作卡（本页仅一处）"))]
    });
    var badges = el("div", "sc-ds-badges");
    function bd(t, k) {
      var h = UI.dsBadge(t, k);
      badges.appendChild(h.box);
      return h;
    }
    var bDistill = bd(tr("蒸馏 …"));
    var bVec = bd(tr("向量 …"));
    var bPend = bd(tr("候选 …"));
    var bMem = bd(tr("记忆库 …"));
    var bMcl = bd(tr("认知环 …"));
    var bCrit = bd(tr("判据台账 …"));
    var bGit = bd(tr("库版本 …"));
    view.appendChild(badges);
    var alertBox = el("div", "sc-ds-alert warn sc-hidden");
    alertBox.setAttribute("role", "status");
    view.appendChild(alertBox);
    function setAlert(head, detail, linkText, linkGo) {
      if (!head) {
        alertBox.classList.add("sc-hidden");
        return;
      }
      alertBox.textContent = "";
      var body = el("div");
      body.appendChild(el("b", null, head));
      if (detail) body.appendChild(el("span", null, " —— " + detail));
      if (linkText) {
        var a = el("a", null, linkText);
        a.setAttribute("role", "button");
        a.onclick = function() {
          if (typeof linkGo === "function") linkGo();
        };
        body.appendChild(a);
      }
      alertBox.appendChild(body);
      alertBox.classList.remove("sc-hidden");
    }
    var ops = el("div", "sc-opgrid");
    ops.appendChild(appState.opCard(tr("立即蒸馏"), tr("遍历根会话蒸馏，携带 pending 候选回流；等价于等会话空闲自动触发。"), "POST /distill/run", tr("蒸馏"), function() {
      return appState.apiCtx("/distill/run", { method: "POST", body: JSON.stringify({}) }, tr("蒸馏")).then(function(r) {
        appState.statusFn(r && r.ok ? "✓ " + (r.note || tr("蒸馏完成")) : "⚠ " + (r && r.note || tr("未触发：根会话活跃中会跳过，等闲置自动跑")));
        appState.refreshView();
      });
    }, { icon: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1", busyText: tr("蒸馏中…"), okText: tr("蒸馏完成") }));
    ops.appendChild(appState.opCard(tr("立即进入深睡"), tr("离线回想，提炼「[原则]/[路径]」并做结构整理与归档（禁直删）。预计 1–3 分钟。"), "POST /deepsleep/trigger", tr("深睡"), function() {
      return appState.apiCtx("/deepsleep/trigger", { method: "POST", body: JSON.stringify({}) }, tr("深睡")).then(function() {
        appState.statusFn(tr("✓ 已触发深睡归纳（后台执行，回执见「深度睡眠」）"));
      });
    }, { icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", confirm: tr("立即触发一次深度睡眠归纳？将调用归纳子代理回顾当天记忆痕迹。") }));
    ops.appendChild(appState.opCard(tr("运行自检"), tr("校验判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账六项；超时上限 180s。"), "POST /selfcheck/run", tr("自检"), function() {
      return appState.apiCtx("/selfcheck/run", { method: "POST", body: JSON.stringify({}) }, tr("自检")).then(function() {
        appState.statusFn(tr("✓ 自检已执行，结果见「运行观测」"));
      });
    }, { icon: "M20 6L9 17l-5-5", busyText: tr("自检中…"), confirm: tr("立即跑一次运行自检？执行期间请勿关闭面板。") }));
    view.appendChild(ops);
    var kpis = el("div", "sc-kpis");
    var kMem = UI.kpi(tr("记忆库容量"), { val: "—", sub: "MEMORY.md", pct: 0, kind: "ended" });
    var kLevel = UI.kpi(tr("蒸馏水位"), { val: "—", sub: tr("本轮蒸馏事件"), pct: 0, kind: "ended" });
    var kSleep = UI.kpi(tr("深度睡眠"), { val: "—", txt: true, sub: "—", pct: null, kind: "probing" });
    var kVec = UI.kpi(tr("向量档"), { val: tr("未启用"), sub: tr("词法召回兜底"), pct: null, kind: "ended" });
    [kMem, kLevel, kSleep, kVec].forEach(function(c) {
      kpis.appendChild(c.box);
    });
    view.appendChild(kpis);
    var cols2 = el("div", "sc-cols2");
    var gCard = UI.card(tr("本月成长"), { right: [el("span", "sc-src", "/memory/overview · growth")] });
    var sCard = UI.card(tr("系统状态"), { right: [el("span", "sc-src", "/mcl/status · /inject/stats")] });
    var colL = el("div"), colR = el("div");
    colL.appendChild(gCard.box);
    colL.appendChild(ovMorningCard());
    colL.appendChild(ovTimelineCard());
    colR.appendChild(sCard.box);
    colR.appendChild(ovCriteriaCard());
    colR.appendChild(ovQuickCard());
    cols2.appendChild(colL);
    cols2.appendChild(colR);
    view.appendChild(cols2);
    var growthBox = gCard.body;
    var sysBox = sCard.body;
    function ovStat(label, value, sub) {
      var c = el("div", "sc-mem-stat");
      c.appendChild(el("div", "sc-mem-stat-label", label));
      c.appendChild(el("div", "sc-mem-stat-value", value));
      if (sub) c.appendChild(el("div", "sc-mem-stat-sub", sub));
      return c;
    }
    appState.api("/memory/overview").then(function(r) {
      var d = r || {};
      var ds = d.distillStats || {};
      bDistill.setText(tr("蒸馏 · ") + (ds.last && ds.last.at ? ovAgo(ds.last.at) : tr("待命中"))).setKind(ds.runs || 0 ? "ended" : "running");
      if (Derive.vectorOn(d)) {
        var vp = d.vector.provider || "off";
        bVec.setText(tr("向量 ") + String(vp)).setKind(Derive.providerKind(vp, ["fusion"]));
      } else {
        bVec.setText(tr("向量 未启用")).setKind("stalled");
      }
      var pend = d.pending || {};
      bPend.setText(tr("候选 ") + String(pend.count || 0)).setKind(pend.count || 0 ? "suspect" : "ended");
      var mf = null;
      (d.indexes || []).forEach(function(f) {
        if (f.name === "MEMORY.md") mf = f;
      });
      if (mf) {
        var pct = mf.cap ? Math.round((mf.chars || 0) / mf.cap * 100) : null;
        bMem.setText(tr("记忆库 · ") + (pct === null ? tr("正常") : Derive.capKind(pct) !== "ended" ? tr("水位偏高") : tr("正常"))).setKind(pct === null ? "ended" : Derive.capKind(pct));
        kMem.set(pct === null ? Derive.num(mf.chars || 0) : pct + "%", Derive.num(mf.chars || 0) + " / " + Derive.num(mf.cap || "—") + tr(" 字符") + (Derive.count(mf.lines) ? " · " + Derive.count(mf.lines) + tr(" 行") : ""));
        kMem.fill(pct, pct === null ? "" : Derive.capKind(pct));
        if (appState.refs.navHealth) appState.refs.navHealth(pct === null ? tr("正常") : Derive.capKind(pct) !== "ended" ? tr("水位偏高") : tr("正常"), pct === null ? "ended" : Derive.capKind(pct));
      }
      var dLast = d.distill && d.distill.last;
      if (dLast && dLast.lastSeq != null) {
        kLevel.set(String(dLast.lastSeq), tr("本轮蒸馏事件 · ") + fmtTime(dLast.at));
        kLevel.fill(100, "ok");
      } else {
        kLevel.set("—", tr("尚无蒸馏事件"));
      }
      if (Derive.vectorOn(d)) {
        kVec.set(Derive.num(d.vector.cacheLines || 0), tr("行 · ") + (d.vector.provider || "—") + (d.vector.enabled === false ? tr(" · 已关闭") : tr(" · 已启用")));
        kVec.fill(null);
      }
      var g = d.growth;
      if (g) {
        if (gCard.head) {
          var subEl = gCard.head.querySelector(".sub");
          if (subEl) subEl.textContent = "· " + g.month;
        }
        var g3 = el("div", "sc-mem-grid");
        var s3 = g.sleep || {}, d3 = g.distill || {}, n3 = g.now || {};
        g3.appendChild(ovStat(tr("深睡归纳"), Derive.num(s3.passes || 0) + tr(" 次"), tr("习得 ") + Derive.num(s3.principleAdded || 0) + tr(" · 替换 ") + Derive.num(s3.replaced || 0) + tr(" · 画像 ") + Derive.num(s3.profilesAdded || 0)));
        g3.appendChild(ovStat(tr("蒸馏"), Derive.num(d3.runs || 0) + tr(" 次"), tr("成功 ") + Derive.num(d3.ok || 0) + tr(" · 异常 ") + Derive.num(d3.bad || 0) + tr(" · 预筛跳过 ") + Derive.num(d3.skips || 0)));
        g3.appendChild(ovStat(tr("AGENT 画像"), Derive.num(n3.tagRows != null ? n3.tagRows : "—") + tr(" 行"), tr("原则 ") + Derive.num(n3.principleRows || 0) + tr(" · 路径 ") + Derive.num(n3.pathRows || 0) + " · " + Derive.num(n3.agentChars || 0) + tr(" 字符")));
        growthBox.appendChild(g3);
      }
      var warn = [];
      if (pend.count) warn.push(tr("候选区 ") + pend.count + tr(" 条待裁决"));
      if ((d.queue || {}).undone) warn.push(tr("待归档会话 ") + d.queue.undone + tr(" 个"));
      if (Derive.vectorOn(d) && Derive.providerDown(d.vector.provider)) warn.push(tr("嵌入服务不可达，向量召回已降级为词法"));
      if (Derive.has(warn)) setAlert(warn.length + tr(" 项待处理"), warn.join("；"), tr("前往处理"), function() {
        appState.show("memory");
      });
      else setAlert("");
    }).catch(appState.failFn);
    appState.api("/mcl/status").then(function(m) {
      bMcl.setText(tr("认知环 ") + (m && m.active ? tr("快") + (m.fast || 0) + tr("/慢") + (m.slow || 0) : tr("未装配"))).setKind(m && m.active ? "ended" : "stalled");
    }).catch(function() {
      bMcl.setText(tr("认知环 读取失败")).setKind("stalled");
    });
    appState.api("/criteria").then(function(c) {
      bCrit.setText(tr("判据台账 · ") + (c && c.active ? tr("已就绪") : tr("不可读"))).setKind(c && c.active ? "ended" : "stalled");
      var bg = (c || {}).bankGit || {};
      bGit.setText(tr("库版本 · ") + (bg.commits || 0 ? tr("已启用") : tr("未初始化"))).setKind(bg.commits || 0 ? "ended" : "stalled");
    }).catch(function() {
      bGit.setText(tr("库版本 读取失败"));
    });
    appState.api("/deepsleep").then(function(d) {
      var st = d || {};
      var mode = st.running ? tr("深睡整理中") : st.ended || st.ended === 0 ? tr("浅睡") : "—";
      kSleep.set(mode, (st.idleMs ? tr("空闲 ") + Math.round(st.idleMs / 6e4) + tr(" 分钟 · ") : "") + (st.nextEligibleAt ? tr("下次可睡 ") + fmtTime(st.nextEligibleAt) : tr("按水位触发")), true);
    }).catch(function() {
      kSleep.set("—", tr("读取失败"), true);
    });
    Promise.all([
      appState.api("/get_root").catch(function() {
        return {};
      }),
      appState.api("/mcl/status").catch(function() {
        return {};
      }),
      appState.api("/inject/stats").catch(function() {
        return {};
      }),
      appState.api("/vector/status2").catch(function() {
        return {};
      })
    ]).then(function(rs) {
      var r0 = rs[0] || {}, m = rs[1] || {}, s = rs[2] || {}, v = rs[3] || {};
      sysBox.textContent = "";
      var root = r0.root || r0.path || r0.active || "—";
      sysBox.appendChild(ovCRow(tr("当前根目录"), String(root), [
        ovPill(r0.active ? tr("已激活") : tr("未激活"), r0.active ? "ok" : "warn")
      ]));
      var ch = m.active ? String(m.mode) === "slow" ? tr("慢通道") : tr("快通道") : tr("未装配");
      sysBox.appendChild(ovCRow(
        tr("MCL 认知环"),
        tr("熟悉度 ") + (m.familiarity != null ? m.familiarity : "—") + " · " + ch,
        [ovPill(ch, m.active ? "brand" : "warn")]
      ));
      sysBox.appendChild(ovCRow(
        tr("注入统计"),
        tr("本次会话 ") + Derive.num(s.calls || 0) + tr(" 次") + (s.lastAt ? tr(" · 最近 ") + ovAgo(s.lastAt) : "") + (s.root ? " · root=" + s.root : ""),
        [ovPill(Derive.num(s.calls || 0))]
      ));
      var sc = s.stableChannel || null;
      if (sc) {
        var okMounted = sc.mounted === true;
        var trunc = function(t) {
          var s2 = String(t);
          return s2.length > 40 ? s2.slice(0, 40) + "…" : s2;
        };
        var scReason = sc.mountErr ? trunc(sc.mountErr) : sc.lastErr ? trunc(sc.lastErr) : "";
        var scDetail = okMounted ? tr("已挂 section · 节点0豁免") + " · " + Derive.num(sc.calls || 0) + tr(" 次") + (sc.lastLen > 0 ? " · " + Derive.num(sc.lastLen) + tr(" 字符") : "") : tr("未挂载 ⇒ 随 context 注入（可压区）") + (scReason ? tr(" · 原因：") + scReason : "");
        sysBox.appendChild(ovCRow(tr("恒定面通道"), scDetail, [ovPill(okMounted ? tr("豁免") : tr("可压"), okMounted ? "ok" : "warn")]));
      }
      var bc = s.supplyUsage && s.supplyUsage.budgetClamped || null;
      if (bc && bc.length) {
        sysBox.appendChild(ovCRow(
          tr("额度夹取"),
          bc.join(" · ") + " " + tr("（你设的值越界 ⇒ 已按范围夹回，未采原值）"),
          [ovPill(tr("已夹取"), "warn")]
        ));
      }
      sysBox.appendChild(ovCRow(
        tr("嵌入服务"),
        "provider=" + String(v.provider || "off") + " · " + Derive.num(v.rows || 0) + tr(" 行"),
        [ovPill(v.present ? tr("可达") : tr("未启用"), v.present ? "ok" : "warn")]
      ));
    });
  }

  // src-client/panes-memory-detail.js
  function renderCognitionReport(view, mode) {
    appState.api("/cognition/report").then(function(r) {
      if (!r || !r.ok) return;
      var host = view;
      var box = view;
      var group = function(t) {
        if (mode === "sleep") {
          var c = UI.card(t);
          host.appendChild(c.box);
          box = c.body;
        } else {
          box.appendChild(el("div", "sc-mem-group-title", t));
        }
      };
      var sleeps = r.sleeps || [], last = Derive.has(sleeps) ? sleeps[sleeps.length - 1] : null;
      if (mode === "sleep") {
        group(tr("本轮产出回执") + (last && last.at ? " · " + fmtTime(last.at) : ""));
        if (!last) {
          box.appendChild(el("div", "sc-mem-empty", tr("（尚无深睡记录）")));
        } else {
          var kpiRow = function(defs) {
            var g = el("div", "sc-kpis");
            defs.forEach(function(d) {
              g.appendChild(UI.kpi(d[0], { val: String(d[1] == null ? 0 : d[1]), sub: d[2], plain: true }).box);
            });
            return g;
          };
          box.appendChild(kpiRow([[tr("新增原则"), last.added, "added"], [tr("替换原则"), last.replaced, "replaced"], [tr("画像更新"), last.profiles, "profiles"]]));
          box.appendChild(kpiRow([
            [tr("指针更新"), last.pointers, "pointers"],
            [tr("树操作"), last.tree, "tree"],
            [tr("归档"), last.forgetArchived, "forgetArchived"],
            [tr("保留"), last.forgetKept, "forgetKept"]
          ]));
          if (last.stop && last.stop !== "completed") {
            box.appendChild(el("div", "sc-ds-alert", tr("⚠ 上次未完成（stop=") + last.stop + tr("）——按「深睡水位护栏」水位已回滚，同批痕迹下轮重试")));
          }
        }
        var m = r.materials || {};
        group(tr("下轮材料预估") + (r.day ? " · " + r.day : ""));
        [
          [tr("遗忘候选"), tr("cold 且 ≥90 天零命中"), m.forget],
          [tr("加深候选"), "hits30 ≥ 5", m.hot],
          [tr("互抑候选"), tr("§ 名重叠 0.5–0.66"), m.interference]
        ].forEach(function(kv) {
          box.appendChild(ovCRow(kv[0], kv[1], [el("b", null, String(kv[2] == null ? 0 : kv[2]) + tr(" 条"))]));
        });
      } else {
        var ar = r.archive || [];
        if (Derive.has(ar)) {
          group(tr("归档区 notes/archive/ · ") + ar.length + tr(" 个文件（forgetOps 产物，复制回 notes/ 即恢复）"));
          box.appendChild(el("div", "sc-mem-sub", ar.map(function(x) {
            return x.file + "（" + x.chars + tr(" 字）");
          }).join(" · ")));
        }
      }
    }).catch(function() {
    });
  }
  function renderMemoryExpanded(view, data) {
    view.textContent = "";
    UI.pageHead(tr("记忆库"), tr("MEMORY.md 索引、候选、笔记与归档区，按「库 → 待消化 → 详情 → 已归档」的生命周期排序。"), { routes: ["/memory/overview", "/memory/sections", "/memory/approve"], search: { placeholder: tr("过滤索引 / 候选 / 笔记…"), onInput: appState.filterViewRows }, refresh: true });
    var cap = UI.card(tr("容量占用"), { sub: tr("写入由 write_gate 强制红线") });
    view.appendChild(cap.box);
    var capGrid = el("div", "sc-cap3");
    cap.body.appendChild(capGrid);
    cap.body.appendChild(el("div", "sc-cap-note", tr("只有存在真实容量门的载体才给百分比与进度条：MEMORY.md（cap_memory）与画像（cap_user / cap_agent）；notes / pending 无容量门 ⇒ 只报绝对量。是否因超限**阻断**写入由「参数调节 → 记忆与容量」的容量门开关决定（缺省关闭 = 照写并留一条 capacity-over 留痕）。")));
    if (!data || !data.present) {
      appState.statusFn(data && data.error || tr("记忆库不可用"));
      return;
    }
    var memoryFile = null;
    (data.indexes || []).forEach(function(f) {
      if (f.name === "MEMORY.md") memoryFile = f;
    });
    var pM1 = el("div");
    var pM2 = el("div");
    var pM3 = el("div");
    var pM4 = el("div");
    var pM5 = el("div");
    var _tb = UI.tabs("memory", [
      { id: "index", label: tr("知识索引 ") + String(Derive.count(memoryFile && memoryFile.lines)), pane: pM1 },
      { id: "pending", label: tr("候选区 ") + String((data.pending || {}).count || 0), pane: pM2 },
      { id: "notes", label: tr("笔记 ") + String(Derive.count(data.notes)) + tr(" 类"), pane: pM3 },
      /* v9（原型第 4 枚 Tab）：归档区。面板此前无此 Tab（上轮"无独立数据源"未造）——
       * 数据其实来自 `/cognition/report` 的 `archive:[{file,chars}]`，本轮补齐。 */
      { id: "archive", label: tr("归档区"), pane: pM5 },
      { id: "growth", label: tr("统计"), pane: pM4 }
    ]);
    cap.body.appendChild(_tb.box);
    var ds = data.distillStats;
    var mkCapItem = function(label, value, sub, pct, kind) {
      var it = el("div", "sc-cap-item");
      it.appendChild(el("div", "sc-cap-top", label));
      it.appendChild(el("div", "sc-cap-val", value));
      it.appendChild(el("div", "sc-cap-sub", sub || ""));
      var track = el("div", "sc-cap-track" + (pct === null || pct === void 0 ? " na" : ""));
      var bar = el("i", kind || "");
      if (pct !== null && pct !== void 0) bar.style.setProperty("--sc-pct", pct + "%");
      track.appendChild(bar);
      it.appendChild(track);
      return it;
    };
    var pMeta0 = data.pending || {};
    capGrid.textContent = "";
    (function fillCap() {
      var mf = memoryFile;
      var pct = mf && mf.cap ? Math.round((mf.chars || 0) / mf.cap * 100) : null;
      capGrid.appendChild(mkCapItem(
        "MEMORY.md 容量",
        pct === null ? Derive.num(mf ? mf.chars : "—") : pct + "%",
        mf ? Derive.num(mf.chars) + " / " + Derive.num(mf.cap) + " 字符 · " + Derive.count(mf.lines) + " 条" : "—",
        pct,
        pct === null ? "" : Derive.capKind(pct)
      ));
      var secCount = 0;
      (data.notes || []).forEach(function(nf) {
        secCount += Derive.count(nf.sections);
      });
      capGrid.appendChild(mkCapItem(
        "notes · 笔记",
        Derive.num(Derive.count(data.notes)),
        "个文件 · " + Derive.num(secCount) + " 个小节 · 无容量门",
        null
      ));
      capGrid.appendChild(mkCapItem(
        "pending 候选",
        Derive.num(pMeta0.count || 0),
        "条待裁决 · 无容量门（ADD-only 暂存）",
        null
      ));
    })();
    if (appState.refs.navHealth) {
      var navPct = memoryFile && memoryFile.cap ? Math.round((memoryFile.chars || 0) / memoryFile.cap * 100) : null;
      appState.refs.navHealth(navPct === null ? tr("正常") : Derive.capKind(navPct) !== "ended" ? tr("水位偏高") : tr("正常"), navPct === null ? "ended" : Derive.capKind(navPct));
    }
    renderCognitionReport(_tb.pane("growth"), "memory");
    var ctx = { _tb, data, view, memoryFile, cap };
    mmGrowthMonth(ctx);
    mmIndexRows(ctx);
    mmPendingRows(ctx);
    mmNotesChips(ctx);
    mmArchiveZone(ctx);
    mmSuiteZone(ctx);
    mmGrowthDelta(ctx);
    appState.statusFn(tr("记忆 · MEMORY ") + (memoryFile ? Derive.num(memoryFile.chars) + "/" + Derive.num(memoryFile.cap) + " · " + Derive.count(memoryFile.lines) + tr(" 行") : tr("不可用")) + tr(" · 蒸馏 ") + (ds ? Derive.num(ds.runs || 0) + tr(" 次") : "—"));
    appState.flushFolds();
  }
  var mkStat = function(label, value, sub) {
    var card = el("div", "sc-mem-stat");
    card.appendChild(el("div", "sc-mem-stat-label", label));
    card.appendChild(el("div", "sc-mem-stat-value", value));
    if (sub) card.appendChild(el("div", "sc-mem-stat-sub", sub));
    return card;
  };
  function mmGrowthMonth(ctx) {
    var host = ctx._tb.pane("growth");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t) {
      host.appendChild(el("div", "sc-mem-group-title", t));
    };
    var gGrowth = data.growth;
    if (gGrowth) {
      group(tr("本月成长 · ") + gGrowth.month);
      var g3 = el("div", "sc-mem-grid");
      var s3 = gGrowth.sleep || {}, d3 = gGrowth.distill || {}, n3 = gGrowth.now || {};
      g3.appendChild(mkStat(tr("深睡归纳"), String(s3.passes || 0) + tr(" 次"), tr("习得 ") + String(s3.principleAdded || 0) + tr(" · 替换 ") + String(s3.replaced || 0) + tr(" · 画像 ") + String(s3.profilesAdded || 0)));
      g3.appendChild(mkStat(tr("蒸馏"), String(d3.runs || 0) + tr(" 次"), tr("成功 ") + String(d3.ok || 0) + tr(" · 异常 ") + String(d3.bad || 0) + tr(" · 预筛跳过 ") + String(d3.skips || 0)));
      g3.appendChild(mkStat(tr("AGENT 画像"), String(n3.tagRows != null ? n3.tagRows : "—") + tr(" 行"), tr("原则 ") + String(n3.principleRows || 0) + tr(" · 路径 ") + String(n3.pathRows || 0) + " · " + String(n3.agentChars || 0) + tr(" 字符")));
      host.appendChild(g3);
      var rds = gGrowth.recentDeep || [];
      if (Derive.has(rds)) {
        host.appendChild(el("div", "sc-mem-group-title", tr("本月有效深睡产出")));
        var dl3 = el("div", "sc-idx-list");
        rds.forEach(function(r) {
          dl3.appendChild(el("div", "sc-mem-sub", String(r.at || "").slice(0, 10) + tr("  原则 +") + String(r.added || 0) + tr("/替换 ") + String(r.replaced || 0) + tr(" · 画像 +") + String(r.profiles || 0) + " · gate=" + String(r.gate || "")));
        });
        host.appendChild(dl3);
      } else if ((s3.passes || 0) > 0) {
        host.appendChild(el("div", "sc-mem-empty", tr("本月深睡有运行但无产出（内容判据合规保守：材料不足宁缺毋滥）")));
      }
    }
  }
  function fmtBytesOf(n) {
    var v = Number(n) || 0;
    if (v < 1024) return v + " B";
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
    return (v / 1048576).toFixed(1) + " MB";
  }
  function mmIndexRows(ctx) {
    var host = ctx._tb.pane("index");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t) {
      host.appendChild(el("div", "sc-mem-group-title", t));
    };
    var st5 = data.structure;
    if (st5 && Derive.has(st5.entries)) {
      var s5 = st5.summary || {};
      group(tr("库内结构 · ") + Derive.count(st5.entries) + tr(" 个顶层条目（内容 ") + String(s5.content || 0) + tr(" · 工具态 ") + String(s5.tooling || 0) + tr(" · 产物 ") + String(s5.artifact || 0) + "）");
      var kindLabelOf = function(k) {
        if (k === "content") return tr("内容");
        if (k === "tooling") return tr("工具态");
        return tr("产物");
      };
      ["content", "artifact", "tooling"].forEach(function(kind) {
        var list = (st5.entries || []).filter(function(e) {
          return e.kind === kind;
        });
        if (!Derive.has(list)) return;
        if (kind !== "content") {
          host.appendChild(el("div", "sc-mem-sub", kindLabelOf(kind) + tr("（只报计数，不展开）：") + list.map(function(e) {
            return e.name + " " + Derive.count(e.files) + tr(" 件");
          }).join(" · ")));
          return;
        }
        host.appendChild(el("div", "sc-mem-sub", tr("内容档（承载知识的板块）")));
        var box = el("div", "sc-idx-list");
        list.forEach(function(e) {
          var row = el("div", "sc-idx-row");
          row.appendChild(el("span", "sc-idx-tag", e.doc ? tr("文档") : tr("板块")));
          row.appendChild(el("span", "sc-idx-subject", e.name));
          var sizeTxt = Number(e.bytes) > 0 ? Derive.count(e.files) + tr(" 件 · ") + fmtBytesOf(e.bytes) : Derive.count(e.files) + tr(" 件");
          row.appendChild(el("span", "sc-idx-pointer", sizeTxt));
          box.appendChild(row);
        });
        host.appendChild(box);
        host.appendChild(el("div", "sc-desc", tr("口径：目录为递归文件数；工具态档（.git/.obsidian/scripts 等）**只报文件数不报体量**（.git 递归可达数十 MB，会把「库有多大」这个读数污染）。枚举由后端 readdirSync 派生，未登记的新条目默认落内容档（宁可多报不静默丢）。")));
      });
    }
    if (Derive.has(memoryFile && memoryFile.lines)) {
      group(tr("知识索引 MEMORY.md · ") + memoryFile.lines.length + tr(" 条"));
      host.appendChild(el("div", "sc-desc", tr("点击行直达 notes 详情小节（只读）。")));
      var idxWrap = el("div");
      idxWrap.classList.add("sc-box");
      var IDX_PREVIEW = 8;
      var allLines = memoryFile.lines || [];
      renderIndexRows(idxWrap, allLines.slice(0, IDX_PREVIEW), renderMemoryExpanded);
      if (allLines.length > IDX_PREVIEW) {
        var moreBtn = el("button", "sc-idx-more", tr("展开全部 ") + allLines.length + tr(" 条"));
        moreBtn.type = "button";
        moreBtn.addEventListener("click", function() {
          idxWrap.textContent = "";
          renderIndexRows(idxWrap, allLines, renderMemoryExpanded);
        });
        idxWrap.appendChild(moreBtn);
      }
      host.appendChild(idxWrap);
    }
  }
  function mmPendingRows(ctx) {
    var host = ctx._tb.pane("pending");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t) {
      host.appendChild(el("div", "sc-mem-group-title", t));
    };
    var groups = [
      { root: "suite", src: data.suite && data.suite.pending || null },
      { root: "flow-candidates", src: data.suite && data.suite.flowCandidates || null },
      { root: "memory", src: data.pending || null }
    ];
    var labelOfRoot = function(r) {
      if (r === "suite") return tr("suite · knowledge/pending");
      if (r === "flow-candidates") return tr("suite · flow-candidates");
      return tr("记忆库 · pending");
    };
    var numOf = function(v) {
      return typeof v === "number" && v > 0 ? v : 0;
    };
    var total = 0;
    groups.forEach(function(g) {
      if (g.src) total += numOf(g.src.count);
    });
    if (total > 0) {
      group(tr("候选区 · ") + total + tr(" 条（双根合并）"));
      groups.forEach(function(g) {
        var n = g.src ? numOf(g.src.count) : 0;
        if (!n) return;
        host.appendChild(el("div", "sc-mem-sub", labelOfRoot(g.root) + " · " + n + tr(" 条")));
        var plist = el("div", "sc-pointer-list");
        (g.src.recent || []).forEach(function(p2) {
          var fname = String(p2.name || "");
          var row = makeMemoryPointerRow(fname.replace(/\.md$/, ""), null, (p2.mtime || "").slice(0, 10));
          var act = el("div", "sc-row-gap");
          var okBtn = el("button", "sc-btn subtle", tr("批准"));
          okBtn.type = "button";
          okBtn.classList.add("sc-btn-xs", "sc-btn-ok");
          okBtn.addEventListener("click", function() {
            appState.api("/memory/approve", { method: "POST", body: JSON.stringify({ pendingFile: fname, root: g.root, action: "approve" }) }).then(function(r) {
              appState.statusFn(tr("✓ 已批准 ") + fname + tr("（移 ") + (r && r.moved || ".processed") + tr("，内容由蒸馏正常入册）"));
            }).catch(appState.failFn);
          });
          var rmBtn = UI.button(tr("忽略"), function() {
            return appState.api("/memory/approve", { method: "POST", body: JSON.stringify({ pendingFile: fname, root: g.root, action: "ignore" }) }).then(function(r) {
              appState.statusFn(tr("已忽略 ") + fname + tr("（移 ") + (r && r.moved || ".ignored") + tr("，不入册）"));
            });
          }, { danger: true, async: true, busyText: tr("忽略中…"), okText: tr("已忽略"), confirm: tr("忽略并移出候选队列（移入 .ignored，不入册）：") + fname + "？" });
          act.appendChild(okBtn);
          act.appendChild(rmBtn);
          row.appendChild(act);
          plist.appendChild(row);
        });
        host.appendChild(plist);
        var shown = Derive.count(g.src.recent);
        if (n > shown) host.appendChild(el("div", "sc-desc", tr("（本根仅显示最近 ") + shown + tr(" 条，共 ") + n + tr(" 条）")));
      });
      host.appendChild(el("div", "sc-desc", tr("共 ") + total + tr(" 条 · 批准=确认有价值入册（移 .processed），忽略=移出队列（移 .ignored，不入册）")));
      var pTip = el("div", "sc-ds-alert info");
      pTip.appendChild(el("div", null, tr("升格 / 降格走 /memory/approve，由 L0 判据裁决。索引行只读，正文编辑走 /memory/section-edit。")));
      host.appendChild(pTip);
    } else {
      host.appendChild(el("div", "sc-mem-empty", tr("暂无候选（已查 记忆库 / suite / flow-candidates 三处）")));
    }
  }
  function mmNotesChips(ctx) {
    var host = ctx._tb.pane("notes");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t) {
      host.appendChild(el("div", "sc-mem-group-title", t));
    };
    group(tr("notes 详情小节"));
    var nw = el("div", "sc-notes-list");
    (data.notes || []).forEach(function(nf) {
      var chip = el("div", "sc-note-chip");
      chip.appendChild(el("span", null, nf.name));
      chip.appendChild(el("span", "sc-tag", String(nf.sections.length)));
      chip.title = nf.rel + " · " + nf.sections.map(function(s) {
        return s.title;
      }).join(" / ");
      chip.addEventListener("click", function() {
        appState.memoryViewScroll = view.scrollTop;
        appState.noteReturnRender = null;
        appState.api("/memory/sections?rel=" + encodeURIComponent(nf.rel)).then(function(r) {
          renderNoteSections(view, r);
        }).catch(appState.failFn);
      });
      nw.appendChild(chip);
    });
    host.appendChild(nw);
  }
  function mmArchiveZone(ctx) {
    var host = ctx._tb.pane("archive");
    host.appendChild(el("div", "sc-mem-group-title", tr("归档区 notes/archive/")));
    var list = el("div");
    host.appendChild(list);
    list.appendChild(el("div", "sc-desc", tr("读取中…")));
    appState.api("/cognition/report").then(function(r) {
      var ar = r && r.archive || [];
      var tabsEls = ctx._tb.box.querySelectorAll("wa-tab,.sc-tabbtn,[data-host-tab]");
      if (tabsEls[3]) tabsEls[3].textContent = tr("归档区 ") + ar.length;
      list.textContent = "";
      if (!Derive.has(ar)) list.appendChild(el("div", "sc-desc", tr("暂无归档条目。")));
      else ar.forEach(function(a) {
        list.appendChild(ovCRow(
          String(a.file || "—"),
          tr("notes/archive/ · 仅归档不删除"),
          [ovPill(Derive.num(a.chars || 0) + tr(" 字符"))]
        ));
      });
      var tip = el("div", "sc-ds-alert ok");
      tip.appendChild(el("div", null, tr("主动遗忘只归档、不删除 —— applyForgetOps 禁直删，热节与画像节有守卫。") + tr("如需恢复，把 notes/archive/ 下的文件移回 notes/ 即可（面板不提供写入口）。")));
      host.appendChild(tip);
    }).catch(function() {
      list.textContent = "";
      list.appendChild(el("div", "sc-desc", tr("归档区读取失败（/cognition/report）。")));
    });
  }
  function mmSuiteZone(ctx) {
    var host = ctx._tb.pane("index");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t) {
      host.appendChild(el("div", "sc-mem-group-title", t));
    };
    var suite = data.suite;
    if (suite && suite.present) {
      group(tr("守藏本地知识区 · suite/knowledge"));
      var sMemory = null;
      (suite.indexes || []).forEach(function(f) {
        if (f.name === "MEMORY.md") sMemory = f;
      });
      host.appendChild(el("div", "sc-desc", tr("守藏蒸馏器事实源（ADR-0002）：MEMORY ") + (sMemory ? Derive.num(sMemory.chars) + "/" + Derive.num(sMemory.cap) + " · " + Derive.count(sMemory.lines) + tr(" 行") : "—") + " · pending " + String(suite.pending ? suite.pending.count : 0) + tr(" 条。")));
      if (Derive.has(suite.notes)) {
        var snw = el("div", "sc-notes-list");
        suite.notes.forEach(function(nf) {
          var chip = el("div", "sc-note-chip");
          chip.appendChild(el("span", null, nf.name));
          chip.appendChild(el("span", "sc-tag", String(nf.sections.length)));
          chip.title = "suite · " + nf.rel + " · " + nf.sections.map(function(s) {
            return s.title;
          }).join(" / ");
          chip.addEventListener("click", function() {
            appState.memoryViewScroll = view.scrollTop;
            appState.noteReturnRender = null;
            appState.api("/memory/sections?rel=" + encodeURIComponent(nf.rel) + "&root=suite").then(function(r) {
              renderNoteSections(view, r);
            }).catch(appState.failFn);
          });
          snw.appendChild(chip);
        });
        host.appendChild(snw);
      }
    } else {
      host.appendChild(el("div", "sc-mem-empty", tr("守藏本地知识区未启用（suite/knowledge 不存在）")));
    }
  }
  function mmGrowthDelta(ctx) {
    var host = ctx._tb.pane("growth");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t) {
      host.appendChild(el("div", "sc-mem-group-title", t));
    };
    if (data.delta && data.delta.present && Derive.has(data.delta.rows)) {
      group(tr("最近成长 delta · 深睡产出"));
      var dl8 = el("div", "sc-idx-list");
      data.delta.rows.forEach(function(row) {
        var r8 = el("div", "sc-idx-row");
        r8.appendChild(el("span", "sc-idx-subject", String(row).replace(/^\[/, "[")));
        dl8.appendChild(r8);
      });
      host.appendChild(dl8);
      var staleNote = "";
      if (data.delta.staleAt) {
        try {
          var remain = Math.max(0, new Date(data.delta.staleAt) - Date.now());
          staleNote = tr(" · 剩余 ") + Math.ceil(remain / 36e5) + tr("h 有效");
        } catch (e) {
        }
      }
      host.appendChild(el("div", "sc-mem-sub muted", tr("本次深睡归纳产出（48h 有效") + staleNote + tr("）· 已在会话注入可见")));
    }
    if (data.weekDiff && (data.weekDiff.deepAdded || 0) > 0) {
      group(tr("本周成长 · 增量"));
      var g9 = el("div", "sc-mem-grid");
      g9.appendChild(mkStat(tr("深睡新习得"), String(data.weekDiff.deepAdded || 0) + tr(" 条"), tr("近 7 天 [原则]/[路径] 归纳")));
      host.appendChild(g9);
    }
  }
  function secFoldKey(rel, path, title) {
    return "note:" + (rel || "") + ":" + (path || "") + "§" + (title || "");
  }
  function renderNoteSections(view, data) {
    if (!data || !data.present || !data.sections) {
      appState.statusFn(data && data.error || tr("无小节"));
      return;
    }
    view.textContent = "";
    UI.pageHead(data.name, (data.root === "suite" ? tr("suite 知识区 · ") : "") + data.rel + " · " + data.sections.length + tr(" 个小节（白名单只读）"));
    var back = el("button", "sc-btn subtle", tr("← 返回") + (appState.noteReturnRender === renderPersona ? tr("画像板块") : data.root === "suite" ? tr("守藏知识区") : tr("记忆库")));
    back.type = "button";
    back.addEventListener("click", function() {
      var backRender = appState.noteReturnRender || renderMemoryExpanded;
      appState.api("/memory/overview").then(function(r) {
        backRender(view, r);
        requestAnimationFrame(function() {
          view.scrollTop = appState.memoryViewScroll;
        });
      }).catch(appState.failFn);
    });
    view.appendChild(back);
    view.scrollTop = 0;
    if (Derive.has(data.backrefs)) {
      var bl = el("div");
      bl.appendChild(el("div", "sc-mem-group-title", tr("被引用 · ") + data.backrefs.length));
      var bList = el("div", "sc-idx-list");
      data.backrefs.slice(0, 8).forEach(function(br) {
        var row = el("div", "sc-idx-row");
        row.appendChild(el("span", "sc-idx-tag", String(br.from || "").split("/").pop()));
        row.appendChild(el("span", "sc-idx-subject", String(br.line || "").slice(0, 90)));
        row.title = br.line || "";
        bList.appendChild(row);
      });
      bl.appendChild(bList);
      if (data.backrefs.length > Derive.BACKREF_LIMIT) bl.appendChild(el("div", "sc-mem-sub muted", tr("… 共 ") + data.backrefs.length + tr(" 处引用")));
      view.appendChild(bl);
    }
    function renderSecNode(sec, depth, container, path) {
      var pad = Math.min(depth, 4) * 14;
      var hasKids = !!(sec.children && sec.children.length);
      var key = secFoldKey(data.rel, path, sec.title);
      var head = el("div", "sc-mem-group-title" + (depth > 0 ? " sub" : ""));
      var arrow = el("span", "sc-sec-arrow");
      head.appendChild(arrow);
      head.appendChild(document.createTextNode(sec.title));
      head.title = tr("点击展开/收起") + (depth > 0 ? tr("（子树）") : "");
      head.classList.add("sc-card-head");
      head.setAttribute("data-fold-key", key);
      if (pad) head.style.setProperty("--sc-indent", pad + "px");
      var body = el("div", "sc-card-body");
      body.textContent = sec.body || (hasKids ? "" : tr("（空小节）"));
      var editSec = el("button", "sc-btn subtle sc-edit-sec", tr("✎ 编辑此小节"));
      editSec.type = "button";
      if (pad) editSec.style.setProperty("--sc-indent", pad + "px");
      editSec.addEventListener("click", function() {
        editNoteSection(data, sec, view);
      });
      var kidsWrap = el("div");
      function paint(open) {
        body.classList.toggle("sc-hidden", !open);
        editSec.classList.toggle("sc-hidden", !open);
        kidsWrap.classList.toggle("sc-hidden", !open || !hasKids);
        arrow.textContent = open ? "▾" : "▸";
        head.classList.toggle("sc-on", open);
      }
      paint(Fold.get(key, false));
      head.addEventListener("click", function() {
        paint(Fold.toggle(key, false));
      });
      var off = Bus.on("fold", function(p) {
        if (!head.isConnected && !body.isConnected) {
          off();
          return;
        }
        if (p && p.key === key) paint(Fold.get(key, false));
      });
      container.appendChild(head);
      container.appendChild(body);
      container.appendChild(editSec);
      if (hasKids) {
        var kidPath = (path ? path + "/" : "") + sec.title;
        (sec.children || []).forEach(function(c) {
          renderSecNode(c, depth + 1, kidsWrap, kidPath);
        });
        container.appendChild(kidsWrap);
      }
    }
    (data.sections || []).forEach(function(sec) {
      renderSecNode(sec, 0, view, "");
    });
    appState.statusFn(data.rel + " · " + Derive.count(data.sections) + tr(" 顶层小节（树状，点击逐层展开；编辑在节点细节）"));
  }
  function editNoteSection(data, sec, view) {
    if (!data || !data.rel || !sec) return;
    var bodyTxt = sec.body || "";
    var ta = el("textarea", "sc-input sc-ta");
    ta.value = bodyTxt;
    var wrap = el("div");
    wrap.appendChild(el("div", "sc-desc", tr("编辑 §") + sec.title + tr(" 正文（") + data.rel + tr("）——保留开头摘要行最佳；保存走写门（备份+容量红线），索引指针不变。")));
    wrap.appendChild(ta);
    var bar = el("div", "sc-toolbar");
    var saveBtn = el("button", "sc-btn", tr("保存正文"));
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function() {
      var next = ta.value.trim();
      if (!next) {
        appState.statusFn(tr("正文不能为空——如需清空请用删除"));
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = tr("保存中…");
      appState.api("/memory/section-edit", { method: "POST", body: JSON.stringify({ rel: data.rel, section: sec.title, newBody: next }) }).then(function() {
        appState.statusFn("✓ §" + sec.title + tr(" 正文已保存（write_gate 通过）"));
        appState.api("/memory/sections?rel=" + encodeURIComponent(data.rel) + (data.root === "suite" ? "&root=suite" : "")).then(function(r) {
          renderNoteSections(view, r);
        }).catch(appState.failFn);
      }).catch(function(e) {
        saveBtn.disabled = false;
        saveBtn.textContent = tr("保存正文");
        appState.failFn(e);
      });
    });
    var cancelBtn = el("button", "sc-btn subtle", tr("取消"));
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", function() {
      view.removeChild(wrap);
    });
    bar.appendChild(saveBtn);
    bar.appendChild(cancelBtn);
    wrap.appendChild(bar);
    view.appendChild(wrap);
  }

  // src-client/panes-config.js
  function renderViewRoots(view, rootListWrap) {
    view.textContent = "";
    UI.pageHead(tr("守藏根目录"), tr("指向含 shoucang.config.yaml 的工作区目录。该目录本身即为 Obsidian 兼容 vault（Markdown + frontmatter + [[双链]]），可用 Obsidian 直接打开。"), { routes: ["/roots", "/get_root", "/root/bootstrap"] });
    var listWrap = el("div");
    rootListWrap(listWrap);
    view.appendChild(listWrap);
    var addItem = el("div", "setting-item");
    var info = el("div", "setting-item-info");
    info.appendChild(el("div", "setting-item-name", tr("添加根目录")));
    info.appendChild(el("div", "setting-item-desc", tr("绝对路径，须包含 shoucang.config.yaml")));
    var input = el("input", "sc-input");
    input.placeholder = tr("请输入 vault 的绝对路径");
    var btn = el("button", "sc-btn", tr("添加并启用"));
    btn.onclick = function() {
      var p = input.value.trim();
      if (!p) return;
      appState.api("/set_root", { method: "POST", body: JSON.stringify({ path: p }) }).then(function() {
        input.value = "";
        appState.statusFn(tr("✓ 根目录已启用"));
        appState.refreshView();
      }).catch(appState.failFn);
    };
    addItem.appendChild(info);
    addItem.appendChild(input);
    addItem.appendChild(btn);
    view.appendChild(addItem);
    function draw(r) {
      listWrap.textContent = "";
      if (!Derive.has(r.roots)) {
        var empty = el("div", "setting-item");
        empty.appendChild(el("div", "setting-item-desc", tr("尚未登记任何根目录——在上方输入路径添加。")));
        listWrap.appendChild(empty);
        return;
      }
      r.roots.forEach(function(root) {
        var item = el("div", "setting-item sc-rootitem" + (root.id === r.active ? " active" : ""));
        var dot = el("span", "sc-dot" + (root.id === r.active ? " on" : ""));
        void dot;
        item.appendChild(dot.cloneNode ? dot : dot);
        item.appendChild(el("span", "sc-rootname", root.name));
        item.appendChild(el("span", "sc-rootpath", root.path)).title = root.path;
        var useBtn = el("button", "sc-btn subtle", root.id === r.active ? tr("当前") : tr("启用"));
        if (root.id === r.active) useBtn.disabled = true;
        else useBtn.onclick = function() {
          appState.api("/set_root", { method: "POST", body: JSON.stringify({ path: root.path }) }).then(function() {
            appState.statusFn(tr("✓ 已启用 ") + root.name);
            appState.refreshView();
          }).catch(appState.failFn);
        };
        item.appendChild(useBtn);
        listWrap.appendChild(item);
      });
    }
    renderViewRoots._draw = draw;
  }
  function renderViewYaml(view, ta, saveRow) {
    view.textContent = "";
    UI.pageHead(tr("配置原文"), tr("直接编辑 shoucang.config.yaml 全文。保存时原文件自动备份为 .bak-时间戳。"), { routes: ["/config", "/save"] });
    ta.id = "sc-yaml";
    ta.spellcheck = false;
    view.appendChild(ta);
    saveRow.className = "setting-item";
    var spacer = el("div", "setting-item-info");
    saveRow.appendChild(spacer);
    saveRow.appendChild(saveRow._btn = el("button", "sc-btn", tr("保存")));
    view.appendChild(saveRow);
    view.appendChild(el("div", "sc-mem-group-title", tr("最近改动（5 条）")));
    var recentBox = el("div", "sc-recent");
    recentBox.appendChild(el("div", "sc-recent-row", tr("读取中…")));
    view.appendChild(recentBox);
    appState.api("/config/recent").then(function(r) {
      recentBox.textContent = "";
      var cfg = r && r.configMtime ? tr("配置文件改动：") + fmtTime(r.configMtime) : tr("配置文件尚无记录");
      recentBox.appendChild(el("div", "sc-recent-row", cfg));
      var items = r && r.recent || [];
      if (!Derive.has(items)) {
        recentBox.appendChild(el("div", "sc-recent-row", tr("记忆库尚无 git 快照（写入一次即出现）")));
        return;
      }
      items.forEach(function(it) {
        var row = el("div", "sc-recent-row");
        row.appendChild(el("span", "sc-recent-at", it.at ? fmtTime(it.at) : "-"));
        row.appendChild(el("span", "sc-recent-msg", it.msg || ""));
        row.title = it.msg || "";
        recentBox.appendChild(row);
      });
    }).catch(function() {
      recentBox.textContent = "";
      recentBox.appendChild(el("div", "sc-recent-row", tr("读取失败（/config/recent）")));
    });
  }
  function renderConfigRaw(host) {
    var rootSection = el("div");
    var yamlSection = el("div");
    var ta = document.createElement("textarea");
    appState.refs.ta = ta;
    var saveRow = el("div");
    renderViewRoots(rootSection, function(w) {
      appState.refs.rootListWrap = w;
    });
    renderViewYaml(yamlSection, ta, saveRow);
    host.appendChild(rootSection);
    host.appendChild(yamlSection);
    appState.api("/roots").then(function(r) {
      if (renderViewRoots._draw) renderViewRoots._draw(r);
    }).catch(appState.failFn);
    if (saveRow._btn) {
      saveRow._btn.onclick = function() {
        appState.api("/save", { method: "POST", body: JSON.stringify({ text: ta.value }) }).then(function() {
          appState.statusFn(tr("✓ 已保存，原文件已备份为 .bak-*"));
        }).catch(appState.failFn);
      };
    }
    appState.api("/config").then(function(r) {
      ta.value = r.text || "";
      if (!r.text) appState.statusFn(r.error === "no-active-root" ? tr("未激活根目录——请在「高级 · 根目录」区添加。") : r.error || "");
    }).catch(appState.failFn);
  }

  // src-client/panes-arch.js
  function renderFacts(host, obj, depth) {
    var d = depth || 0;
    if (obj === null || obj === void 0) {
      host.appendChild(el("div", "sc-desc", "—"));
      return;
    }
    if (typeof obj !== "object") {
      host.appendChild(el("div", "sc-desc", String(obj)));
      return;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        host.appendChild(el("div", "sc-desc", tr("（空）")));
        return;
      }
      var rows = obj.slice(0, 12);
      rows.forEach(function(it) {
        if (it && typeof it === "object") {
          var sub = el("div", "sc-facts-row");
          var line = Object.keys(it).slice(0, 6).map(function(k) {
            return k + "=" + String(it[k]).slice(0, 40);
          }).join(" · ");
          sub.appendChild(el("div", "sc-desc", line));
          host.appendChild(sub);
        } else host.appendChild(el("div", "sc-desc", "· " + String(it)));
      });
      if (obj.length > rows.length) host.appendChild(el("div", "sc-desc", tr("… 另有 ") + (obj.length - rows.length) + tr(" 条")));
      return;
    }
    var pairs = [];
    Object.keys(obj).forEach(function(k) {
      var v = obj[k];
      if (v === null || v === void 0) pairs.push([k, "—"]);
      else if (typeof v === "object") {
        if (Array.isArray(v)) pairs.push([k, "[" + v.length + tr(" 条]")]);
        else pairs.push([k, "{" + Object.keys(v).length + tr(" 键}")]);
      } else pairs.push([k, String(v)]);
    });
    try {
      host.appendChild(UI.kv(pairs));
    } catch (e) {
      host.appendChild(el("div", "sc-desc", JSON.stringify(obj).slice(0, 400)));
    }
    if (d < 1) {
      Object.keys(obj).forEach(function(k) {
        var v = obj[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          host.appendChild(el("div", "sc-sub", k));
          renderFacts(host, v, d + 1);
        } else if (Array.isArray(v) && v.length && typeof v[0] === "object") {
          host.appendChild(el("div", "sc-sub", k + "（" + v.length + tr(" 条）")));
          renderFacts(host, v, d + 1);
        }
      });
    }
  }
  function rawDetails(host, obj) {
    var det = document.createElement("details");
    det.appendChild(el("summary", "sc-desc", tr("原始 JSON")));
    var pre = el("pre", "sc-code", JSON.stringify(obj, null, 2));
    det.appendChild(pre);
    host.appendChild(det);
  }
  function renderViewArch(view) {
    view.textContent = "";
    var safeFail = function(e) {
      var msg = e && (e.message || e.error) ? String(e.message || e.error) : tr("取数失败（端点不可达或返回非 JSON）");
      try {
        host.appendChild(el("div", "sc-desc", "⚠ " + msg));
      } catch (_) {
      }
    };
    var guard = function(path) {
      return function() {
        try {
          host.appendChild(el("div", "sc-desc", "⚠ " + path + tr(" 取数失败（端点不可达）")));
        } catch (_) {
        }
      };
    };
    var host = view;
    try {
      renderArchBody(view, safeFail);
    } catch (e) {
      view.appendChild(el("div", "sc-desc", tr("⚠ 架构视图渲染失败：") + String(e && e.message || e)));
    }
  }
  function renderArchBody(view, safeFail) {
    var fail = safeFail;
    var fail = function() {
    };
    UI.pageHead(tr("架构"), tr("重构后的事实面与旋钮：内容环 KPI · 记录层对账与自证 · 统一台账与 legacy 流 · 装配根就绪度 · 断言图 · 认知环参数。数据全部来自只读端点，唯一写入口是认知环旋钮（白名单补丁）。"), {
      routes: ["/rings", "/arch/records", "/arch/graph", "/arch/observability", "/arch/assembly", "/mcl/config"],
      refresh: true
    });
    var ops = el("div", "sc-opgrid");
    ops.appendChild(appState.opCard(tr("内容环与台账"), tr("五环 KPI 与环事件对账 + 统一台账按 type 分布（缺 `at` 行数 = 信封完整性）。"), "GET /rings · /arch/observability", tr("看观测"), function() {
      tb.select("obs");
      return Promise.resolve();
    }, { icon: "M3 12h4l2.5-6 4 13L16 12h5", okText: tr("已切到「观测」") }));
    ops.appendChild(appState.opCard(tr("认知环旋钮"), tr("熟悉度阈值 / 再引导上限 / 材料预算 / topK / 材料去向（P2b）/ REM —— 白名单补丁写 scheduler.json。"), "GET|POST /mcl/config", tr("去调参"), function() {
      tb.select("mcl");
      return Promise.resolve();
    }, { icon: "M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M2 14h4|M10 8h4|M18 16h4", okText: tr("已切到「认知环旋钮」") }));
    ops.appendChild(appState.opCard(tr("重取架构快照"), tr("重新拉取记录层 / 断言图 / 观测 / 装配四个只读端点（各页签同时刷新）。"), "GET /arch/*", tr("刷新"), function() {
      renderArchBody(view, safeFail);
      return Promise.resolve();
    }, { icon: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1", busyText: tr("取数中…"), okText: tr("已刷新") }));
    view.appendChild(ops);
    var kpis = el("div", "sc-kpis");
    var kRec = UI.kpi(tr("记忆记录"), { val: "—", sub: "store census", pct: 0, kind: "ended" });
    var kPar = UI.kpi(tr("载体对账"), { val: "—", sub: tr("md ↔ store 逐件"), pct: 0, kind: "ended" });
    var kSelf = UI.kpi(tr("写时自证"), { val: "—", sub: tr("可还原 / 分歧"), pct: 0, kind: "ended" });
    var kAsm = UI.kpi(tr("装配面"), { val: "—", sub: tr("惰性桥 / 新架构模块"), pct: 0, kind: "ended" });
    [kRec, kPar, kSelf, kAsm].forEach(function(c) {
      kpis.appendChild(c.box);
    });
    view.appendChild(kpis);
    var pane = function(text) {
      var p = el("div");
      p.appendChild(el("div", "sc-desc", text));
      return p;
    };
    var pRings = pane(tr("读取中…若长期如此说明 /rings 端点不可达"));
    var pRec = pane(tr("读取中…若长期如此说明 /arch/records · /arch/graph 端点不可达"));
    var pObs = pane(tr("读取中…若长期如此说明 /arch/observability 端点不可达"));
    var pAsm = pane(tr("读取中…若长期如此说明 /arch/assembly 端点不可达"));
    var pMcl = pane(tr("读取中…若长期如此说明 /mcl/config 端点不可达"));
    var tb = UI.tabs("arch", [
      { id: "rings", label: tr("内容环"), pane: pRings },
      { id: "rec", label: tr("记录与图"), pane: pRec },
      { id: "obs", label: tr("观测"), pane: pObs },
      { id: "asm", label: tr("装配"), pane: pAsm },
      { id: "mcl", label: tr("认知环旋钮"), pane: pMcl }
    ]);
    view.appendChild(tb.box);
    appState.api("/rings").then(function(r) {
      pRings.textContent = "";
      var c = UI.card(tr("五环 KPI 与环事件对账"));
      pRings.appendChild(c.box);
      renderFacts(c.body, r, 0);
      rawDetails(c.body, r);
    }).catch(appState.failFn);
    appState.api("/arch/records").then(function(r) {
      pRec.textContent = "";
      var c1 = UI.card(tr("记录层（Record 事实源）"));
      pRec.appendChild(c1.box);
      var st = r.store || {};
      kRec.set(String(st.records || 0), tr("无标签 ") + String(st.untagged || 0) + tr(" 条"));
      c1.body.appendChild(UI.kv([
        [tr("记录数"), String(st.records || 0)],
        [tr("无标签待归类"), String(st.untagged || 0)],
        [tr("md↔store 对账"), String(r.carriersOk || 0) + " / " + String(r.carriersTotal || 0) + tr(" 载体一致")]
      ]));
      var sh = r.shadow || {};
      kPar.set(String(r.carriersOk || 0) + " / " + String(r.carriersTotal || 0), tr("md ↔ store 逐件一致"));
      if (r.carriersTotal) kPar.fill(Math.round((r.carriersOk || 0) / r.carriersTotal * 100), r.carriersOk === r.carriersTotal ? "ended" : "suspect");
      kSelf.set(String(sh.verified || 0) + " / " + String(sh.diverged || 0), tr("写 ") + String(sh.writes || 0) + tr(" 次 · 可还原 / 分歧"));
      kSelf.fill(sh.diverged ? 0 : 100, sh.diverged ? "stalled" : "ended");
      c1.body.appendChild(UI.kv([
        [tr("写时自证"), tr("写 ") + String(sh.writes || 0) + tr(" · 可还原 ") + String(sh.verified || 0) + tr(" · **分歧 ") + String(sh.diverged || 0) + "**"],
        [tr("末次"), String(sh.lastAt || "—") + "（" + String(sh.lastFile || "—") + "）"]
      ]));
      c1.body.appendChild(el("div", "sc-sub", tr("载体逐件对账")));
      renderFacts(c1.body, (r.carriers || []).map(function(x) {
        return { 文件: x.file, md: x.mdBytes, store: x.storeBytes, 一致: x.ok ? tr("是") : tr("否"), 原因: x.reason || "" };
      }), 1);
      c1.body.appendChild(el("div", "sc-sub", tr("跨文件逐字节同文（只报告不删——内容属用户）")));
      var dups = r.dups || [];
      if (dups.length === 0) c1.body.appendChild(el("div", "sc-desc", tr("无（除索引/详情同名标题这类结构性重名）")));
      dups.slice(0, 8).forEach(function(dd) {
        var box = el("div", "sc-facts-row");
        box.appendChild(el("div", "sc-desc", "×" + dd.count + " " + JSON.stringify(String(dd.text || "").slice(0, 60))));
        box.appendChild(el("div", "sc-desc", (dd.files || []).map(function(f) {
          return f.file + "#" + f.order;
        }).join("  |  ")));
        c1.body.appendChild(box);
      });
      c1.body.appendChild(el("div", "sc-desc", r.address && r.address.note || ""));
      appState.api("/arch/graph").then(function(g) {
        pObs.textContent = "";
        var c2 = UI.card(tr("断言图（关系即事实）"));
        pRec.appendChild(c2.box);
        c2.body.appendChild(UI.kv([
          [tr("节点"), String(g.nodes || 0) + tr("（记录 ") + String(g.recordNodes || 0) + tr(" + 锚 ") + String(g.anchors || 0) + "）"],
          [tr("边"), String(g.edges || 0)],
          [tr("悬空证据"), String(g.danglingEvidence || 0)],
          [tr("活跃 / 失效"), String(g.live || 0) + " / " + String(g.expired || 0)]
        ]));
        c2.body.appendChild(UI.kv([
          ["answers", String(g.answers || 0)],
          ["collision", String(g.collision || 0)],
          ["commitment", String(g.commitment || 0)],
          ["relation", String(g.relation || 0)],
          ["pointsTo", String(g.pointsTo || 0)],
          ["provenance", String(g.provenance || 0)],
          ["supersede", String(g.supersede || 0)]
        ]));
      }).catch(appState.failFn);
    }).catch(appState.failFn);
    appState.api("/arch/observability").then(function(r) {
      pObs.textContent = "";
      var c = UI.card(tr("统一台账与观测面"));
      pObs.appendChild(c.box);
      var lg = r.ledger || {};
      c.body.appendChild(UI.kv([
        [tr("台账行数"), String(lg.lines || 0)],
        [tr("缺 at 行（信封完整性）"), String(lg.missingAt || 0) + (r.envelope && r.envelope.ok ? " ✓" : " ⚠")],
        [tr("台账路径"), String(lg.path || "")]
      ]));
      c.body.appendChild(el("div", "sc-sub", tr("按 type 分布")));
      renderFacts(c.body, lg.byType || [], 1);
      c.body.appendChild(el("div", "sc-sub", tr("audit 目录实况")));
      renderFacts(c.body, r.files || [], 1);
      c.body.appendChild(el("div", "sc-sub", tr("legacy 流（已并入台账，仅存历史）")));
      renderFacts(c.body, (r.legacy || []).map(function(x) {
        return { 流: x.name, 仍在: x.present ? tr("是") : tr("否") };
      }), 1);
      var reg = r.registry || {};
      c.body.appendChild(el("div", "sc-sub", tr("口径（族 × 域）")));
      c.body.appendChild(el("div", "sc-desc", tr("族：") + (reg.families || []).join(" · ")));
      c.body.appendChild(el("div", "sc-desc", tr("域：") + (reg.domains || []).join(" · ")));
      c.body.appendChild(el("div", "sc-desc", tr("权威：") + String(reg.authority || "") + tr("（suite 域事件流目标 = ") + String((reg.baseline || {}).suiteEventStreams) + "）"));
    }).catch(appState.failFn);
    appState.api("/arch/assembly").then(function(r) {
      pAsm.textContent = "";
      var c = UI.card(tr("装配根（composition root）与已装能力"));
      pAsm.appendChild(c.box);
      var cp = r.composition || {};
      c.body.appendChild(UI.kv([
        [tr("惰性桥边数"), String(cp.bridges) + (cp.bridges === 0 ? tr(" ✓（三条桥已退役）") : " ⚠")],
        [tr("契约路由数"), String((r.routes || {}).declared || 0)]
      ]));
      var st2 = r.store || {};
      c.body.appendChild(UI.item(
        tr("存储模式 storeMode"),
        tr("md = 只写 md 投影；dual = md ↔ Record 双写（写时自证：可还原 / 分歧）。") + (st2.note ? "⚠ " + st2.note : ""),
        UI.select(
          [{ value: "md", label: tr("md（只用 md 投影）") }, { value: "dual", label: tr("dual（md ↔ Record 双写）") }],
          st2.mode === "dual" ? "dual" : "md",
          function(v) {
            appState.api("/set", { method: "POST", body: JSON.stringify({ key: "storeMode", value: v }) }).then(function(res) {
              appState.statusFn(res && res.ok ? "✓ storeMode = " + v + tr("（已写 scheduler.json）") : tr("⚠ 未生效"));
              renderArchBody(view, safeFail);
            }).catch(function() {
              appState.statusFn(tr("⚠ storeMode 写入失败（枚举或白名单拒绝）"), "error");
            });
          },
          tr("存储模式")
        ),
        {}
      ));
      renderFacts(c.body, cp.handles || [], 1);
      var pl = r.plugin || {};
      var mods = pl.modules || [];
      var modsOk = mods.filter(function(m) {
        return m.present;
      }).length;
      kAsm.set(String(cp.bridges) + tr(" 桥"), modsOk + " / " + mods.length + tr(" 新架构模块在"));
      kAsm.fill(cp.bridges === 0 && modsOk === mods.length ? 100 : 0, cp.bridges === 0 && modsOk === mods.length ? "ended" : "suspect");
      c.body.appendChild(UI.kv([[tr("插件版本"), String(pl.version || "")], [tr("lib 文件数"), String(pl.libFiles || 0)]]));
      c.body.appendChild(el("div", "sc-sub", tr("重构后新增模块（装上去的那份是否带着）")));
      renderFacts(c.body, (pl.modules || []).map(function(m) {
        return { 模块: m.name, 在: m.present ? "✓" : "✗" };
      }), 1);
      c.body.appendChild(el("div", "sc-desc", cp.note || ""));
    }).catch(appState.failFn);
    function renderMclKnobs() {
      pMcl.textContent = "";
      appState.api("/mcl/config").then(function(r) {
        pMcl.textContent = "";
        var cur = r.persisted || {};
        var run = r.running || {};
        var c = UI.card(tr("认知环（MCL）旋钮"), { desc: tr("白名单补丁写 `scheduler.json`；**重载后生效**。当前运行态：") + (r.active ? tr("已装配") : tr("未装配")) });
        pMcl.appendChild(c.box);
        c.body.appendChild(UI.kv([
          [tr("运行态通道计数"), "steps=" + String(run.steps || 0) + " · slow=" + String(run.slow || 0) + " · injected=" + String(run.injected || 0)],
          [tr("材料去向"), (cur.mclMaterialInSystem ? tr("systemPrompt 段（P2b 开）") : tr("消息面")) + tr("（按持久配置）")],
          [tr("材料送达计数"), "sysBlockNonEmpty=" + String(run.sysBlockNonEmpty || 0) + tr(" · 末次 ") + String(run.sysBlockLastChars || 0) + tr(" 字符")]
        ]));
        var save = function(key, val) {
          var patch = {};
          patch[key] = val;
          appState.api("/mcl/config", { method: "POST", body: JSON.stringify(patch) }).then(function() {
            appState.statusFn("✓ " + key + " = " + val + tr("（已写入 scheduler.json，重载后生效）"));
            renderMclKnobs();
          }).catch(appState.failFn);
        };
        var lim = r.limits || {};
        var defs = lim.defaults || {};
        c.body.appendChild(UI.item(
          tr("熟悉度阈值 mclFamiliarThreshold"),
          tr("绝对余弦口径；≥ 阈值且命中高置信标签才走快通道（缺省 ") + String(defs.familiarThreshold) + tr("）。数据提示：本库 936 步实测 86% 的步**无召回命中**——先查召回，再调此值。"),
          UI.input(cur.mclFamiliarThreshold != null ? cur.mclFamiliarThreshold : defs.familiarThreshold, function(v) {
            var n = parseFloat(v);
            if (!isNaN(n)) save("mclFamiliarThreshold", n);
          }, { type: "number", width: "120px", ariaLabel: tr("熟悉度阈值") }),
          {}
        ));
        c.body.appendChild(UI.item(
          tr("再引导上限 mclMaxNudges"),
          tr("慢通道未引用材料时的再引导次数（0 = 只注入不引导；缺省 ") + String(defs.maxNudges) + "）",
          UI.input(cur.mclMaxNudges != null ? cur.mclMaxNudges : defs.maxNudges, function(v) {
            var n = parseInt(v, 10);
            if (!isNaN(n)) save("mclMaxNudges", n);
          }, { type: "number", width: "120px", ariaLabel: tr("再引导上限") }),
          {}
        ));
        c.body.appendChild(UI.item(
          tr("材料预算 mclBudgetChars"),
          tr("慢通道材料硬预算（字符；缺省 ") + String(defs.budgetChars) + "）",
          UI.input(cur.mclBudgetChars != null ? cur.mclBudgetChars : defs.budgetChars, function(v) {
            var n = parseInt(v, 10);
            if (!isNaN(n)) save("mclBudgetChars", n);
          }, { type: "number", width: "140px", ariaLabel: tr("材料预算") }),
          {}
        ));
        c.body.appendChild(UI.item(
          tr("指针条数 mclTopK"),
          tr("慢通道注入的指针条数（缺省 ") + String(defs.topK) + "）",
          UI.input(cur.mclTopK != null ? cur.mclTopK : defs.topK, function(v) {
            var n = parseInt(v, 10);
            if (!isNaN(n)) save("mclTopK", n);
          }, { type: "number", width: "120px", ariaLabel: tr("指针条数") }),
          {}
        ));
        c.body.appendChild(UI.item(
          tr("材料入 systemPrompt 段（P2b）"),
          tr("开 = 材料挂注入面、不进转录（实测 `sysBlockNonEmpty` 会涨）；关 = 走消息面（送达有据）"),
          UI.toggle(cur.mclMaterialInSystem === true, function(v) {
            save("mclMaterialInSystem", v);
          }),
          {}
        ));
        c.body.appendChild(UI.item(
          tr("认知环开关 mclEnabled"),
          tr("一键回滚开关"),
          UI.toggle(cur.mclEnabled !== false, function(v) {
            save("mclEnabled", v);
          }),
          {}
        ));
        c.body.appendChild(UI.item(
          tr("审计流 mclAudit"),
          tr("写统一台账（type=mcl*）"),
          UI.toggle(cur.mclAudit !== false, function(v) {
            save("mclAudit", v);
          }),
          {}
        ));
        c.body.appendChild(UI.item(
          tr("REM 相 enableRemPass"),
          tr("深睡同 pass 内做跨主题联想（缺省关；产物会并入画像，噪声代价高）"),
          UI.toggle(cur.enableRemPass === true, function(v) {
            save("enableRemPass", v);
          }),
          {}
        ));
        c.body.appendChild(el("div", "sc-desc", tr("探针（定位 P2b 用）：宿主传入 context 键 = ") + String(run.sysBlockCtxKeys || "—") + tr(" · 解析出的会话 = ") + String(run.sysBlockLastSid || "—")));
        if (run.trace && run.trace.length) {
          c.body.appendChild(el("div", "sc-sub", tr("时序轨迹（cap 捕获 · set 写材料 · ren 渲染）")));
          renderFacts(c.body, run.trace, 1);
        }
        rawDetails(c.body, r);
      }).catch(appState.failFn);
    }
    renderMclKnobs();
  }

  // src-client/panes-observe.js
  function renderViewObserve(view) {
    view.textContent = "";
    var logsAll = Store.get("logs") || [];
    UI.pageHead(tr("运行观测"), tr("执行进度、调用日志、错误定位与关键指标。日志保留最近 500 条，错误带端点/参数/堆栈，便于定位而非只剩一行提示。"), {
      routes: ["/cognition/report", "/selfcheck", "/reconcile", "/embed/test"],
      refresh: true,
      actions: [
        UI.button(tr("导出"), function() {
          var blob = new Blob([JSON.stringify({ logs: logsAll, errors: Store.get("errors") || [], metrics: Store.get("metrics") || {} }, null, 2)], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "shoucang-observe-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "") + ".json";
          a.click();
          URL.revokeObjectURL(a.href);
          appState.statusFn(tr("✓ 观测数据已导出（") + logsAll.length + tr(" 条日志）"));
        }, { title: tr("下载当前日志/错误/指标（JSON）") }),
        UI.button(tr("清空日志"), function() {
          Store.set("logs", []);
          Store.set("errors", []);
          appState.refreshView();
          appState.statusFn(tr("已清空日志与错误记录"));
        }, { danger: true, confirm: tr("确认清空全部日志与错误记录？") })
      ]
    });
    (function() {
      var msList = [];
      var failCount = 0;
      logsAll.forEach(function(l) {
        var msg = String(l && l.message || "");
        var mt = /(\d+(?:\.\d+)?)\s*ms/.exec(msg);
        if (mt) msList.push(parseFloat(mt[1]));
        if (/✗|error|失败/.test(msg)) failCount++;
      });
      var errCount = Derive.count(Store.get("errors"));
      var total = logsAll.length;
      var okCount = Math.max(0, total - failCount);
      var avgMs = msList.length ? Math.round(msList.reduce(function(a, b) {
        return a + b;
      }, 0) / msList.length) : 0;
      var okPct = total ? Math.round(okCount / total * 100) : null;
      var grid2 = el("div", "sc-kpis");
      grid2.appendChild(UI.kpi(tr("请求总数"), { val: Derive.num(total), sub: tr("本地保留（上限 500 条）"), plain: true }).box);
      grid2.appendChild(UI.kpi(tr("成功率"), { val: total ? Math.round(okCount / total * 1e3) / 10 + "%" : "—", sub: tr("非失败请求占比"), plain: true }).box);
      grid2.appendChild(UI.kpi(tr("平均耗时"), { val: avgMs + "ms", sub: msList.length ? tr("按 ") + msList.length + tr(" 条带耗时记录均算") : tr("暂无带耗时的记录"), plain: true }).box);
      grid2.appendChild(UI.kpi(tr("错误"), { val: Derive.num(errCount), sub: errCount ? tr("见下方「错误定位」") : tr("无记录"), plain: true }).box);
      view.appendChild(grid2);
    })();
    var pc = UI.card(tr("执行进度"), { sub: tr("本次会话的深睡 / 蒸馏进度"), right: [el("span", "sc-src", "/cognition/report")] });
    var p = Store.get("progress") || {};
    var ids = Object.keys(p);
    if (!Derive.has(ids)) pc.body.appendChild(el("div", "sc-desc", tr("当前无进行中的任务。")));
    else ids.forEach(function(id) {
      pc.body.appendChild(UI.progress(id));
    });
    view.appendChild(pc.box);
    var obLogs = el("div");
    var obErrs = el("div");
    var obOps = el("div");
    var obMetrics = el("div");
    var _ob = UI.tabs("observe", [
      { id: "logs", label: tr("调用日志 ") + Derive.count(Store.get("logs")), pane: obLogs },
      { id: "errors", label: tr("错误定位 ") + Derive.count(Store.get("errors")), pane: obErrs },
      { id: "ops", label: tr("运维操作"), pane: obOps },
      { id: "metrics", label: tr("关键指标"), pane: obMetrics }
    ]);
    view.appendChild(_ob.box);
    var errs = Store.get("errors") || [];
    var ebox = el("div");
    if (!Derive.has(errs)) ebox.appendChild(el("div", "sc-desc", tr("暂无错误。")));
    else {
      var list = el("div");
      errs.slice().reverse().slice(0, 30).forEach(function(r) {
        var ctx = r.ctx;
        var where = ctx ? (ctx.method || "") + " " + (ctx.path || "") + (ctx.params ? " " + JSON.stringify(ctx.params) : "") : "—";
        list.appendChild(UI.collapsible(
          new Date(r.t).toLocaleTimeString() + "  " + r.message,
          UI.kv([[tr("端点"), where], [tr("堆栈"), r.stack || "—"]]),
          {}
        ));
      });
      ebox.appendChild(list);
      ebox.appendChild(UI.button(tr("清空错误"), function() {
        Store.set("errors", []);
        appState.refreshView();
      }, { danger: true, confirm: tr("确认清空错误记录？") }));
    }
    obErrs.appendChild(ebox);
    var mbox = el("div");
    var m = Store.get("metrics") || {};
    var mk = Object.keys(m);
    if (!Derive.has(mk)) mbox.appendChild(el("div", "sc-desc", tr("暂无指标（切换各视图会自动采集）。")));
    else mbox.appendChild(UI.kv(mk.map(function(k) {
      return [k, String(m[k])];
    })));
    obMetrics.appendChild(mbox);
    appState.renderRunExtras(obMetrics);
    obLogs.appendChild(buildLogPanel(400));
    var ops = el("div");
    var embedRes = el("div", "sc-desc", tr("未测试"));
    ops.appendChild(UI.item(
      tr("嵌入服务连通性"),
      tr("POST /embed/test —— 验证当前 embedding 配置是否可用（配完即可验证，不必等实际调用失败）。"),
      UI.button(tr("测试连接"), function() {
        embedRes.textContent = tr("读取配置…");
        return appState.api("/embed/config").then(function(c) {
          var g = c && c.global || {};
          var baseUrl = String(g.embedBaseUrl || "").trim();
          if (!baseUrl) {
            embedRes.textContent = tr("✗ 未配置 embedBaseUrl，请先到「参数调节」填写。");
            return;
          }
          embedRes.textContent = tr("测试中… ") + baseUrl;
          return appState.apiCtx("/embed/test", {
            method: "POST",
            body: JSON.stringify({ baseUrl, apiKey: String(g.embedApiKey || "").trim() })
          }, tr("嵌入连通性")).then(function(r) {
            var n = Derive.count(r && r.models);
            embedRes.textContent = r && r.error ? "✗ " + r.error : tr("✓ 可达 · ") + n + tr(" 个模型");
            Log.info(tr("嵌入服务连通性测试") + (r && r.error ? tr("失败：") + r.error : tr("通过")));
          });
        }).catch(function(e) {
          embedRes.textContent = "✗ " + e.message;
        });
      }, { async: true, busyText: tr("测试中…"), okText: tr("嵌入连通性测试完成") }),
      {}
    ));
    ops.appendChild(embedRes);
    var evalRes = el("div", "sc-desc", tr("未测试"));
    ops.appendChild(UI.item(
      tr("评估通道连通性"),
      tr("POST /eval/test —— 验证评估通道是否可用（默认关闭；本机端点免 key，远端端点须另开出网许可）。"),
      UI.button(tr("测试连接"), function() {
        evalRes.textContent = tr("读取配置…");
        return appState.api("/eval/config").then(function(c) {
          var e = c && c.effective || {};
          var enabled = e.evalEnabled === true;
          var allow = e.evalEgressAllow === true;
          if (!enabled) {
            evalRes.textContent = tr("通道已关闭（缺省）。到「参数调节」开启 evalEnabled 后再测。");
            return;
          }
          evalRes.textContent = tr("测试中… ") + String(e.evalBaseUrl || "") + (allow ? tr("（已允许出网）") : "");
          return appState.apiCtx("/eval/test", { method: "POST", body: "{}" }, tr("评估通道")).then(function(r) {
            var o = String(r && r.outcome || "");
            var why = String(r && r.why || "");
            evalRes.textContent = r && r.ok ? tr("✓ 可达 · ") + String(r.model || "") + " · " + String(r.latencyMs || 0) + "ms · " + o : "✗ " + o + (why ? " · " + why : "");
            Log.info(tr("评估通道连通性测试") + (r && r.ok ? tr("通过") : tr("失败：") + o + " " + why));
          });
        }).catch(function(e) {
          evalRes.textContent = "✗ " + e.message;
        });
      }, { async: true, busyText: tr("测试中…"), okText: tr("评估通道连通性测试完成") }),
      {}
    ));
    ops.appendChild(evalRes);
    var evalStats = el("div", "sc-desc", tr("未统计"));
    ops.appendChild(UI.item(
      tr("评估通道统计"),
      tr("GET /eval/stats —— 折统一台账 type=eval.decision：分态分布 / 来源 / 真出机次数 / 回落次数。"),
      UI.button(tr("刷新统计"), function() {
        return appState.api("/eval/stats").then(function(s) {
          var oc = s && s.byOutcome || {};
          var keys = Object.keys(oc);
          evalStats.textContent = s && s.total ? "total " + s.total + " · outcomes " + keys.length + " (" + keys.map(function(k) {
            return k + ":" + oc[k];
          }).join(" ") + ") · egress " + (s.egressOk || 0) + " · fallback " + (s.fellBack || 0) : tr("尚无判定记录（通道未开启或未跑过）");
          var rec = s && s.recent || [];
          if (rec.length) {
            evalStats.textContent += " ｜ " + rec.slice(-3).map(function(r) {
              return r.outcome + "@" + (r.destLoopback ? "local" : r.destHost) + (r.fellBack ? "↩" : "") + " " + r.latencyMs + "ms";
            }).join(" · ");
          }
          Log.info(tr("评估通道统计") + " " + evalStats.textContent);
        }).catch(function(e) {
          evalStats.textContent = "✗ " + e.message;
        });
      }, { async: true, busyText: tr("统计中…"), okText: tr("统计完成") }),
      {}
    ));
    ops.appendChild(evalStats);
    var bootRes = el("div", "sc-desc", tr("未执行"));
    ops.appendChild(UI.item(
      tr("根目录引导"),
      tr("POST /root/bootstrap —— 初始化/修复记忆根目录结构。"),
      UI.button(tr("执行引导"), function() {
        bootRes.textContent = tr("执行中…");
        return appState.apiCtx("/root/bootstrap", { method: "POST", body: JSON.stringify({}) }, tr("根目录引导")).then(function(r) {
          bootRes.textContent = "✓ " + JSON.stringify(r).slice(0, 240);
        }).catch(function(e) {
          bootRes.textContent = "✗ " + e.message;
        });
      }, { async: true, busyText: tr("执行中…"), confirm: tr("执行根目录引导会尝试创建缺失的目录结构，确认继续？") }),
      {}
    ));
    ops.appendChild(bootRes);
    obOps.appendChild(ops);
    var adv = el("div");
    adv.appendChild(el("div", "sc-desc", tr("⚠ 行级直接改写记忆文件。改索引行可能导致指针与 notes 正文不一致（详见 R3），常规编辑请用「记忆板块 → 小节编辑」。")));
    var fInp = UI.input("MEMORY.md", null, { placeholder: tr("文件，如 MEMORY.md / notes/lessons.md"), width: "260px", ariaLabel: tr("记忆文件") });
    var lInp = UI.input("", null, { placeholder: tr("待匹配的原始行文本"), width: "320px", ariaLabel: tr("原始行") });
    var nInp = UI.input("", null, { placeholder: tr("新行文本（仅编辑需要）"), width: "320px", ariaLabel: tr("新行") });
    adv.appendChild(UI.item(tr("目标文件"), tr("isWritable 白名单内的记忆文件。"), fInp, {}));
    adv.appendChild(UI.item(tr("原始行"), tr("必须与原文件中的一行完全一致（后端按行匹配）。"), lInp, {}));
    adv.appendChild(UI.item(tr("新行文本"), tr("编辑时必填；删除时忽略。"), nInp, {}));
    var advRes = el("div", "sc-desc", tr("未执行"));
    var row = el("div", "sc-toolbar");
    row.appendChild(UI.button(tr("按行编辑"), function() {
      var file = fInp.value.trim(), line = lInp.value.trim(), nt = nInp.value.trim();
      if (!file || !line || !nt) {
        advRes.textContent = tr("✗ 文件 / 原始行 / 新行 三项均必填");
        return;
      }
      return appState.apiCtx("/memory/edit", { method: "POST", body: JSON.stringify({ file, line, newText: nt }) }, tr("行级编辑")).then(function() {
        advRes.textContent = tr("✓ 已改写该行");
        Log.warn(tr("行级编辑已执行（可能需同步索引）：") + file);
      }).catch(function(e) {
        advRes.textContent = "✗ " + e.message;
      });
    }, { async: true, busyText: tr("提交中…") }));
    row.appendChild(UI.button(tr("按行删除"), function() {
      var file = fInp.value.trim(), line = lInp.value.trim();
      if (!file || !line) {
        advRes.textContent = tr("✗ 文件与原始行必填");
        return;
      }
      if (!confirm("确认删除该行？此操作不可撤销（会由写门备份）。\n\n" + line)) return;
      return appState.apiCtx("/memory/remove", { method: "POST", body: JSON.stringify({ file, line }) }, tr("行级删除")).then(function() {
        advRes.textContent = tr("✓ 已删除该行");
        Log.warn(tr("行级删除已执行（可能需同步索引）：") + file);
      }).catch(function(e) {
        advRes.textContent = "✗ " + e.message;
      });
    }, { async: true, busyText: tr("提交中…"), danger: true, confirm: tr("确认执行行级删除？") }));
    adv.appendChild(row);
    adv.appendChild(advRes);
    obOps.appendChild(UI.collapsible(tr("高级：行级编辑 / 删除（谨慎）"), adv, { open: false }));
  }
  function buildLogPanel(maxH, opts) {
    var o = opts || {};
    var wrap = el("div", "sc-logwrap");
    if (maxH) wrap.style.setProperty("--sc-log-h", maxH + "px");
    if (o.collapsed) wrap.classList.add("sc-log-collapsed");
    var head = el("div", "sc-log-head");
    var arrow = el("span", "sc-sec-arrow", o.collapsed ? "▸" : "▾");
    if (o.collapsible) {
      head.classList.add("sc-log-toggle");
      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");
      head.setAttribute("aria-expanded", o.collapsed ? "false" : "true");
      head.onclick = function(ev) {
        if (ev && ev.target && ev.target.tagName === "SELECT") return;
        Cfg.set("showLogs", !!Cfg.get("showLogs", true) ? false : true);
        appState.applyLogPanel();
      };
      head.onkeydown = function(ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          head.onclick(ev);
        }
      };
    }
    head.appendChild(arrow);
    head.appendChild(el("span", null, tr("日志")));
    var lvSel = UI.select(
      [{ value: "info", label: tr("全部") }, { value: "warn", label: tr("警告+") }, { value: "error", label: tr("仅错误") }],
      Cfg.get("logLevel", "info"),
      function(v) {
        Cfg.set("logLevel", v);
        render();
      }
    );
    lvSel.setAttribute("aria-label", tr("日志级别"));
    head.appendChild(lvSel);
    var cnt = el("span", null, "");
    head.appendChild(cnt);
    head.appendChild(el("span", "sc-spacer"));
    head.appendChild(UI.button(tr("清空"), function() {
      Log.clear();
      render();
    }));
    wrap.appendChild(head);
    var body = el("div");
    wrap.appendChild(body);
    var ORDER = { info: 0, warn: 1, error: 2 };
    function render() {
      var min = ORDER[Cfg.get("logLevel", "info")] || 0;
      var all = (Store.get("logs") || []).filter(function(l) {
        return (ORDER[l.level] || 0) >= min;
      });
      cnt.textContent = all.length + tr(" 条");
      body.textContent = "";
      if (!Derive.has(all)) {
        body.appendChild(el("div", "sc-log-row", tr("（无）")));
        return;
      }
      var LVICON = { info: "·", warn: "!", error: "✗" };
      all.slice(-200).reverse().forEach(function(l) {
        var row = el("div", "sc-log-row sc-log-" + l.level);
        var c = l.ctx || {};
        row.appendChild(el("span", "sc-log-lv", LVICON[l.level] || "·"));
        if (c.path) {
          row.appendChild(el("span", "sc-log-m", c.method || "GET"));
          row.appendChild(el("span", "sc-log-p", String(c.path)));
          if (c.ms !== void 0) row.appendChild(el("span", "sc-log-ms", c.ms + "ms"));
          if (c.status !== void 0) row.appendChild(el("span", "sc-log-st", String(c.status)));
        } else {
          row.appendChild(el("span", "sc-log-msg", l.msg));
        }
        row.appendChild(el("span", "sc-spacer"));
        row.appendChild(el("span", "sc-log-t", new Date(l.t).toLocaleTimeString()));
        body.appendChild(row);
      });
    }
    render();
    Bus.on("log", render);
    return wrap;
  }
  function renderRunExtras(view) {
    var gHost = view;
    var gRoot = view;
    var group2 = function(t) {
      var c = UI.card(t);
      gRoot.appendChild(c.box);
      gHost = c.body;
      return c.body;
    };
    var mk = function(label, value, sub) {
      var card = el("div", "sc-mem-stat");
      card.appendChild(el("div", "sc-mem-stat-label", label));
      card.appendChild(el("div", "sc-mem-stat-value", value));
      if (sub) card.appendChild(el("div", "sc-mem-stat-sub", sub));
      return card;
    };
    group2(tr("账本对账与产出健康（v2.1 M3）"));
    var rw = el("div", "sc-mem-stats");
    rw.appendChild(mk(tr("对账"), "…", tr("读取中")));
    gHost.appendChild(rw);
    appState.api("/reconcile").then(function(r) {
      rw.textContent = "";
      if (!r || !r.active) {
        rw.appendChild(mk(tr("对账"), tr("未就绪"), r && r.error || tr("memory-reconcile.mjs 未部署")));
        return;
      }
      var cl = r.closure || {};
      var h = r.health || {};
      var ly = (r.layers || {}).counts || {};
      var P = ly.P || { index: 0, profile: 0 }, R = ly.R || { index: 0, profile: 0 }, E = ly.E || { index: 0, profile: 0 };
      rw.appendChild(mk(tr("账本闭合"), cl.ok === null ? tr("样本不足") : cl.ok ? tr("✅ 差异 0") : tr("⚠ 有差异"), tr("台账 ") + ((r.window || {}).ledgerRows || 0) + tr(" 行 · 写事件 ") + (h.writeEvents || 0) + tr(" 次")));
      rw.appendChild(mk(tr("上次有效深睡"), h.lastSuccessfulWrite ? fmtTime(h.lastSuccessfulWrite) : tr("（无）"), tr("连续空转 ") + (h.idleStreak || 0) + tr(" 轮 · 深睡轮次 ") + (h.deepSleepRounds || 0)));
      var byCh = h.byChannel || {};
      var chRows = Object.keys(byCh).map(function(k) {
        var v = byCh[k] || {};
        var pct = v.rejectRate === null || v.rejectRate === void 0 ? "—" : (v.rejectRate * 100).toFixed(0) + "%";
        return k + " " + pct;
      }).sort();
      rw.appendChild(mk(tr("写入被拒率"), h.rejectRate === null || h.rejectRate === void 0 ? "n/a" : (h.rejectRate * 100).toFixed(0) + "%", tr("拒 ") + (h.rejectedWrites || 0) + tr(" / 写事件 ") + (h.writeEvents || 0) + tr(" · 尝试 ") + (h.attemptedTotal || 0) + tr(" 条") + (chRows.length ? tr(" · 按通道：") + chRows.join(" / ") : "")));
      var gd = h.gateRejectsDetail;
      if (gd && gd.total) {
        var gRows = Object.keys(gd.byTarget || {}).map(function(k) {
          return k + "×" + gd.byTarget[k];
        }).sort();
        rw.appendChild(mk(tr("门禁拒收（按目标）"), String(gd.total) + tr(" 次"), gRows.join(" / ") + (gd.lastAt ? tr(" · 最近 ") + fmtTime(gd.lastAt) + " " + (gd.lastTarget || "") + (gd.lastReason ? "：" + gd.lastReason : "") : "")));
      }
      rw.appendChild(mk(tr("三层占比"), "P " + (P.index + P.profile) + " · R " + R.index + " · E " + (E.index + E.profile), tr("P=恒常（索引+P 层画像行 ≤") + ((r.layers || {}).profileCap || 3) + tr("/档）· R=任务门控 · E=相关性门控")));
    }).catch(function() {
      rw.textContent = "";
      rw.appendChild(mk(tr("对账"), tr("读取失败"), "/reconcile"));
    });
  }

  // src-client/panes-suite.js
  function renderSuite(view, data) {
    view.textContent = "";
    UI.pageHead(tr("插件集合"), tr("suite 装配矩阵由 targets.ts 的 suiteAssemblyMatrix() 单一实现；面板与 scheduler 共用。"), {
      routes: ["/suite"],
      routesInline: true,
      actions: [UI.button(tr("重新装配"), function() {
        appState.refreshView();
        appState.statusFn(tr("已按注入器 registry + profiles 重新核装配"));
      }, { title: tr("重取装配矩阵（/suite）") })]
    });
    var members = data && data.members || [];
    var grid = el("div", "sc-pgrid");
    var iconOf = function(m) {
      var k = String(m && (m.id || m.package) || "").toLowerCase();
      if (k.indexOf("memory") >= 0 || k.indexOf("skill") >= 0) return "vault";
      if (k.indexOf("core") >= 0) return "persona";
      if (k.indexOf("sched") >= 0) return "sleep";
      if (k.indexOf("panel") >= 0) return "overview";
      return "suite";
    };
    members.forEach(function(m) {
      var st = Derive.suiteStatus(m.status);
      var c = el("div", "sc-pcard");
      var ph = el("div", "ph");
      var ic = el("span", "ic");
      ic.appendChild(svg(ICONS[iconOf(m)] || ICONS.suite));
      ph.appendChild(ic);
      ph.appendChild(el("b", null, String(m.id || m.name || m.package || "?")));
      c.appendChild(ph);
      c.appendChild(el("div", "pd", String(m.role || m.desc || m.description || m.detail || "—")));
      var meta = el("div", "pmeta");
      meta.appendChild(el("span", null, String(m.repo || m.package || "")));
      var stSpan = el("span", null, st.text);
      if (st.tip) stSpan.title = st.tip;
      meta.appendChild(stSpan);
      c.appendChild(meta);
      grid.appendChild(c);
    });
    var add = el("div", "sc-pcard is-add");
    var aph = el("div", "ph");
    var aic = el("span", "ic");
    aic.appendChild(svg(ICONS.suite));
    aph.appendChild(aic);
    aph.appendChild(el("b", null, tr("添加目标库")));
    add.appendChild(aph);
    add.appendChild(el("div", "pd", tr("需在白名单内登记（target-registry / members 配置）")));
    grid.appendChild(add);
    view.appendChild(grid);
    var mtx = UI.card(tr("suite 装配矩阵"), { sub: tr("单一实现：targets.ts · suiteAssemblyMatrix()"), right: [el("span", "sc-src", "GET /suite")] });
    view.appendChild(mtx.box);
    var tbl = el("table", "sc-table");
    var thead = el("thead");
    var htr = el("tr");
    [tr("目标库"), tr("容量"), tr("已用"), tr("装配内容"), tr("状态")].forEach(function(h) {
      htr.appendChild(el("th", null, h));
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el("tbody");
    tbl.appendChild(tbody);
    mtx.body.appendChild(tbl);
    var CONTENT = { "MEMORY.md": tr("原则 + 路径"), "USER.md": tr("画像 + 偏好"), "AGENT.md": tr("经验 + 反例") };
    var pill = function(ok, text) {
      return el("span", "pill" + (ok ? " ok" : " warn"), text);
    };
    var addRow = function(name, used, content, ok) {
      var tr2 = el("tr");
      tr2.appendChild(el("td", "tgt", name));
      tr2.appendChild(el("td", "num", tr2("不限")));
      tr2.appendChild(el("td", "num", used));
      tr2.appendChild(el("td", null, content));
      var td = el("td");
      td.appendChild(pill(ok !== false, ok === false ? tr2("水位偏高") : tr2("正常")));
      tr2.appendChild(td);
      tbody.appendChild(tr2);
    };
    var fill = function(idx) {
      tbody.textContent = "";
      if (!Derive.has(idx)) {
        tbody.appendChild(el("tr", null, tr("（无容量注册表数据）")));
        return;
      }
      idx.forEach(function(f) {
        var pct = f.cap ? Math.round((f.chars || 0) / f.cap * 100) : null;
        var kind = pct === null ? "ended" : Derive.capKind(pct);
        var tr2 = el("tr");
        tr2.appendChild(el("td", "tgt", String(f.name || "").replace(/\.md$/i, "")));
        tr2.appendChild(el("td", "num", f.cap ? Derive.num(f.cap) : tr2("不限")));
        tr2.appendChild(el("td", "num", Derive.num(f.chars || 0)));
        tr2.appendChild(el("td", null, CONTENT[f.name] || "—"));
        var td = el("td");
        td.appendChild(pill(kind === "ended", kind === "ended" ? tr2("正常") : kind === "stalled" ? tr2("超阈") : tr2("水位偏高")));
        tr2.appendChild(td);
        tbody.appendChild(tr2);
      });
    };
    fill(data && data.indexes || null);
    if (data && data.summary) mtx.body.appendChild(el("div", "sc-note", String(data.summary)));
    appState.api("/memory/overview").then(function(r) {
      fill(r && r.indexes || null);
      var n = Derive.count(r && r.notes);
      if (n) addRow("notes/", n + tr(" 条"), tr("便签"), true);
    }).catch(function() {
    });
    appState.api("/cognition/report").then(function(r) {
      var ar = r && r.archive || [];
      if (!r || !r.ok || !Derive.has(ar)) return;
      addRow("archive/", ar.length + tr(" 条"), tr("归档"), true);
    }).catch(function() {
    });
  }
  function renderDeepSleep(view) {
    view.textContent = "";
    UI.pageHead(tr("深度睡眠 · 会话状态机"), tr("全部根会话停滞 ≥ 阈值后自动回想当天记忆、提炼原则层 PRINCIPLES.md。状态机区分「正常长任务 / 卡住 / 异常退出」：仅长任务正在推进才拦睡，其余正常睡。"), { routes: ["/deepsleep", "/deepsleep/trigger", "/deepsleep/config"] });
    var smSlot = el("div");
    view.appendChild(smSlot);
    var distSlot = el("div");
    view.appendChild(distSlot);
    var cogSlot = el("div", "sc-stack");
    view.appendChild(cogSlot);
    appState.api("/deepsleep").then(function(r) {
      if (!r.active) {
        view.appendChild(el("div", "sc-desc", tr("深度睡眠归纳器当前未激活（蒸馏器 enableDistill 未启用或尚未就绪）。")));
        return;
      }
      (function() {
        var now = Date.now();
        var idleMs = Number(r.idleMs) || 0;
        var probeMs = Number(r.probeAfterMs) || idleMs;
        var act = Number(r.lastActivityAt) || 0;
        var stalled = act ? Math.max(0, now - act) : 0;
        var stage = idleMs > 0 && stalled >= idleMs ? 3 : probeMs > 0 && stalled >= probeMs ? 2 : 1;
        var mMin = function(ms) {
          return Math.round(Number(ms) / 6e4);
        };
        var smCard = UI.card("状态机", {
          sub: "停滞 ≥ " + mMin(idleMs) + " 分钟触发一次结构整理（判定线 " + mMin(probeMs) + " 分钟）" + (r.lastDeepSleepAt ? " · 上次入睡 " + dsFmtTime(r.lastDeepSleepAt) : ""),
          right: [el("span", "sc-src", "/deepsleep")]
        });
        smSlot.appendChild(smCard.box);
        var sm = el("div", "sc-sm");
        [
          ["清醒", "M20 6L9 17l-5-5", "会话有活动，不触发整理"],
          ["判定中", "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", "已停滞 ≥ " + mMin(probeMs) + " 分钟，等待判定是长任务还是卡住"],
          ["可入睡", "M12 3v12|M6 9l6 6 6-6|M5 21h14", "停滞 ≥ " + mMin(idleMs) + " 分钟，满足自动归纳条件"]
        ].forEach(function(n, i) {
          var idx = i + 1;
          var node = el("div", "sc-sm-node" + (idx < stage ? " done" : idx === stage ? " on" : ""));
          node.title = n[2];
          var cir = el("div", "sc-sm-circle");
          cir.appendChild(svg(n[1]));
          node.appendChild(cir);
          node.appendChild(el("div", "sc-sm-label", idx === stage ? n[0] + tr(" · 当前") : n[0]));
          sm.appendChild(node);
          if (i < 2) sm.appendChild(el("div", "sc-sm-seg" + (idx < stage ? " done" : "")));
        });
        smCard.body.appendChild(sm);
        if (r.currentEpoch) {
          var epFrom = r.epochSince ? dsFmtTime(r.epochSince) : "（起点未知）";
          var epTo = r.lastDeepSleepAt ? dsFmtTime(r.lastDeepSleepAt) : "进行中";
          smCard.body.appendChild(el(
            "div",
            "sc-desc",
            "当前纪元 " + r.currentEpoch + " · 窗口 " + epFrom + " → " + epTo
          ));
        }
        var water = el("div", "sc-prog");
        var pct = idleMs ? Math.min(100, Math.round(stalled / idleMs * 100)) : 0;
        var wtrack = el("div", "sc-prog-track");
        var wfill = el("div", "sc-prog-fill");
        wfill.style.width = Math.max(0, Math.min(100, pct)) + "%";
        wtrack.appendChild(wfill);
        water.appendChild(wtrack);
        water.appendChild(el(
          "div",
          "sc-prog-txt",
          "睡眠水位 · 已停滞 " + mMin(stalled) + " / " + mMin(idleMs) + " 分钟" + (idleMs ? "（" + Math.min(100, Math.round(stalled / idleMs * 100)) + "%）" : "")
        ));
        smCard.body.appendChild(water);
      })();
      (function() {
        var segs = [["running", r.running], ["ended", r.ended], ["probing", r.probing], ["suspect", r.suspect], ["stalled", r.stalled]];
        var sum = segs.reduce(function(a, s) {
          return a + (Number(s[1]) || 0);
        }, 0);
        if (!sum) return;
        var idleMin = Math.round((r.idleMs || 0) / 6e4);
        var distCard = UI.card("睡眠状态分布", {
          sub: "idle " + idleMin + " 分钟 · 下次可睡 " + (r.nextEligibleAt ? dsFmtTime(r.nextEligibleAt) : "—"),
          right: [el("span", "sc-src", "GET /deepsleep"), UI.button("立即进入深睡", function() {
            appState.statusFn(tr("深度睡眠归纳中…"));
            return appState.api("/deepsleep/trigger", { method: "POST", body: "{}" }).then(function(rr) {
              appState.statusFn(rr.ok ? tr("✓ 已触发归纳（见日志）") : tr("⚠ 触发失败：") + (rr.error || ""));
            });
          }, { primary: true, async: true, busyText: "归纳中…", okText: "已触发归纳", confirm: "立即触发一次深度睡眠归纳？将调用归纳子代理回顾当天记忆痕迹。" })]
        });
        distSlot.appendChild(distCard.box);
        var byState = {};
        segs.forEach(function(s) {
          byState[s[0]] = (byState[s[0]] || 0) + Number(s[1] || 0);
        });
        var merged = Object.keys(byState).map(function(k) {
          return [k, byState[k]];
        });
        var bar = el("div", "sc-dseg");
        merged.forEach(function(s) {
          if (Number(s[1]) > 0) {
            var i = el("i", dsStateKind(s[0]));
            i.style.flex = String(s[1]);
            bar.appendChild(i);
          }
        });
        distCard.body.appendChild(bar);
        var legend = el("div", "sc-dlegend");
        merged.forEach(function(s) {
          var it = el("span", "sc-dlegend-i");
          it.appendChild(el("i", "sc-segdot " + dsStateKind(s[0])));
          it.appendChild(el("span", null, dsStateLabel(s[0]) + " " + String(s[1] || 0)));
          legend.appendChild(it);
        });
        distCard.body.appendChild(legend);
      })();
      renderCognitionReport(cogSlot, "sleep");
      var scRun = UI.button(tr("运行自检"), function() {
        return appState.api("/selfcheck/run", { method: "POST", body: "{}" }).then(function(rr) {
          appState.statusFn(tr("✓ 自检完成：") + (rr.verdict || "?"));
          renderDeepSleep(view);
        });
      }, { async: true, busyText: tr("自检中…"), okText: tr("自检完成") });
      var scWrap = UI.card(tr("睡眠期自检（判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账）"), {
        sub: tr("上次结果读 selfcheck-latest.json（GET）；执行走 POST"),
        right: [el("span", "sc-src", "GET /selfcheck · POST /selfcheck/run"), scRun]
      });
      view.appendChild(scWrap.box);
      var scBox = el("div", "sc-mem-stats");
      var scCard = function(label, value, sub) {
        var c = el("div", "sc-mem-stat");
        c.appendChild(el("div", "sc-mem-stat-label", label));
        c.appendChild(el("div", "sc-mem-stat-value", value));
        if (sub) c.appendChild(el("div", "sc-mem-stat-sub", sub));
        return c;
      };
      scBox.appendChild(scCard(tr("自检"), "…", tr("读取中")));
      scWrap.body.appendChild(scBox);
      appState.api("/selfcheck").then(function(s) {
        scBox.textContent = "";
        if (!s || !s.active) {
          scBox.appendChild(scCard(tr("自检"), tr("尚未跑过"), s && s.error || tr("定时器/深睡后会自动执行")));
        } else {
          var v = String(s.verdict || "?");
          var sm = s.summary || {};
          var ck = sm.checks || {};
          scBox.appendChild(scCard(tr("裁决"), v === "ok" ? "✅ ok" : v === "adjust" ? "🔧 adjust" : "⚠ warn", tr("于 ") + fmtTime(s.at)));
          scBox.appendChild(scCard(tr("六项检测"), Object.keys(ck).map(function(k) {
            return (ck[k] === "pass" ? "✅" : ck[k] === "skipped" ? "⏭" : "❌") + k;
          }).join(" "), tr("影子 flipReady=") + sm.flipScoreWeights + tr(" · 成熟度就绪=") + sm.maturationReady + tr(" · 闭合=") + (sm.closureOk === null ? "n/a" : sm.closureOk)));
          scBox.appendChild(scCard(tr("白名单调整"), Derive.has(s.adjustments) ? s.adjustments.map(function(a) {
            return a.id;
          }).join(" · ") : tr("无"), tr("仅窄动作且可回滚；改 α/gate/判据 一律只建议")));
        }
      }).catch(function() {
        scBox.textContent = "";
        scBox.appendChild(scCard(tr("自检"), tr("读取失败"), "/selfcheck"));
      });
      if (Derive.has(r.sessions)) {
        var sessCard = UI.card(tr("最近会话"), { sub: r.sessions.length + tr(" 条在册") });
        view.appendChild(sessCard.box);
        r.sessions.forEach(function(s) {
          var sub = dsFmtAgo(s.state === "ended" ? s.lastEndAt : s.lastEventAt);
          if (s.probeResult) sub += " · " + (DS_PROBE_TEXT[s.probeResult] || s.probeResult);
          var pk = s.state === "stalled" || s.state === "suspect" ? "warn" : s.state === "probing" ? "info" : "ok";
          var ttl = String(s.title || "");
          if (ttl.length > 14) ttl = ttl.slice(0, 14) + "…";
          var nm = [s.workspace, ttl, s.sid].filter(function(x) {
            return !!x;
          }).join(" · ");
          sessCard.body.appendChild(ovCRow(nm, sub, [ovPill(dsStateLabel(s.state), pk)]));
        });
      }
      var hasStall = r.stalled > 0 || (r.sessions || []).some(function(s) {
        return s.probeResult === "stall";
      });
      if (hasStall) {
        view.appendChild(el("div", "sc-ds-alert", tr("⚠ 检测到疑似卡住的会话（无输出增长但会话仍在）：已正常计入停滞并安排睡眠，但建议你确认该任务是否真的卡住——必要时手动重启该会话。")));
      }
    }).catch(function(e) {
      view.appendChild(el("div", "sc-desc", tr("加载失败：") + (e && e.message ? e.message : e)));
    });
  }
  function dsFmtAgo(ts) {
    if (!ts) return "—";
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1e3));
    if (s < 60) return s + tr(" 秒");
    var m = Math.floor(s / 60);
    if (m < 60) return m + tr(" 分钟");
    var h = Math.floor(m / 60);
    if (h < 24) return h + tr(" 小时 ") + m % 60 + tr(" 分");
    return Math.floor(h / 24) + tr(" 天 ") + h % 24 + tr(" 小时");
  }
  function dsFmtTime(ts) {
    if (!ts) return tr("从未");
    try {
      return new Date(ts).toLocaleString("zh-CN", { hour12: false });
    } catch (e) {
      return String(ts);
    }
  }
  function dsStateKind(state) {
    return state === "stalled" ? "stalled" : "running";
  }
  function dsStateLabel(state) {
    if (state === "stalled") return tr("停滞");
    return tr("待蒸馏");
  }
  var DS_PROBE_TEXT = {
    "long-run": "长任务进行中",
    "suspect": "待下轮复核",
    "conflict": "状态活跃但无输出增长",
    "stall": "已确认无输出",
    "exit": "会话已退出",
    "no-transcript": "探针不可用",
    "error": "探测异常"
  };

  // src-client/i18n-nav.js
  var VIEWS = [
    ["overview", "nav.overview", "overview", "nav.group.overview"],
    ["memory", "nav.memory", "memory", "nav.group.memory"],
    ["persona", "nav.persona", "persona", "nav.group.memory"],
    ["suite", "nav.suite", "suite", "nav.group.run"],
    ["deepsleep", "nav.deepsleep", "sleep", "nav.group.run"],
    ["observe", "nav.observe", "observe", "nav.group.run"],
    ["arch", "nav.arch", "arch", "nav.group.run"],
    ["toggles", "nav.toggles", "toggles", "nav.group.config"],
    ["settings", "nav.settings", "settings", "nav.group.config"]
  ];
  function navLabelById(id) {
    if (id === "overview") return tr("运行总览");
    if (id === "memory") return tr("记忆库");
    if (id === "persona") return tr("画像");
    if (id === "suite") return tr("插件集合");
    if (id === "deepsleep") return tr("深度睡眠");
    if (id === "observe") return tr("运行观测");
    if (id === "arch") return tr("架构");
    if (id === "toggles") return tr("参数");
    if (id === "settings") return tr("设置");
    return id;
  }
  function navGroupByKey(key) {
    if (key === "nav.group.overview") return tr("总览");
    if (key === "nav.group.memory") return tr("记忆");
    if (key === "nav.group.run") return tr("运行");
    if (key === "nav.group.config") return tr("配置");
    return key;
  }
  function relabelChrome(rootSel) {
    var root = rootSel || "#scpanl-root";
    try {
      var items = document.querySelectorAll(root + " .sc-nav-item[data-view]");
      for (var i = 0; i < items.length; i++) {
        var id = items[i].getAttribute("data-view");
        var lbl = navLabelById(id);
        var span = items[i].querySelector("span");
        if (span) span.textContent = lbl;
        items[i].setAttribute("aria-label", lbl);
      }
      var groups = document.querySelectorAll(root + " .sc-nav-group");
      var seen = [];
      VIEWS.forEach(function(v) {
        if (v[3] && seen.indexOf(v[3]) === -1) seen.push(v[3]);
      });
      for (var k = 0; k < groups.length && k < seen.length; k++) groups[k].textContent = navGroupByKey(seen[k]);
      var title = document.querySelector(root + " .sc-nav-title");
      if (title) title.textContent = tr("守藏 SHOUCANG");
      var modal = document.getElementById("scpanl-modal");
      if (modal) modal.setAttribute("aria-label", tr("守藏记忆面板"));
      var lblBtn = document.getElementById("scpanl-btn");
      if (lblBtn) {
        lblBtn.title = tr("守藏面板");
        var lab = lblBtn.querySelector("span, [data-slot] span");
        if (lab) lab.textContent = tr("守藏");
      }
    } catch (e) {
    }
  }

  // src-client/panes-settings.js
  function makeToggle(key, name, desc, initial, onToggle) {
    var sw = el("input", "checkbox-container");
    sw.type = "checkbox";
    sw.checked = !!initial;
    sw.onchange = function() {
      onToggle(key, sw);
    };
    return UI.item(name, desc, null, { children: [appState.metaBadges(key), sw] });
  }
  function renderViewSettings(view) {
    view.textContent = "";
    UI.pageHead(tr("设置"), tr("界面偏好与高级操作。配置原文（YAML）与行级编辑收在此处，配风险提示。"), {
      routes: ["/config", "/save", "/roots", "/memory/edit"],
      actions: [UI.button(tr("导出快照"), function() {
        return appState.api("/config").then(function(c) {
          var snap = {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            config: { file: c && c.file || "", text: c && c.text || "" },
            ui: Cfg.get()
          };
          var blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "shoucang-config-snapshot-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "") + ".json";
          a.click();
          URL.revokeObjectURL(a.href);
          appState.statusFn(tr("✓ 配置快照已导出"));
        });
      }, { async: true, busyText: tr("导出中…"), okText: tr("配置快照已导出"), title: tr("导出配置原文 + 界面偏好（JSON）") })]
    });
    var pLook = el("div");
    var pAdv = el("div");
    var _tb = UI.tabs("settings", [{ id: "pref", label: tr("界面偏好"), pane: pLook }, { id: "advanced", label: tr("高级"), pane: pAdv }]);
    view.appendChild(_tb.box);
    var host = _tb.pane("pref");
    var pref = UI.card(null);
    host.appendChild(pref.box);
    var box = pref.body;
    box.appendChild(UI.item(
      tr("显示密度"),
      tr("紧凑模式隐藏描述文字、压缩行高，提升信息密度。"),
      UI.select(
        [{ value: "comfortable", label: tr("舒适") }, { value: "compact", label: tr("紧凑") }],
        Cfg.get("density", "comfortable"),
        function(v) {
          Cfg.set("density", v);
          applyDensity();
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      tr("导航宽度"),
      tr("左侧导航像素宽度（140–320）；窄屏（≤900px）由响应式断点接管。"),
      UI.input(Cfg.get("navWidth", 216), function(v) {
        var n = parseInt(v, 10);
        if (isNaN(n)) return;
        Cfg.set("navWidth", Math.max(140, Math.min(320, n)));
        applyNavWidth();
      }, { type: "number", width: "120px", ariaLabel: tr("导航宽度") }),
      {}
    ));
    box.appendChild(UI.item(
      tr("打开时自动刷新"),
      tr("打开面板即重新拉取当前视图数据。"),
      UI.toggle(Cfg.get("autoRefresh", true), function(v) {
        Cfg.set("autoRefresh", v);
      }),
      {}
    ));
    box.appendChild(UI.item(
      tr("轮询间隔（毫秒）"),
      tr("0 = 关闭轮询。影响运行态数据刷新频率。"),
      UI.input(Cfg.get("refreshMs", 6e4), function(v) {
        var n = parseInt(v, 10);
        if (isNaN(n)) return;
        Cfg.set("refreshMs", Math.max(0, n));
        restartPolling();
      }, { type: "number", width: "140px", ariaLabel: tr("轮询间隔") }),
      {}
    ));
    box.appendChild(UI.item(
      tr("概览—详情分层"),
      tr("列表默认折叠详情，先给概览再按需展开。"),
      UI.toggle(Cfg.get("overviewMode", true), function(v) {
        Cfg.set("overviewMode", v);
      }),
      {}
    ));
    box.appendChild(UI.item(
      tr("长列表折叠阈值"),
      tr("超过该行数的列表默认折叠。"),
      UI.input(Cfg.get("maxRows", 50), function(v) {
        var n = parseInt(v, 10);
        if (isNaN(n)) return;
        Cfg.set("maxRows", Math.max(5, Math.min(500, n)));
      }, { type: "number", width: "120px", ariaLabel: tr("折叠阈值") }),
      {}
    ));
    box.appendChild(UI.item(
      tr("显示日志面板"),
      tr("在状态栏上方常驻显示调用日志。"),
      UI.toggle(Cfg.get("showLogs", true), function(v) {
        Cfg.set("showLogs", v);
        applyLogPanel();
      }),
      {}
    ));
    box.appendChild(UI.item(
      tr("日志级别"),
      tr("过滤日志面板显示的最低级别（全部 / 警告+ / 仅错误）。"),
      UI.select(
        [{ value: "info", label: tr("全部") }, { value: "warn", label: tr("警告+") }, { value: "error", label: tr("仅错误") }],
        Cfg.get("logLevel", "info"),
        function(v) {
          Cfg.set("logLevel", v);
          Bus.emit("log", null);
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      tr("启动时视图"),
      tr("打开面板后默认落地的页面。优先级：#sc=<视图名> 深链 > 上次视图记忆 > 此项。"),
      UI.select(
        appState.views.map(function(v) {
          return { value: v[0], label: navLabelById(v[0]) };
        }),
        Cfg.get("startView", "overview"),
        function(v) {
          Cfg.set("startView", v);
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      tr("界面皮肤"),
      tr("v9 = 方案调色板（默认）；宿主 = 跟随 DSH 主题令牌（与宿主同色）。"),
      UI.select(
        [{ value: "v9", label: tr("v9 方案皮肤") }, { value: "host", label: tr("宿主原生皮肤") }],
        Cfg.get("skin", "v9"),
        function(v) {
          Cfg.set("skin", v);
          syncTheme();
          appState.refreshView();
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      tr("导航分组显示"),
      tr("按语义显示分组标题（守藏 / 总览 / 记忆 / 运行 / 配置）。"),
      UI.toggle(Cfg.get("navGroups", true), function(v) {
        Cfg.set("navGroups", v);
        applyNavGroups();
      }),
      {}
    ));
    box.appendChild(UI.item(
      tr("页脚健康条"),
      tr("常驻显示记忆库状态与库路径。"),
      UI.toggle(Cfg.get("footBar", true), function(v) {
        Cfg.set("footBar", v);
        applyFootBar();
      }),
      {}
    ));
    var keys = UI.card(tr("快捷键"), { sub: tr("面板内可用") });
    keys.body.appendChild(ovCRow(tr("打开 / 关闭面板"), tr("全局"), [ovPill("Ctrl/⌘ + Shift + S", "", true)]));
    keys.body.appendChild(ovCRow(tr("切换日志面板"), tr("面板内"), [ovPill("Ctrl/⌘ + Shift + L", "", true)]));
    keys.body.appendChild(ovCRow(tr("关闭面板"), tr("面板内"), [ovPill("Esc", "", true)]));
    host.appendChild(keys.box);
    var adv = el("div");
    adv.appendChild(el("div", "sc-desc", tr("配置原文（shoucang.config.yaml）保存后自动备份 .bak-*；根目录切换与新增在此。")));
    renderConfigRaw(adv);
    host = _tb.pane("advanced");
    host.appendChild(UI.collapsible(tr("高级 · 配置原文与根目录"), adv, { open: false }));
    var dsAdv = el("div");
    dsAdv.appendChild(el("div", "sc-desc", tr("写入 ~/.dsh/suite/scheduler.json；改后需重载插件生效。")));
    host.appendChild(UI.collapsible(tr("深度睡眠阈值"), dsAdv, { open: false, key: "settings:dsadv" }));
    appState.api("/deepsleep/config").then(function(cfg) {
      var run = cfg.running || {};
      dsAdv.appendChild(makeToggle("enableDeepSleep", tr("启用深度睡眠自动归纳 enableDeepSleep"), tr("全部会话停滞 ≥ 阈值后自动提炼原则层（关闭 = 暂停，等于原「暂停到明天」）。"), !!run.enableDeepSleep, function(key, sw) {
        appState.api("/deepsleep/config", { method: "POST", body: JSON.stringify({ enableDeepSleep: sw.checked }) }).then(function() {
          appState.statusFn(tr("✓ 已保存（重载生效）"));
        }).catch(function(e) {
          appState.failFn(e);
          sw.checked = !sw.checked;
        });
      }));
      dsAdv.appendChild(appState.dsNumber(tr("停滞阈值 deepSleepIdleMs"), tr("全部会话无活动持续满此毫秒数才触发（默认 3 小时）。"), Math.round((run.deepSleepIdleMs || 108e5) / 6e4), 10, 720, tr("分钟"), function(m) {
        return m * 6e4;
      }, "deepSleepIdleMs"));
      dsAdv.appendChild(appState.dsNumber(tr("探测发起延迟 deepSleepProbeAfterMs"), tr("running 无事件持续此毫秒后发起输出增长探测（默认 3 小时）。"), Math.round((run.deepSleepProbeAfterMs || 108e5) / 6e4), 10, 720, tr("分钟"), function(m) {
        return m * 6e4;
      }, "deepSleepProbeAfterMs"));
      dsAdv.appendChild(appState.dsNumber(tr("探测采样间隔 deepSleepProbeWindowMs"), tr("两轮采样之间的间隔（默认 60 秒）。"), Math.round((run.deepSleepProbeWindowMs || 6e4) / 1e3), 5, 600, tr("秒"), function(s) {
        return s * 1e3;
      }, "deepSleepProbeWindowMs"));
    }).catch(function(e) {
      dsAdv.appendChild(el("div", "sc-mem-empty", tr("阈值加载失败：") + (e && e.message ? e.message : e)));
    });
    var acts = el("div", "sc-acts");
    acts.appendChild(UI.button(tr("恢复默认设置"), function() {
      Cfg.reset();
      applyDensity();
      applyNavWidth();
      applyNavGroups();
      applyFootBar();
      applyLogPanel();
      restartPolling();
      appState.refreshView();
      Log.info(tr("界面设置已恢复默认"));
    }, { confirm: tr("确认恢复全部界面设置为默认值？") }));
    acts.appendChild(el("span", "sc-acts-note", tr("重置 10 项界面偏好并立即重绘（密度 / 导航宽度 / 日志面板 / 轮询全部重新应用）")));
    host.appendChild(acts);
  }
  function dsNumber(name, desc, initial, min, max, unit, encode, key) {
    var item = el("div", "setting-item");
    var info = el("div", "setting-item-info");
    info.appendChild(el("div", "setting-item-name", name));
    info.appendChild(el("div", "setting-item-desc", desc));
    var wrap = el("div");
    wrap.className = "sc-range-wrap";
    var lab = el("span", "sc-range-label");
    lab.textContent = initial + " " + unit;
    var range = el("input");
    range.type = "range";
    range.min = String(min);
    range.max = String(max);
    range.step = "1";
    range.value = String(initial);
    range.addEventListener("input", function() {
      lab.textContent = range.value + " " + unit;
    });
    range.addEventListener("change", function() {
      var o = {};
      o[key] = encode(range.value);
      appState.api("/deepsleep/config", { method: "POST", body: JSON.stringify(o) }).then(function() {
        appState.statusFn("✓ " + name + " = " + range.value + " " + unit + tr("（重载生效）"));
      }).catch(appState.failFn);
    });
    wrap.appendChild(lab);
    wrap.appendChild(range);
    item.appendChild(info);
    item.appendChild(wrap);
    return item;
  }
  function applyDensity() {
    var m = document.getElementById("scpanl-modal");
    if (!m) return;
    m.classList.toggle("sc-density-compact", Cfg.get("density", "comfortable") === "compact");
  }
  function applyNavWidth() {
    var m = document.getElementById("scpanl-modal");
    if (!m) return;
    var n = parseInt(Cfg.get("navWidth", 216), 10);
    if (!n) n = 216;
    m.style.setProperty("--sc-nav-w", Math.max(140, Math.min(320, n)) + "px");
  }
  function applyLogPanel() {
    var main = document.querySelector(".sc-main");
    if (!main) return;
    var old = main.querySelector(".sc-logwrap");
    if (old) old.remove();
    var collapsed = !Cfg.get("showLogs", true);
    var bar = document.getElementById("sc-statusbar");
    var lp = buildLogPanel(collapsed ? 33 : 150, { collapsible: true, collapsed });
    if (bar && bar.parentNode === main) main.insertBefore(lp, bar);
    else main.appendChild(lp);
  }
  function applyNavGroups() {
    var m = document.getElementById("scpanl-modal");
    if (m) m.classList.toggle("sc-nogroups", !Cfg.get("navGroups", true));
  }
  function applyFootBar() {
    var m = document.getElementById("scpanl-modal");
    if (m) m.classList.toggle("sc-nofoot", !Cfg.get("footBar", true));
  }
  function restartPolling() {
    if (appState.pollTimer) {
      clearInterval(appState.pollTimer);
      appState.pollTimer = null;
    }
    var ms = parseInt(Cfg.get("refreshMs", 6e4), 10) || 0;
    if (ms <= 0) return;
    appState.pollTimer = setInterval(function() {
      var mask = document.getElementById("scpanl-mask");
      if (!mask || !mask.classList.contains("open")) return;
      if (Cfg.get("autoRefresh", true)) appState.refreshView();
    }, ms);
  }
  function collectMetrics() {
    var m = {};
    function put(k, v) {
      m[k] = v;
      Store.patch("metrics", m);
    }
    appState.api("/mcl/status").then(function(r) {
      put(tr("MCL 状态"), r && (r.mode || r.state) || "—");
      if (r && r.familiarity != null) put(tr("熟悉度"), String(r.familiarity));
    }).catch(function() {
      put(tr("MCL 状态"), tr("获取失败"));
    });
    appState.api("/vector/status2").then(function(r) {
      put(tr("向量档"), r && r.present ? String(r.rows || 0) + tr(" 行") : tr("未启用"));
    }).catch(function() {
      put(tr("向量档"), tr("获取失败"));
    });
    appState.api("/inject/stats").then(function(r) {
      put(tr("注入统计"), r && typeof r === "object" ? JSON.stringify(r).slice(0, 160) : String(r));
    }).catch(function() {
      put(tr("注入统计"), tr("获取失败"));
    });
    appState.api("/get_root").then(function(r) {
      put(tr("当前根"), r && (r.root || r.path || r.active) || "—");
    }).catch(function() {
      put(tr("当前根"), tr("获取失败"));
    });
  }
  function syncTheme() {
    var root = document.getElementById("scpanl-root");
    if (!root) return;
    var probe2 = document.querySelector('.hHd-Xa_settingsArea, .hHd-Xa_footerActions, [class*="sidebar"], body');
    var bg = probe2 ? getComputedStyle(probe2).backgroundColor : "";
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg || "");
    var dark = true;
    if (m) {
      var lum = (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1e3;
      dark = lum < 140;
    }
    var skin = String(Cfg.get("skin", "v9")) === "host" ? "host" : "v9";
    root.classList.toggle("sc-dark", dark);
    root.classList.toggle("sc-light", !dark);
    root.classList.toggle("sc-skin-v9", skin === "v9");
    root.classList.toggle("sc-skin-host", skin === "host");
    try {
      Cfg.set("theme", dark ? "dark" : "light");
    } catch (e) {
    }
  }

  // src-client/model-picker.js
  function setShown(node, shown) {
    if (shown) node.classList.remove("sc-hidden");
    else node.classList.add("sc-hidden");
  }
  var INHERIT = "";
  var CACHE = { rows: null, inflight: null };
  function loadCatalog() {
    if (CACHE.rows) return Promise.resolve(CACHE.rows);
    if (CACHE.inflight) return CACHE.inflight;
    CACHE.inflight = appState.api("/llm/models").then(function(r) {
      var rows = r && r.models || [];
      CACHE.rows = rows;
      CACHE.inflight = null;
      return rows;
    }).catch(function() {
      CACHE.inflight = null;
      return [];
    });
    return CACHE.inflight;
  }
  function invalidateCatalog() {
    CACHE.rows = null;
    CACHE.inflight = null;
  }
  function enumerateEndpoint(baseUrl) {
    var b = String(baseUrl || "").trim().replace(/\/+$/, "");
    var root = b.replace(/\/v1$/, "");
    if (!root) return Promise.resolve({ models: [], note: tr("先填写服务地址") });
    try {
      var u = new URL(root);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("x");
    } catch (e) {
      return Promise.resolve({ models: [], note: tr("URL 无效（需 http(s):// 开头）") });
    }
    return fetch(root + "/v1/models", { signal: AbortSignal.timeout(6e3) }).then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function(j) {
      var models = (j && j.data || []).map(function(m) {
        return String(m.id);
      }).filter(Boolean);
      return { models, note: "" };
    }).catch(function() {
      return fetch(root + "/health", { signal: AbortSignal.timeout(5e3) }).then(function(r) {
        if (!r.ok) throw new Error("x");
        return r.json();
      }).then(function(j) {
        var f = j && j.model || "";
        return { models: f ? [f] : [], note: tr("服务在但无 /models 枚举（用固定模型）") };
      }).catch(function() {
        return { models: [], note: tr("无法连接该服务（/v1/models 与 /health 均无响应）") };
      });
    });
  }
  function modelPicker(opts) {
    var o = opts || {};
    var mode = o.source === "endpoint" ? "endpoint" : "host";
    var val = { provider: String(o.provider || ""), model: String(o.model || ""), effort: String(o.effort || "") };
    var rows = null;
    var enumNote = "";
    var box = el("div", "sc-col-end");
    var pSel = el("select", "sc-input sc-w-lg");
    var mSel = el("select", "sc-input sc-w-lg");
    var mFree = el("input", "sc-input sc-w-lg");
    var eSel = el("select", "sc-input sc-w-md");
    var note = el("div", "sc-mem-sub muted");
    mFree.placeholder = o.customPlaceholder || tr("模型名（如 qwen3.5:2b）");
    function opt(sel, value, label) {
      var op = el("option");
      op.value = String(value);
      op.textContent = label;
      sel.appendChild(op);
      return op;
    }
    function normEfforts(list) {
      return (list || []).map(function(e) {
        return e && typeof e === "object" ? { id: String(e.id), label: String(e.label || e.id) } : { id: String(e), label: String(e) };
      }).filter(function(e) {
        return e.id;
      });
    }
    function providerIds() {
      var seen = {}, out = [];
      (rows || []).forEach(function(r) {
        if (r && r.provider && !seen[r.provider]) {
          seen[r.provider] = 1;
          out.push(r.provider);
        }
      });
      return out;
    }
    function modelsOfHost(prov) {
      return (rows || []).filter(function(r) {
        return r && r.provider === prov;
      }).map(function(r) {
        return r.id;
      });
    }
    function entryOf(prov, model) {
      var hit = null;
      (rows || []).forEach(function(r) {
        if (r && r.provider === prov && r.id === model) hit = r;
      });
      return hit;
    }
    function efforts() {
      if (mode === "endpoint") return normEfforts(o.efforts);
      var e = entryOf(val.provider, val.model);
      return normEfforts(e && e.efforts);
    }
    function drawProviders() {
      pSel.textContent = "";
      if (mode === "endpoint") {
        (o.providers || []).forEach(function(p) {
          opt(pSel, p.id, p.label || p.id);
        });
        if (o.allowCustom !== false) opt(pSel, "__custom__", tr("自定义（手填地址与模型名）"));
        pSel.value = (o.providers || []).some(function(p) {
          return p.id === val.provider;
        }) ? val.provider : ((o.providers || [])[0] || {}).id || "__custom__";
        return;
      }
      if (o.includeInherit !== false) opt(pSel, INHERIT, o.labels && o.labels.inherit || tr("继承主模型（默认）"));
      providerIds().forEach(function(p) {
        opt(pSel, p, p);
      });
      if (o.allowCustom !== false) opt(pSel, "__custom__", tr("自定义（手填模型名）"));
      var known = providerIds().indexOf(val.provider) > -1;
      if (!val.provider) pSel.value = INHERIT;
      else if (known) pSel.value = val.provider;
      else if (o.allowCustom !== false) {
        pSel.value = "__custom__";
        mFree.value = val.model;
      } else pSel.value = providerIds()[0] || INHERIT;
    }
    function drawModels() {
      var custom = pSel.value === "__custom__";
      var isEndpoint = mode === "endpoint" && !custom;
      setShown(mFree, custom);
      setShown(mSel, !custom);
      if (custom) {
        mFree.value = val.model;
        return;
      }
      mSel.textContent = "";
      if (isEndpoint) {
        opt(mSel, INHERIT, tr("点击「枚举模型」加载…"));
        mSel.value = INHERIT;
        return;
      }
      var list = modelsOfHost(pSel.value);
      if (!Derive.has(list)) {
        opt(mSel, INHERIT, pSel.value ? tr("（该 provider 未枚举到模型）") : tr("（先选服务）"));
        mSel.value = INHERIT;
        return;
      }
      list.forEach(function(id) {
        var e = entryOf(pSel.value, id);
        opt(mSel, id, id + (e && e.name && e.name !== id ? " · " + e.name : ""));
      });
      mSel.value = list.indexOf(val.model) > -1 ? val.model : list[0];
    }
    function drawEfforts() {
      eSel.textContent = "";
      var list = efforts();
      opt(eSel, INHERIT, mode === "endpoint" ? tr("（不指定）") : tr("沿用模型默认"));
      list.forEach(function(e) {
        opt(eSel, e.id, e.label);
      });
      eSel.value = list.some(function(e) {
        return e.id === val.effort;
      }) ? val.effort : INHERIT;
      var has = list.length > 0;
      eSel.disabled = !has;
      eSel.title = has ? tr("档位（reasoning effort / 成本结构分档）") : mode === "endpoint" ? tr("该通道未定义档位 —— 保持「不指定」") : tr("该模型未声明可选档位 —— 沿用模型默认");
    }
    function emit(patch) {
      if (typeof o.onChange === "function") o.onChange(patch);
    }
    pSel.addEventListener("change", function() {
      if (mode === "endpoint") {
        var p = (o.providers || []).filter(function(x) {
          return x.id === pSel.value;
        })[0];
        var base = p ? String(p.base || "") : "";
        var provId = pSel.value === "__custom__" ? "" : pSel.value;
        var patch = { provider: provId };
        if (pSel.value !== "__custom__") {
          patch.base = base;
        }
        val.provider = provId;
        drawModels();
        drawEfforts();
        emit(patch);
        return;
      }
      val.provider = pSel.value === "__custom__" ? "" : pSel.value;
      if (pSel.value === "__custom__") {
        val.model = mFree.value.trim();
      } else {
        drawModels();
        val.model = mSel.value || "";
      }
      drawModels();
      drawEfforts();
      emit({ provider: val.provider, model: val.model, effort: val.effort });
    });
    mSel.addEventListener("change", function() {
      val.model = mSel.value === INHERIT ? "" : mSel.value || "";
      if (mode !== "endpoint") val.effort = "";
      drawEfforts();
      emit({ provider: val.provider, model: val.model, effort: val.effort });
    });
    function commitFree() {
      var v = mFree.value.trim();
      if (v === val.model) return;
      val.model = v;
      if (mode !== "endpoint") val.effort = "";
      drawEfforts();
      emit({ provider: val.provider, model: val.model, effort: val.effort });
    }
    mFree.addEventListener("change", commitFree);
    mFree.onkeydown = function(e) {
      if (e.key === "Enter") commitFree();
    };
    eSel.addEventListener("change", function() {
      val.effort = eSel.value === INHERIT ? "" : eSel.value || "";
      emit({ effort: val.effort });
    });
    function row(label, ctl) {
      if (!label) return ctl;
      var w = el("div", "sc-row");
      w.appendChild(el("span", "sc-range-label", label));
      w.appendChild(ctl);
      return w;
    }
    var enumBtn = null;
    if (mode === "endpoint") {
      enumBtn = el("button", "sc-btn subtle sc-btn-xs", tr("枚举模型"));
      enumBtn.type = "button";
      enumBtn.onclick = function() {
        enumBtn.disabled = true;
        enumBtn.textContent = tr("枚举中…");
        return enumerateEndpoint(o.baseUrl || "").then(function(r) {
          enumBtn.disabled = false;
          enumBtn.textContent = tr("枚举模型");
          enumNote = r.note || "";
          if (r.models && r.models.length) {
            mSel.textContent = "";
            r.models.forEach(function(id) {
              opt(mSel, id, id);
            });
            if (r.models.indexOf(val.model) > -1) mSel.value = val.model;
            else {
              mSel.value = r.models[0];
              val.model = r.models[0];
              emit({ provider: val.provider, model: val.model });
            }
          }
          drawEfforts();
          paintNote();
        });
      };
    }
    function paintNote() {
      var n = mode === "endpoint" ? rows || [] : rows || [];
      if (mode === "endpoint") {
        note.textContent = enumNote || tr("本机端点模型不在宿主目录里 —— 用「枚举模型」列出来，或直接手填模型名");
        return;
      }
      note.textContent = n && n.length ? tr("宿主可用 ") + n.length + tr(" 个模型") : tr("宿主模型目录为空 —— 可在「自定义」里手填模型名，或先在 Harness 里配好模型");
    }
    box.appendChild(row(o.labels && o.labels.provider, pSel));
    box.appendChild(row(o.labels && o.labels.model, mSel));
    box.appendChild(row(null, mFree));
    box.appendChild(row(o.labels && o.labels.effort, eSel));
    if (enumBtn) {
      var bw = el("div", "sc-row");
      bw.appendChild(enumBtn);
      box.appendChild(bw);
    }
    box.appendChild(note);
    function redraw() {
      drawProviders();
      drawModels();
      if (pSel.value === "__custom__") val.model = mFree.value.trim();
      else if (mode !== "endpoint") val.model = mSel.value || val.model;
      drawEfforts();
      paintNote();
    }
    loadCatalog().then(function(r) {
      rows = r;
      redraw();
    }).catch(function() {
      rows = [];
      redraw();
    });
    return {
      box,
      get: function() {
        return { provider: val.provider, model: val.model, effort: val.effort };
      },
      set: function(p) {
        val.provider = String(p && p.provider || "");
        val.model = String(p && p.model || "");
        val.effort = String(p && p.effort || "");
        redraw();
        return this;
      },
      reload: function() {
        invalidateCatalog();
        return loadCatalog().then(function(r) {
          rows = r;
          redraw();
        });
      },
      catalog: function() {
        return rows || [];
      },
      noteEl: note
    };
  }

  // src-client/panes-eval.js
  var PROVIDER_ROWS = [
    { id: "ollama", base: "http://127.0.0.1:11434/v1" },
    { id: "arbiter", base: "http://127.0.0.1:8010/v1" },
    { id: "cloud", base: "" }
  ];
  var TIER_IDS = ["local", "fast", "native", "llm"];
  function renderEvalCard(host) {
    var PROVIDER_LABEL = {
      ollama: tr("本机 Ollama（零成本 · 免 key）"),
      arbiter: tr("本机 arbiter（Laya / Jev 快模型）"),
      cloud: tr("自定义 OpenAI 兼容（云端）")
    };
    var TIER_LABEL = {
      local: tr("本机（零成本 · 免 key）"),
      fast: tr("远程小快模型"),
      native: tr("原生校准型"),
      llm: tr("现有大模型")
    };
    var PROVIDERS = PROVIDER_ROWS.map(function(p) {
      return { id: p.id, base: p.base, label: PROVIDER_LABEL[p.id] };
    });
    var TIERS = TIER_IDS.map(function(id) {
      return { id, label: TIER_LABEL[id] };
    });
    var wrap = el("div");
    wrap.appendChild(el("div", "sc-h3", tr("评估通道（可配置模型 · 按需开启）")));
    wrap.appendChild(el("div", "sc-desc", tr("把「答案可枚举、但判据写不成代码」的判定交给一个可配置模型。**默认关闭**：关闭时行为与未装此能力逐字节一致。改动写 ~/.dsh/suite/scheduler.json，**重载插件后生效**。")));
    var zone = el("div");
    zone.appendChild(el("div", "sc-desc", tr("读取中…")));
    wrap.appendChild(zone);
    host.appendChild(wrap);
    function save(patch, okMsg, onFail) {
      return appState.api("/eval/config", { method: "POST", body: JSON.stringify(patch) }).then(function() {
        appState.statusFn("✓ " + (okMsg || tr("已写入")) + tr("（重载后生效）"));
      }).catch(function(e) {
        appState.failFn(e);
        if (onFail) onFail();
      });
    }
    appState.api("/eval/config").then(function(c) {
      var eff = c && c.effective || {};
      var persisted = c && c.persisted || {};
      var tiers = c && c.tiers || ["local", "fast", "native", "llm"];
      var isOn = eff.evalEnabled === true;
      var baseUrl = String(eff.evalBaseUrl || "");
      zone.textContent = "";
      var sw = el("input", "checkbox-container");
      sw.type = "checkbox";
      sw.checked = isOn;
      sw.onchange = function() {
        save({ evalEnabled: sw.checked }, sw.checked ? tr("评估通道 开") : tr("评估通道 关"), function() {
          sw.checked = !sw.checked;
        });
      };
      zone.appendChild(UI.item(
        tr("启用评估通道 evalEnabled"),
        tr("开=类型化判定可用（choice / boolean / score）；关=通道整体停用（缺省关，fail-closed）。写入 scheduler.json。"),
        sw
      ));
      var dlist = el("datalist");
      dlist.id = "sc-eval-endpoints";
      PROVIDERS.forEach(function(p) {
        if (p.base) {
          var o = el("option");
          o.value = p.base;
          dlist.appendChild(o);
        }
      });
      ["https://api.openai.com/v1", "https://api.deepseek.com/v1"].forEach(function(ep) {
        var o = el("option");
        o.value = ep;
        dlist.appendChild(o);
      });
      document.body.appendChild(dlist);
      var urlInp = el("input", "sc-input sc-w-xl");
      urlInp.value = baseUrl;
      urlInp.placeholder = "http://127.0.0.1:11434/v1";
      urlInp.setAttribute("list", "sc-eval-endpoints");
      var keyInp = el("input", "sc-input sc-w-md");
      keyInp.value = String(eff.evalApiKeyEnv || "");
      keyInp.placeholder = tr("key 环境变量名（本机免填）");
      var eRow = el("div", "sc-col-end");
      eRow.appendChild(urlInp);
      eRow.appendChild(keyInp);
      zone.appendChild(UI.item(
        tr("服务地址（OpenAI 兼容 /v1 根）与 key 环境变量"),
        tr("本机端点免 key；远端端点须另开出网许可（见下）。地址按**解析后的主机名**判是否本机——127.0.0.1.evil.com 这类伪造不会被当成本机。"),
        null,
        { children: [eRow] }
      ));
      var picker = modelPicker({
        source: "endpoint",
        provider: "ollama",
        model: String(eff.evalModel || ""),
        efforts: TIERS,
        providers: PROVIDERS,
        baseUrl,
        customPlaceholder: tr("模型名（如 qwen3.5:2b / jev-latest）"),
        labels: { provider: tr("服务"), model: tr("模型"), effort: tr("档位") },
        onChange: function(p) {
          if (p.base !== void 0) {
            urlInp.value = String(p.base || "");
            picker && (picker.baseUrl = p.base);
          }
          var patch = {};
          if (p.model !== void 0) patch.evalModel = p.model || "";
          if (p.effort !== void 0) patch.evalTier = p.effort || "local";
          if (Object.keys(patch).length) save(patch, tr("评估通道配置已设"));
        }
      });
      if (picker && urlInp) urlInp.addEventListener("change", function() {
        picker.noteEl && (picker.noteEl.textContent = "");
      });
      zone.appendChild(UI.item(
        tr("评估模型"),
        tr("三级选择（服务 → 模型 → 档位）。服务选好先「枚举模型」（浏览器直连该端点），或直接手填模型名——本机 Ollama 的模型不在宿主目录里，手填是常态。"),
        null,
        { children: [picker.box] }
      ));
      var egress = el("input", "checkbox-container");
      egress.type = "checkbox";
      egress.checked = eff.evalEgressAllow === true;
      egress.onchange = function() {
        save({ evalEgressAllow: egress.checked }, egress.checked ? tr("已允许出网") : tr("已禁止出网"), function() {
          egress.checked = !egress.checked;
        });
      };
      zone.appendChild(UI.item(
        tr("允许出网 evalEgressAllow"),
        tr("与开关**分离**的两项授权：「允许装外部服务」≠「允许记忆内容出机」。缺省 false；填了远端地址但未勾此项 ⇒ 拒发并如实记 egress-denied。"),
        egress
      ));
      var tierSel = el("select", "sc-input sc-w-lg");
      TIERS.forEach(function(t) {
        if (tiers.indexOf(t.id) === -1) return;
        var o = el("option");
        o.value = t.id;
        o.textContent = t.label;
        tierSel.appendChild(o);
      });
      tierSel.value = String(eff.evalTier || "local");
      var saveBtn = el("button", "sc-btn", tr("保存端点与档位"));
      saveBtn.type = "button";
      saveBtn.onclick = function() {
        saveBtn.disabled = true;
        saveBtn.textContent = tr("保存中…");
        save({
          evalBaseUrl: urlInp.value.trim(),
          evalApiKeyEnv: keyInp.value.trim() || "EVAL_API_KEY",
          evalTier: tierSel.value
        }, tr("端点与档位已设"), function() {
          saveBtn.disabled = false;
          saveBtn.textContent = tr("保存端点与档位");
        }).then(function() {
          saveBtn.disabled = false;
          saveBtn.textContent = tr("保存端点与档位");
        });
      };
      var tierRow = el("div", "sc-col-end");
      tierRow.appendChild(tierSel);
      tierRow.appendChild(saveBtn);
      zone.appendChild(UI.item(
        tr("档位 evalTier"),
        tr("按**成本结构**分档（不是按厂商）：本机零成本 / 远程小快 / 原生校准 / 现有大模型。档位决定**超时预算**（本机推理含模型加载给 60s、远端快模型 15s）与**置信阈值口径**（原生档用校准阈值，其余用保守阈值）。"),
        null,
        { children: [tierRow] }
      ));
      var res = el("div", "sc-desc", tr("未测试"));
      var testBtn = UI.button(tr("测试连通性"), function() {
        res.textContent = tr("测试中…") + " " + String(urlInp.value || "");
        return appState.apiCtx("/eval/test", { method: "POST", body: "{}" }, tr("评估通道")).then(function(r) {
          if (!r) {
            res.textContent = tr("无响应");
            return;
          }
          if (r.ok) res.textContent = "✓ " + tr("可用") + " · " + String(r.latencyMs || 0) + "ms · " + String(r.outcome || "");
          else if (r.outcome === "off") res.textContent = "⚠ " + tr("通道已关闭——先打开上方开关并重载") + "（why=" + String(r.why || "") + "）";
          else res.textContent = "✗ " + String(r.outcome || "") + " · " + String(r.why || "");
        });
      }, { async: true, busyText: tr("测试中…"), okText: tr("评估通道连通性测试完成") });
      zone.appendChild(UI.item(
        tr("连通性测试"),
        tr("POST /eval/test —— 发一次最小判定，返回**分态**结果（ok / off / egress-denied / key-missing / unreachable / bad-body / type-violation），不落库。"),
        testBtn
      ));
      zone.appendChild(res);
      if (persisted.evalEnabled === false) {
        zone.appendChild(el("div", "sc-desc", tr("当前为显式关闭态（scheduler.json 里 evalEnabled=false）。")));
      }
    }).catch(function(e) {
      zone.textContent = "";
      zone.appendChild(el("div", "sc-desc", tr("⚠ 评估通道配置读取失败：") + e.message));
    });
  }

  // src-client/panes-capacity.js
  function renderTogglesCap(host, g, deps) {
    function gVal(key, fallback) {
      return g[key] !== void 0 && g[key] !== null ? g[key] : fallback;
    }
    var enforce = gVal("capacityEnforce", false) === true;
    var overDesc = enforce ? tr("写入超限会被拒（当前：阻断已开启）") : tr("写入超限不再阻断（当前：阻断已关闭，超限照写并留一条 capacity-over 审计痕）");
    host.appendChild(el("div", "sc-desc", tr("容量门 = 记忆库能长多大（超限是否阻断由下方开关决定）；活性/遗忘为天级阈值。")));
    host.appendChild(enumSetting(
      tr("容量门是否阻断写入 capacityEnforce"),
      tr("缺省「关闭」= 超限照写（并落一条 capacity-over 留痕）。开=超限拒写（改造前画像行为）。只影响容量这一支：源指针悬空 / 行格式 / 疑似凭据三道门始终硬拒，不受此开关影响。改后即时生效（写门每轮重读）。"),
      enforce ? "on" : "off",
      "injection.capacity_enforce",
      [{ v: "off", label: tr("关闭（缺省·超限照写并留痕）") }, { v: "on", label: tr("开启（超限拒写）") }]
    ));
    var actualChars = g && g.actual || { agent: 0, user: 0, memory: 0 };
    host.appendChild(numSetting(tr("AGENT.md 容量门 cap_agent"), tr("agent 画像记忆库容量（字符）：") + overDesc + tr("（AGENT.md 当前实际 ") + (actualChars.agent || 0) + tr(" 字符）。不影响任务执行注入——注入总看完整画像"), gVal("cap_agent", 3e3), "injection.cap_agent", tr("字符")));
    host.appendChild(numSetting(tr("USER.md 容量门 cap_user"), tr("用户画像记忆库容量（字符）：") + overDesc + tr("（当前实际 ") + (actualChars.user || 0) + tr(" 字符）。不影响任务执行注入"), gVal("cap_user", 3e3), "injection.cap_user", tr("字符")));
    host.appendChild(numSetting(tr("MEMORY.md 容量门 cap_memory"), tr("知识索引记忆库容量（字符）：") + overDesc + tr("（当前实际 ") + (actualChars.memory || 0) + tr(" 字符）。注入按档位行数不受此限"), gVal("cap_memory", 5e3), "injection.cap_memory", tr("字符")));
    host.appendChild(el("div", "sc-h3", tr("活性 / 遗忘阈值（v7）")));
    host.appendChild(el("div", "sc-desc", tr("记忆条目活性状态机（active→warm→cold）与遗忘/加深候选的判定阈值，以及融合召回对 cold/retired 条目的降权系数。改动经 /set 即时写回 scheduler.json（与注入/蒸馏配置同通道，重载后按新阈值运行）。")));
    host.appendChild(numSetting(tr("活性降级 warm 阈值 activityWarmDays"), tr("active→warm 无命中天数（缺省 14）"), gVal("activityWarmDays", 14), "activityWarmDays", tr("天")));
    host.appendChild(numSetting(tr("遗忘冷降 cold 阈值 activityColdDays"), tr("warm→cold 无命中天数（缺省 44 = warm+30）"), gVal("activityColdDays", 44), "activityColdDays", tr("天")));
    host.appendChild(numSetting(tr("遗忘候选 archive 阈值 activityArchiveDays"), tr("cold 后超此天数未命中 → 遗忘候选清单（缺省 90，只建议不删除）"), gVal("activityArchiveDays", 90), "activityArchiveDays", tr("天")));
    host.appendChild(numSetting(tr("加深候选命中数 activityHotHits"), tr("近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5，喂深睡归纳）"), gVal("activityHotHits", 5), "activityHotHits", tr("次")));
    var pctItem = el("div", "setting-item");
    var pctInfo = el("div", "setting-item-info");
    pctInfo.appendChild(el("div", "setting-item-name", tr("召回冷条目降权 recallColdFactorPercent")));
    pctInfo.appendChild(el("div", "setting-item-desc", tr("cold/retired 小节在融合召回中的降权系数（百分比 → /100；缺省 35%，后端范围校验 [5,95] 兜底）")));
    var pctWrap = el("div", "sc-num-wrap");
    var pctInp = el("input");
    pctInp.type = "number";
    pctInp.className = "sc-input";
    pctInp.min = "5";
    pctInp.max = "95";
    pctInp.step = "5";
    pctInp.value = String(gVal("recallColdFactorPercent", 35));
    var pctUnit = el("span", "sc-range-label", "%");
    pctInp.onchange = function() {
      var raw = parseInt(pctInp.value, 10);
      if (isNaN(raw)) raw = 35;
      var v = Math.max(5, Math.min(95, raw));
      pctInp.value = String(v);
      appState.api("/set", { method: "POST", body: JSON.stringify({ key: "recallColdFactorPercent", value: String(v) }) }).then(function() {
        appState.statusFn("✓ recallColdFactorPercent = " + v + "%");
      }).catch(appState.failFn);
    };
    pctWrap.appendChild(pctInp);
    pctWrap.appendChild(pctUnit);
    pctItem.appendChild(pctInfo);
    pctItem.appendChild(pctWrap);
    host.appendChild(pctItem);
    var injectInfo = el("div", "sc-desc");
    injectInfo.classList.add("sc-inline-note");
    host.appendChild(injectInfo);
    appState.api("/inject/preview").then(function(r) {
      var txt = r && r.text || "";
      if (!txt) {
        injectInfo.textContent = tr("当前注入：空（hot_memory 关或画像/记忆为空）");
        return;
      }
      var chars = txt.replace(/\s+/g, "").length;
      var tokens = Math.ceil(chars / 2);
      var lineCount = txt.split("\n").filter(function(l) {
        return l.trim().indexOf("- [") === 0;
      }).length;
      injectInfo.textContent = tr("当前直接注入 ≈ ") + tokens + " token（" + chars + tr(" 字符 · 双画像+记忆指针 ") + lineCount + tr(" 条）——每轮随提示词注入");
    }).catch(function() {
      injectInfo.textContent = "";
    });
    host.appendChild(el("div", "sc-h3", tr("深睡未消化策略")));
    host.appendChild(el("div", "sc-desc", tr("深睡每轮用 deepSleepLanded 判定本轮是否「已消化」。未消化时的两种取向在此切换——全重捞保证不丢料但可能无限重试；分级在连败达上限后放行并告警，避免无限重试烧 LLM。")));
    host.appendChild(UI.item(
      tr("深睡未消化策略 deepSleep.failPolicy"),
      tr("全重捞（retry）= 永不放弃，未消化就一直重捞本批（保证不丢料；材料永久失败时每轮都会重试）；分级（graded）= 连续失败达 N 轮后放行水位并记审计告警（避免无限重试烧 LLM）。缺省 graded。"),
      UI.select([
        { value: "retry", label: tr("全重捞（不丢料，永不放弃）") },
        { value: "graded", label: tr("分级（连败 N 轮后放行并告警）") }
      ], String(gVal("deepSleepFailPolicy", "graded")), function(v) {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "deepSleep.failPolicy", value: v }) }).then(function() {
          appState.statusFn(tr("✓ 深睡未消化策略 = ") + v);
        }).catch(appState.failFn);
      }, "deepSleep.failPolicy")
    ));
    var roundsInput = UI.input(String(gVal("deepSleepFailMaxRounds", 3)), function(raw) {
      var n = parseInt(raw, 10);
      if (isNaN(n)) n = 3;
      n = Math.max(1, Math.min(100, n));
      roundsInput.value = String(n);
      appState.api("/set", { method: "POST", body: JSON.stringify({ key: "deepSleep.failPolicyMaxRounds", value: String(n) }) }).then(function() {
        appState.statusFn(tr("✓ 分级策略连败上限 = ") + n + tr(" 轮"));
      }).catch(appState.failFn);
    }, { type: "number", width: "120px", ariaLabel: "deepSleep.failPolicyMaxRounds" });
    roundsInput.min = "1";
    roundsInput.max = "100";
    roundsInput.step = "1";
    host.appendChild(UI.item(
      tr("分级策略连败上限 deepSleep.failPolicyMaxRounds"),
      tr("仅在「分级」策略下生效（1–100，缺省 3）：连续失败达此轮数后放行深睡水位并记一条审计告警；全重捞策略下此项不参与判定。"),
      roundsInput
    ));
  }

  // src-client/panes-toggles.js
  function renderViewToggles(view, parsed, global) {
    view.textContent = "";
    UI.pageHead(tr("参数调节"), tr("注入参数（全局，写 ~/.dsh/suite/scheduler.json）与运行时通道。改动即时写回（scheduler.json 备份先行）。注入配置已迁全局，不再随 root 切换变化（root YAML 仅剩「配置原文」页可直接编辑）。"), { routes: ["/config", "/save", "/toggle"] });
    var pT1 = el("div");
    var pT2 = el("div");
    var pT3 = el("div");
    var pT4 = el("div");
    var _tb = UI.tabs("toggles", [{ id: "inject", label: tr("① 注入与画像"), pane: pT1 }, { id: "cap", label: tr("② 记忆与容量"), pane: pT2 }, { id: "model", label: tr("③ 模型与向量"), pane: pT3 }, { id: "sched", label: tr("④ 后台与调度"), pane: pT4 }]);
    view.appendChild(_tb.box);
    var g = global || {};
    renderTogglesInject(UI.cardIn(_tb.pane("inject")), view, parsed, g);
    renderTogglesCap(UI.cardIn(_tb.pane("cap")), g, { numSetting: numSetting2 });
    renderTogglesModel(UI.cardIn(_tb.pane("model")));
    renderTogglesSched(UI.cardIn(_tb.pane("sched")), g);
    appState.flushFolds();
  }
  function numSetting2(name, desc, val, key, unit, step) {
    var isFloat = typeof step === "number" && step < 1;
    var wrap = el("div", "sc-num-wrap");
    var inp = el("input");
    inp.type = "number";
    inp.className = "sc-input";
    inp.min = "0";
    inp.step = String(step || 100);
    inp.value = String(val);
    var unitEl = el("span", "sc-range-label", unit || "");
    inp.onchange = function() {
      var v = String(isFloat ? Math.max(0, parseFloat(inp.value) || 0) : Math.max(0, parseInt(inp.value, 10) || 0));
      appState.api("/set", { method: "POST", body: JSON.stringify({ key, value: v }) }).then(function() {
        appState.statusFn("✓ " + key + " = " + v);
      }).catch(appState.failFn);
    };
    wrap.appendChild(inp);
    wrap.appendChild(unitEl);
    return UI.item(name, desc, null, { children: [appState.metaBadges(key), wrap] });
  }
  function renderTogglesInject(host, view, parsed, g) {
    function gVal(key, fallback) {
      return g[key] !== void 0 && g[key] !== null ? g[key] : fallback;
    }
    (function() {
      var bar = el("div", "sc-search-bar");
      var q = el("input", "sc-input");
      q.type = "search";
      q.placeholder = tr("检索参数（名称 / 键名 / 说明）…");
      var cnt = el("span", "sc-search-count", "");
      bar.appendChild(q);
      bar.appendChild(cnt);
      q.oninput = function() {
        var kw = String(q.value || "").trim().toLowerCase();
        var items = view.querySelectorAll(".setting-item");
        var hit = 0;
        items.forEach(function(it) {
          var t = (it.textContent || "").toLowerCase();
          var show = !kw || t.indexOf(kw) > -1;
          it.classList.toggle("sc-filtered", !show);
          if (show) hit++;
        });
        cnt.textContent = kw ? tr("匹配 ") + hit + " / " + items.length + tr(" 项") : "";
      };
      host.appendChild(bar);
    })();
    host.appendChild(el("div", "sc-desc", tr("即时生效：改动直接写 ~/.dsh/suite/scheduler.json（写前备份）。")));
    var personaMode = String(gVal("persona", "both"));
    var PERSONA_TIERS = [["off", tr("关闭")], ["me", tr("仅注入我")], ["you", tr("仅注入你")], ["both", tr("全注入")]];
    var slider = el("div", "sc-persona-slider");
    PERSONA_TIERS.forEach(function(tier, i) {
      var cell = el("button", "sc-persona-cell" + (tier[0] === personaMode ? " active" : ""));
      cell.type = "button";
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", tier[0] === personaMode ? "true" : "false");
      cell.textContent = tier[1];
      cell.onclick = function() {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "injection.persona", value: tier[0] }) }).then(function() {
          appState.statusFn(tr("✓ persona 档位 = ") + tier[1]);
          slider.querySelectorAll(".sc-persona-cell").forEach(function(c) {
            c.classList.remove("active");
            c.setAttribute("aria-checked", "false");
          });
          cell.classList.add("active");
          cell.setAttribute("aria-checked", "true");
        }).catch(appState.failFn);
      };
      slider.appendChild(cell);
    });
    host.appendChild(UI.item(tr("画像 persona 注入档位 injection.persona"), tr("v17 已生效：关闭=不注入画像；仅注入我=只注入 agent 画像 AGENT.md（含 [原则] 习得原则与 [路径] 任务路径）；仅注入你=只注入用户画像 USER.md；全注入=双画像（默认）"), null, { children: [appState.metaBadges("injection.persona"), slider] }));
    appState.switchKeys().forEach(function(it) {
      var cur = it[0] === "injection.hot_memory" ? gVal("hot_memory", true) : parsed.flags[it[0]];
      if (typeof cur !== "boolean") return;
      host.appendChild(appState.makeToggle(it[0], it[1], it[2], cur, function(key, sw) {
        appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
          appState.statusFn(tr("✓ 已切换 ") + key);
        }).catch(function(e) {
          appState.failFn(e);
          sw.checked = !sw.checked;
        });
      }));
    });
    var levelMode = String(gVal("level", "smart"));
    var LEVEL_TIERS = [["off", "off"], ["low", "low"], ["medium", "medium"], ["high", "high"], ["smart", "smart"]];
    var lSlider = el("div", "sc-persona-slider");
    LEVEL_TIERS.forEach(function(tier, i) {
      var cell = el("button", "sc-persona-cell" + (tier[0] === levelMode ? " active" : ""));
      cell.type = "button";
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", tier[0] === levelMode ? "true" : "false");
      cell.textContent = tier[1];
      cell.title = "injection.level = " + tier[0];
      cell.onclick = function() {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "injection.level", value: tier[0] }) }).then(function() {
          appState.statusFn("✓ injection.level = " + tier[0]);
          lSlider.querySelectorAll(".sc-persona-cell").forEach(function(c) {
            c.classList.remove("active");
            c.setAttribute("aria-checked", "false");
          });
          cell.classList.add("active");
          cell.setAttribute("aria-checked", "true");
        }).catch(appState.failFn);
      };
      lSlider.appendChild(cell);
    });
    host.appendChild(UI.item(tr("热记忆注入强度 injection.level"), tr("off=不注入 / low(2 条) / medium(4 条) / high(8 条) / smart=智能上限(10 条)；当前：") + levelMode + tr("；改动即时生效（缓存作废）"), null, { children: [appState.metaBadges("injection.level"), lSlider] }));
    host.appendChild(appState.makeToggle("injectRelevance", tr("注入相关性重排 injectRelevance"), tr("开=按相关性选行（缺省）；关=回落「基线 + 新鲜度」选行。即时生效（下次注入即用）"), gVal("injectRelevance", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn(tr("✓ 已切换 ") + key + tr("（即时）"));
      }).catch(function(e) {
        appState.failFn(e);
        sw.checked = !sw.checked;
      });
    }));
    host.appendChild(numSetting2(tr("新鲜度保底槽 injectFreshSlots"), tr("注入时优先保留「最近新增条目」的槽位数（0–6，缺省 2）"), gVal("injectFreshSlots", 2), "injectFreshSlots", tr("条"), 1));
    host.appendChild(numSetting2(
      tr("注入总预算 injectBudgetChars"),
      tr("注入文本的字符总预算（**参与限额的三层之和**：稳定面 + 动态面 + 一次性；范围 800–20000，缺省 4000）。越界由服务端夹回并在面板标「已夹取」"),
      gVal("injectBudgetChars", 4e3),
      "injectBudgetChars",
      tr("字符"),
      100
    ));
    host.appendChild(numSetting2(
      tr("情境槽预算 injectSituationBudgetChars"),
      tr("情境槽（环记录按情境键匹配）的字符预算（范围 0–4000，缺省 1200）。它**独立于**注入总预算，不吃三层额度"),
      gVal("injectSituationBudgetChars", 1200),
      "injectSituationBudgetChars",
      tr("字符"),
      100
    ));
    host.appendChild(levelCapsSetting(gVal("injectLevelCaps", null)));
  }
  function levelCapsSetting(cur) {
    var DEF = { low: 2, medium: 4, high: 8, smart: 14 };
    var caps = cur && typeof cur === "object" && !Array.isArray(cur) ? cur : DEF;
    var wrap = el("div", "sc-num-wrap");
    var inputs = {};
    ["low", "medium", "high", "smart"].forEach(function(k) {
      var cell = el("span", "sc-range-label", k + " ");
      var inp = el("input");
      inp.type = "number";
      inp.className = "sc-input";
      inp.min = "0";
      inp.step = "1";
      inp.value = String(caps[k] !== void 0 && caps[k] !== null ? caps[k] : DEF[k]);
      inp.onchange = function() {
        var next = {};
        ["low", "medium", "high", "smart"].forEach(function(kk) {
          next[kk] = Math.max(0, parseInt(inputs[kk].value, 10) || 0);
        });
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "injectLevelCaps", value: JSON.stringify(next) }) }).then(function() {
          appState.statusFn("✓ injectLevelCaps = " + JSON.stringify(next));
        }).catch(appState.failFn);
      };
      inputs[k] = inp;
      cell.appendChild(inp);
      wrap.appendChild(cell);
    });
    return UI.item(
      tr("档位上限 injectLevelCaps"),
      tr("四档（low/medium/high/smart）各自的选行上限（**对象键**，缺省 2/4/8/14）。改后整对象写回；单档越界由服务端拒并回报"),
      null,
      { children: [appState.metaBadges("injectLevelCaps"), wrap] }
    );
  }
  function renderTogglesModel(host) {
    renderTogglesModelVec(host);
    renderTogglesModelLlm(host);
    renderEvalCard(host);
  }
  function renderTogglesModelVec(host) {
    host.appendChild(el("div", "sc-desc", tr("链路与模型选择；本组改动写入自持配置，需重载插件后生效。")));
    host.appendChild(el("div", "sc-h3", tr("向量与模型 · 当前链路")));
    host.appendChild(el("div", "sc-desc", tr("语义召回（vec.ts + bge-m3）运行态与开关。改动写 ~/.dsh/suite/scheduler.json，**需重载插件后生效**。本地 GPU 零 token；换云端在下方填 baseUrl/model。")));
    var vzone = el("div");
    function refreshVecZone() {
      appState.api("/vector/status2").then(function(s2) {
        vzone.textContent = "";
        var vb = el("div", "sc-ds-badges");
        var st = s2.provider || "off";
        vb.appendChild(UI.dsBadge("provider " + st, Derive.providerKind(st, ["DmlExecutionProvider"])).box);
        vb.appendChild(UI.dsBadge(tr("召回模式 ") + Derive.vecLabel(st), "ended").setTitle(tr("provider → 中文模式名：fusion=融合 / lexical=词法 / gpu-ready=就绪 / off=关")).box);
        vb.appendChild(UI.dsBadge(tr("缓存 ") + String(s2.cache && s2.cache.lines || 0) + tr(" 行"), "ended").box);
        if (s2.stats && s2.stats.queries) {
          vb.appendChild(UI.dsBadge(
            tr("召回 ") + String(s2.stats.queries) + tr(" 次 · ") + String(s2.stats.lastMode || "") + " · " + String(s2.stats.lastMs || 0) + "ms",
            "ended"
          ).setTitle(tr("最近查询: ") + String(s2.stats.lastQuery || "")).box);
        }
        vzone.appendChild(vb);
        var sw = el("input");
        sw.type = "checkbox";
        sw.className = "checkbox-container";
        sw.checked = !!(s2.running && s2.running.enabled);
        sw.addEventListener("change", function() {
          appState.api("/embed/config", { method: "POST", body: JSON.stringify({ embedEnabled: sw.checked }) }).then(function() {
            appState.statusFn(tr("✓ 向量 ") + (sw.checked ? tr("开") : tr("关")) + tr("（重载后生效）"));
          }).catch(function(e) {
            appState.failFn(e);
            sw.checked = !sw.checked;
          });
        });
        vzone.appendChild(UI.item(tr("语义召回开关 embedEnabled"), tr("开=融合召回（dense0.7+lexical0.3）；关=纯词法。写 scheduler.json"), sw));
        var curUrl = s2.running && s2.running.baseUrl || "http://127.0.0.1:11434/v1";
        var curModel = s2.running && s2.running.model || "bge-m3";
        var curKeyEnv = s2.running && s2.running.apiKeyEnv || "EMBED_API_KEY";
        var EMBED_PROVIDERS = [
          { id: "ollama", name: tr("Ollama（本机缺省）"), base: "http://127.0.0.1:11434/v1" },
          { id: "bge", name: tr("自建 bge-m3 桥（可选）"), base: "http://127.0.0.1:9915/v1", noEnum: true },
          { id: "lmstudio", name: "LM Studio", base: "http://127.0.0.1:1234/v1" },
          { id: "custom", name: tr("自定义 OpenAI 兼容（云端）"), base: "" }
        ];
        var provWrap = el("div", "sc-prov-btns");
        EMBED_PROVIDERS.forEach(function(p) {
          var card = el("button", "sc-btn" + (curUrl.indexOf(p.base) === 0 && p.base ? " on" : ""), p.name);
          card.type = "button";
          card.addEventListener("click", function() {
            uInp.value = p.base;
            var all = provWrap.querySelectorAll("button");
            all.forEach(function(b) {
              b.classList.remove("on");
            });
            card.classList.add("on");
            if (p.id === "custom") {
              uInp.value = "";
              uInp.focus();
            }
            enumModels();
          });
          provWrap.appendChild(card);
        });
        vzone.appendChild(UI.item(tr("语义检索来源"), tr("选服务 → 自动填地址 → 下方自动探测并列出可用模型（浏览器直连）。换服务/模型后请点「清缓存重建」。"), null, { children: [provWrap] }));
        var urlWrap = el("div", "sc-col-end");
        var uInp = el("input", "sc-input sc-w-xl");
        uInp.value = curUrl;
        uInp.placeholder = "http://127.0.0.1:11434/v1";
        var dlist = el("datalist");
        dlist.id = "sc-embed-endpoints";
        ["http://127.0.0.1:11434/v1", "http://localhost:11434/v1", "http://127.0.0.1:9915/v1", "http://127.0.0.1:1234/v1", "https://api.openai.com/v1", "https://api.deepseek.com/v1"].forEach(function(ep) {
          var o = el("option");
          o.value = ep;
          dlist.appendChild(o);
        });
        document.body.appendChild(dlist);
        uInp.setAttribute("list", "sc-embed-endpoints");
        var mSel = el("select", "sc-input sc-w-xl");
        mSel.title = "embedModel";
        var kInp = el("input", "sc-input sc-w-md");
        kInp.value = curKeyEnv;
        kInp.title = "embedApiKeyEnv";
        kInp.placeholder = tr("key 环境变量名（本地免填）");
        var probeHint = el("div", "sc-mem-sub muted");
        probeHint.classList.add("sc-max-xl");
        urlWrap.appendChild(uInp);
        urlWrap.appendChild(mSel);
        urlWrap.appendChild(kInp);
        urlWrap.appendChild(probeHint);
        vzone.appendChild(UI.item(tr("服务地址（OpenAI 兼容 /v1 根）"), tr("如 http://127.0.0.1:11434/v1（Ollama）或 http://127.0.0.1:9915/v1（自建桥）；改完回车自动探测。"), null, { children: [urlWrap] }));
        var saveWrap = el("div", "sc-vec-actions");
        var probeBtn = el("button", "sc-btn subtle", tr("重新探测"));
        probeBtn.type = "button";
        probeBtn.classList.add("sc-btn-xs");
        probeBtn.addEventListener("click", enumModels);
        var saveBtn = el("button", "sc-btn", tr("保存配置"));
        saveBtn.type = "button";
        saveBtn.classList.add("sc-btn-xs");
        saveBtn.addEventListener("click", function() {
          saveBtn.disabled = true;
          saveBtn.textContent = tr("保存中…");
          appState.api("/embed/config", { method: "POST", body: JSON.stringify({ embedBaseUrl: uInp.value.trim(), embedModel: mSel.value || curModel, embedApiKeyEnv: kInp.value.trim() || "EMBED_API_KEY" }) }).then(function() {
            appState.statusFn(tr("✓ 已保存（重载后生效——若换了服务/模型请点「清缓存重建」）"));
            saveBtn.disabled = false;
            saveBtn.textContent = tr("保存配置");
          }).catch(function(e) {
            saveBtn.disabled = false;
            saveBtn.textContent = tr("保存配置");
            appState.failFn(e);
          });
        });
        saveWrap.appendChild(probeBtn);
        saveWrap.appendChild(saveBtn);
        vzone.appendChild(saveWrap);
        var probing = false;
        var probeDone = false;
        function setSelectState(disabled, placeholder) {
          mSel.disabled = disabled;
          mSel.textContent = "";
          var opt = el("option");
          opt.value = "";
          opt.textContent = placeholder || tr("选择模型…");
          mSel.appendChild(opt);
        }
        function enumModels() {
          var b = uInp.value.trim().replace(/\/+$/, "");
          var root = b.replace(/\/v1$/, "");
          probeDone = false;
          if (!root) {
            setSelectState(true, tr("先填写服务地址"));
            probeHint.textContent = "";
            return;
          }
          try {
            var u = new URL(root);
            if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("x");
          } catch (e) {
            setSelectState(true, tr("URL 无效"));
            probeHint.textContent = tr("需 http(s):// 开头");
            return;
          }
          if (probing) return;
          probing = true;
          setSelectState(true, tr("加载可用模型中…"));
          probeHint.textContent = "";
          var finish = function(models, mode, note) {
            if (probeDone) return;
            probeDone = true;
            probing = false;
            if (Derive.has(models)) {
              mSel.disabled = false;
              mSel.textContent = "";
              models.forEach(function(md) {
                var o = el("option");
                o.value = md.id;
                o.textContent = md.id + (isEmbedLike(md.id) ? tr("（嵌入）") : "");
                if (md.id === curModel) o.selected = true;
                mSel.appendChild(o);
              });
              probeHint.textContent = "✓ " + models.length + tr(" 个模型 · ") + (mode || "") + (note ? " · " + note : "");
            } else {
              setSelectState(true, tr("（无可枚举模型）"));
              probeHint.textContent = note || tr("未探测到模型");
            }
          };
          fetch(root + "/v1/models", { signal: AbortSignal.timeout(6e3) }).then(function(r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          }).then(function(j) {
            var models = (j && j.data || []).map(function(m) {
              return { id: m.id };
            });
            if (Derive.has(models)) {
              finish(models, "openai-compatible");
              return;
            }
            probeHealth(root, finish);
          }).catch(function() {
            probeHealth(root, finish);
          });
        }
        function isEmbedLike(id) {
          return /embed|bge|m3|nomic|e5|text-embed/i.test(String(id));
        }
        function probeHealth(root, finish) {
          fetch(root + "/health", { signal: AbortSignal.timeout(5e3) }).then(function(r) {
            if (!r.ok) throw new Error("x");
            return r.json();
          }).then(function(j) {
            var fixed = j && j.model || "bge-m3";
            finish([{ id: fixed }], "health-fixed", tr("服务在但无 /models——用固定 ") + fixed + (j && j.dims ? "（" + j.dims + "d）" : ""));
          }).catch(function() {
            if (!probeDone) {
              probeDone = true;
              probing = false;
            }
            setSelectState(true, tr("（连接失败）"));
            probeHint.textContent = tr("无法连接该服务（/v1/models 与 /health 均无响应）——检查地址/服务是否在跑/CORS");
          });
        }
        uInp.addEventListener("change", function() {
          enumModels();
        });
        probeHint.textContent = curModel ? tr("当前：") + curModel + " @ " + curUrl : "";
        enumModels();
        var clearRow = el("div", "setting-item");
        var clearInfo = el("div", "setting-item-info");
        clearInfo.appendChild(el("div", "setting-item-name", tr("向量缓存")));
        clearInfo.appendChild(el("div", "setting-item-desc", tr("缓存按 模型+行文本+地址 指纹命中；换模型/改云端后点「清缓存重建」，下次召回按新模型自动重嵌（当前 ") + String(s2.cache && s2.cache.lines || 0) + tr(" 行薄行，~秒级）")));
        clearRow.appendChild(clearInfo);
        var clearBtn = UI.button(tr("清缓存重建"), function() {
          return appState.api("/vector/cache/clear", { method: "POST", body: "{}" }).then(function(r) {
            appState.statusFn(tr("✓ 向量缓存已清") + (r && r.removed ? tr("（删除 ") + r.removed + "）" : "") + tr("——下次召回按当前模型自动重嵌"));
          });
        }, { danger: true, async: true, busyText: tr("清理中…"), okText: tr("向量缓存已清"), confirm: tr("清空向量缓存并重建？换模型后必须执行（否则旧向量混用导致语义失真）。") });
        var clearCtl = el("div", "setting-item-control");
        clearCtl.appendChild(clearBtn);
        clearRow.appendChild(clearCtl);
        vzone.appendChild(clearRow);
        if (Derive.providerDown(st)) {
          var guide = el("div");
          guide.appendChild(el("div", "sc-mem-group-title", tr("如何启用语义检索")));
          var g1 = el("div", "setting-item");
          var g1i = el("div", "setting-item-info");
          g1i.appendChild(el("div", "setting-item-name", tr("方案 A · 本地 GPU 服务（推荐，零 token 成本）")));
          g1i.appendChild(el("div", "setting-item-desc", tr("需自备嵌入服务（OpenAI 兼容 /v1/embeddings）：Ollama（ollama pull bge-m3，:11434）或自建 bge-m3 桥（:9915）。当前检测不可达。")));
          g1.appendChild(g1i);
          guide.appendChild(g1);
          var g2 = el("div", "setting-item");
          var g2i = el("div", "setting-item-info");
          g2i.appendChild(el("div", "setting-item-name", tr("方案 B · 云端 API")));
          g2i.appendChild(el("div", "setting-item-desc", tr("手写 ~/.dsh/suite/scheduler.json：embedBaseUrl=云端端点 + embedModel=模型名 + embedApiKeyEnv=key 环境变量名；改后重载并「清缓存重建」。")));
          g2.appendChild(g2i);
          guide.appendChild(g2);
          guide.appendChild(el("div", "sc-desc", tr("未配置时自动词法召回（可用但无语义）；配置后本页 provider 变就绪。")));
          vzone.appendChild(guide);
        }
      }).catch(function(e) {
        vzone.textContent = "";
        vzone.appendChild(el("div", "sc-desc", tr("向量状态不可用: ") + e.message));
      });
    }
    host.appendChild(vzone);
    refreshVecZone();
    if (window._scVecTimer) {
      clearInterval(window._scVecTimer);
      window._scVecTimer = null;
    }
    window._scVecTimer = setInterval(function() {
      try {
        refreshVecZone();
      } catch (e) {
      }
    }, 3e4);
  }
  function renderTogglesModelLlm(host) {
    host.appendChild(el("div", "sc-h3", tr("蒸馏 / 深睡模型")));
    host.appendChild(el("div", "sc-desc", tr("蒸馏与深度睡眠各自可选宿主模型（直接用 DeepSeek Harness 模型——先在 Harness 配置好模型，这里下拉选即可）。「继承主会话」= 不指定，跟随当前会话模型。档位（reasoning effort）由模型适配器声明，未声明则沿用模型默认。改动写 scheduler.json，需重载生效。")));
    var llmCard = el("div");
    host.appendChild(llmCard);
    function renderLlmSelect(container, keyP, keyM, keyE, label, desc) {
      var item = el("div", "setting-item");
      var info = el("div", "setting-item-info");
      info.appendChild(el("div", "setting-item-name", label));
      info.appendChild(el("div", "setting-item-desc", desc));
      item.appendChild(info);
      var p = modelPicker({
        provider: llmVal[keyP] || "",
        model: llmVal[keyM] || "",
        effort: llmVal[keyE] || "",
        labels: { inherit: tr("继承主会话（默认）"), provider: tr("服务"), model: tr("模型"), effort: tr("档位") },
        onChange: function(patch) {
          var toPost = {};
          if (patch.provider !== void 0 || patch.model !== void 0) {
            toPost[keyP] = patch.provider || "";
            toPost[keyM] = patch.model || "";
            llmVal[keyP] = toPost[keyP];
            llmVal[keyM] = toPost[keyM];
          }
          if (patch.effort !== void 0) {
            toPost[keyE] = patch.effort || "";
            llmVal[keyE] = toPost[keyE];
          }
          if (!Object.keys(toPost).length) return;
          appState.api("/distill/config", { method: "POST", body: JSON.stringify(toPost) }).then(function() {
            var combo = llmVal[keyP] && llmVal[keyM] ? llmVal[keyP] + "/" + llmVal[keyM] : tr("继承主会话");
            appState.statusFn("✓ " + label + tr(" 已设") + "：" + combo + (llmVal[keyE] ? " @" + llmVal[keyE] : "") + tr("——重载后生效"));
          }).catch(appState.failFn);
        }
      });
      item.appendChild(p.box);
      container.appendChild(item);
      return p;
    }
    var llmVal = {};
    appState.api("/llm/models").then(function() {
      return appState.api("/distill/config").then(function(d) {
        var run = d && d.running || {}, p = d && d.persisted || {};
        ["distill", "sleep"].forEach(function(k) {
          var P = k + "Provider", M = k + "Model", E = k + "Effort";
          llmVal[P] = run[P] != null ? run[P] : p[P] || "";
          llmVal[M] = run[M] != null ? run[M] : p[M] || "";
          llmVal[E] = run[E] != null ? run[E] : p[E] || "";
        });
        llmCard.textContent = "";
        renderLlmSelect(llmCard, "distillProvider", "distillModel", "distillEffort", tr("蒸馏模型"), tr("事件蒸馏（会话闲置提炼可复用知识）用的模型。继承=跟随主会话。"));
        renderLlmSelect(llmCard, "sleepProvider", "sleepModel", "sleepEffort", tr("深睡归纳模型"), tr("深度睡眠（离线回想提炼 [原则]/[路径] 画像成长）用的模型。继承=跟随主会话。"));
      });
    }).catch(function() {
      llmCard.appendChild(el("div", "sc-desc", tr("⚠ 宿主模型不可用")));
    });
  }
  function renderTogglesSched(host, g) {
    function gVal(key, fallback) {
      return g[key] !== void 0 && g[key] !== null ? g[key] : fallback;
    }
    host.appendChild(el("div", "sc-desc", tr("高级项：蒸馏节流 / 召回与库版本 / 认知环；改后需重载生效。")));
    host.appendChild(el("div", "sc-h3", tr("蒸馏节流（运行时通道）")));
    var dDesc = el("div", "sc-desc", tr("写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前值读取中…"));
    host.appendChild(dDesc);
    var dZone = el("div");
    dZone.appendChild(el("div", "sc-desc", tr("读取中…")));
    host.appendChild(dZone);
    host.appendChild(el("div", "sc-h3", tr("召回与库版本")));
    var fusRow = el("div", "setting-item");
    var fusInfo = el("div", "setting-item-info");
    fusInfo.appendChild(el("div", "setting-item-name", tr("召回融合策略 recallFusion")));
    fusInfo.appendChild(el("div", "setting-item-desc", tr("rrf=排名融合（缺省，对离群分稳健）；weighted=旧 min-max 加权（回滚用）。阈值口径与融合解耦——始终用绝对余弦（ACT-024）")));
    fusInfo.appendChild(appState.metaBadges("recallFusion"));
    var fusRowCtrl = el("div", "sc-persona-slider");
    var FUS_TIERS = [["rrf", "RRF"], ["weighted", tr("加权")]];
    var fusMode = String(gVal("recallFusion", "rrf"));
    FUS_TIERS.forEach(function(tier) {
      var cell = el("button", "sc-persona-cell" + (tier[0] === fusMode ? " active" : ""));
      cell.type = "button";
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", tier[0] === fusMode ? "true" : "false");
      cell.textContent = tier[1];
      cell.title = "recallFusion = " + tier[0] + tr("（需重载生效）");
      cell.onclick = function() {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "recallFusion", value: tier[0] }) }).then(function() {
          appState.statusFn("✓ recallFusion = " + tier[0] + tr("（需重载插件生效）"));
          fusRowCtrl.querySelectorAll(".sc-persona-cell").forEach(function(c) {
            c.classList.remove("active");
            c.setAttribute("aria-checked", "false");
          });
          cell.classList.add("active");
          cell.setAttribute("aria-checked", "true");
        }).catch(appState.failFn);
      };
      fusRowCtrl.appendChild(cell);
    });
    fusRow.appendChild(fusInfo);
    fusRow.appendChild(fusRowCtrl);
    host.appendChild(fusRow);
    host.appendChild(appState.makeToggle("bankGit", tr("记忆库 git 版本化 bankGit"), tr("每次成功写入后提交库快照（可 diff/revert；库在 ~/.dsh 下，不入公开树）。缺省开"), gVal("bankGit", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn(tr("✓ 已切换 ") + key + tr("（需重载生效）"));
      }).catch(function(e) {
        appState.failFn(e);
        sw.checked = !sw.checked;
      });
    }));
    host.appendChild(el("div", "sc-h3", tr("认知环（MCL · 熟悉度分流 + 有界再引导）")));
    host.appendChild(appState.makeToggle("mclEnabled", tr("启用认知环 mclEnabled"), tr("慢通道首步注入「薄契约 + top-k 指针」并按需再引导一次；快通道零额外往返。缺省开（false = 一键回滚）"), gVal("mclEnabled", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn(tr("✓ 已切换 ") + key + tr("（需重载生效）"));
      }).catch(function(e) {
        appState.failFn(e);
        sw.checked = !sw.checked;
      });
    }));
    host.appendChild(numSetting2(tr("熟悉度阈值 mclFamiliarThreshold"), tr("「用户文本 ↔ 命中索引行」的绝对余弦阈值（0–1，缺省 0.65；ACT-024 校准：0.65 → 触发率 ~2% 且阈上全为真命中）"), gVal("mclFamiliarThreshold", 0.65), "mclFamiliarThreshold", "", 0.01));
    host.appendChild(numSetting2(tr("再引导上限 mclMaxNudges"), tr("慢通道最多再引导次数（0–3，缺省 1；绝不死锁）"), gVal("mclMaxNudges", 1), "mclMaxNudges", tr("次"), 1));
    host.appendChild(numSetting2(tr("材料预算 mclBudgetChars"), tr("慢通道材料硬预算（120–4000 字符，缺省 600；只作用于慢通道首步）"), gVal("mclBudgetChars", 600), "mclBudgetChars", tr("字符"), 50));
    host.appendChild(numSetting2(tr("指针条数 mclTopK"), tr("慢通道注入的指针条数（1–5，缺省 3）"), gVal("mclTopK", 3), "mclTopK", tr("条"), 1));
    host.appendChild(appState.makeToggle("mclAudit", tr("认知环审计流 mclAudit"), tr("每步一行写 suite/knowledge/audit/mcl-audit.jsonl（通道/熟悉度/注入/再引导/合规）"), gVal("mclAudit", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn(tr("✓ 已切换 ") + key + tr("（需重载生效）"));
      }).catch(function(e) {
        appState.failFn(e);
        sw.checked = !sw.checked;
      });
    }));
    function distillSave(patch, onFail) {
      return appState.api("/distill/config", { method: "POST", body: JSON.stringify(patch) }).then(function() {
        appState.statusFn(tr("✓ 已写入 ") + Object.keys(patch).join(",") + tr("（重载后生效）"));
      }).catch(function(e) {
        appState.failFn(e);
        if (onFail) onFail();
      });
    }
    function distillToggle(key, name, desc, initial) {
      var item = el("div", "setting-item");
      var info = el("div", "setting-item-info");
      info.appendChild(el("div", "setting-item-name", name));
      info.appendChild(el("div", "setting-item-desc", desc));
      var sw = el("input", "checkbox-container");
      sw.type = "checkbox";
      sw.checked = !!initial;
      sw.onchange = function() {
        var patch = {};
        patch[key] = sw.checked;
        distillSave(patch, function() {
          sw.checked = !sw.checked;
        });
      };
      item.appendChild(info);
      item.appendChild(sw);
      return item;
    }
    function distillInput(key, name, desc, initial, kind, min) {
      var item = el("div", "setting-item");
      var info = el("div", "setting-item-info");
      info.appendChild(el("div", "setting-item-name", name));
      info.appendChild(el("div", "setting-item-desc", desc));
      var wrap = el("div", "sc-num-wrap");
      var inp = el("input", "sc-input");
      inp.value = String(initial);
      if (kind === "minutes") {
        inp.type = "number";
        inp.min = String(min || 1);
        inp.step = "1";
      } else if (kind === "chars") {
        inp.type = "number";
        inp.min = "0";
        inp.step = "50";
      } else {
        inp.type = "text";
        inp.placeholder = tr("留空=继承主会话模型");
        inp.className = "sc-input sc-w-sm";
      }
      var unitEl = el("span", "sc-range-label", kind === "minutes" ? tr("分钟") : kind === "chars" ? tr("字符") : "");
      inp.onchange = function() {
        var v;
        if (kind === "text") v = inp.value.trim();
        else v = Math.max(kind === "minutes" ? min || 1 : 0, parseInt(inp.value, 10) || 0);
        var patch = {};
        patch[key] = kind === "minutes" ? v * 6e4 : v;
        distillSave(patch, function() {
          inp.value = String(initial);
        });
      };
      wrap.appendChild(inp);
      wrap.appendChild(unitEl);
      item.appendChild(info);
      item.appendChild(wrap);
      return item;
    }
    appState.api("/distill/config").then(function(d) {
      var r = d && d.running || {};
      var p = d && d.persisted || {};
      function val(k, dflt) {
        return r[k] != null ? r[k] : p[k] != null ? p[k] : dflt;
      }
      var curModelTxt = (function() {
        var dp = val("distillProvider", ""), dm = val("distillModel", "");
        return dp && dm ? dp + "/" + dm : "继承主会话";
      })();
      dDesc.textContent = tr("写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前：蒸馏 ") + (val("enableDistill", true) ? tr("开") : tr("关")) + tr(" / 空闲 ") + Math.round(val("idleWakeMs", 6e5) / 6e4) + tr(" 分钟 / 本轮最少 ") + val("minTurnChars", 200) + tr(" 字符 / 预筛 ") + (val("distillPrescan", true) ? tr("开") : tr("关")) + tr(" / 蒸馏模型 ") + curModelTxt + "。";
      dZone.textContent = "";
      dZone.appendChild(distillToggle("enableDistill", tr("守藏蒸馏器 enableDistill"), tr("关=不注册蒸馏器（/suite 等只读视图仍可用）；改动需重载生效"), val("enableDistill", true)));
      dZone.appendChild(distillToggle("distillPrescan", tr("零成本预筛 distillPrescan"), tr("spawn 前先扫增量信号词 + pending 候选，皆无则跳过（不唤醒 LLM，省成本）"), val("distillPrescan", true)));
      dZone.appendChild(distillInput("idleWakeMs", tr("空闲唤醒 idleWakeMs"), tr("turn 结束后空闲满此时长才蒸馏（≥1 分钟，默认 10 分钟）"), Math.round(val("idleWakeMs", 6e5) / 6e4), "minutes", 1));
      dZone.appendChild(distillInput("minTurnChars", tr("本轮最少字符 minTurnChars"), tr("本轮新增正文少于此值跳过蒸馏（水位仍推进；0=不设限，默认 200）"), val("minTurnChars", 200), "chars"));
      var pendRow = el("div", "setting-item");
      var pendInfo = el("div", "setting-item-info");
      pendInfo.appendChild(el("div", "setting-item-name", tr("立即处理 pending 候选")));
      pendInfo.appendChild(el("div", "setting-item-desc", tr("手动触发一轮蒸馏——携带 pending/ 候选（如 project-defer 降级卡）重裁决入册。workspace 反解修复后 project 卡直写工作区 devref。")));
      pendRow.appendChild(pendInfo);
      var pendBtn = el("button", "sc-btn subtle", tr("立即蒸馏一次"));
      pendBtn.type = "button";
      pendBtn.classList.add("sc-btn-xs");
      pendBtn.addEventListener("click", function() {
        pendBtn.disabled = true;
        pendBtn.textContent = tr("蒸馏中…（约 1-2 分钟）");
        appState.api("/distill/run", { method: "POST", body: "{}" }).then(function(rr) {
          pendBtn.disabled = false;
          pendBtn.textContent = tr("立即蒸馏一次");
          if (rr && rr.ok) appState.statusFn("✓ " + (rr.note || tr("蒸馏完成")));
          else appState.statusFn("⚠ " + (rr && rr.note || tr("蒸馏未触发")) + tr("——根会话活跃中会跳过，等闲置自动跑"));
        }).catch(function(e) {
          pendBtn.disabled = false;
          pendBtn.textContent = tr("立即蒸馏一次");
          appState.failFn(e);
        });
      });
      var pendCtl = el("div", "setting-item-control");
      pendCtl.appendChild(pendBtn);
      pendRow.appendChild(pendCtl);
      dZone.appendChild(pendRow);
      if (d && d.active === false) {
        dZone.appendChild(el("div", "sc-desc", tr("⚠ 调度器未就绪：显示值为持久文件值，运行时值需插件激活后读取")));
      }
    }).catch(function(e) {
      dZone.textContent = "";
      dZone.appendChild(el("div", "sc-desc", tr("⚠ 读取失败：") + e.message));
    });
  }

  // src-client/styles.js
  var CSS = window.__SC_CSS__ = [
    /* ══════════ ① 令牌层 ══════════ */
    "#scpanl-root,.sc-trigger,.sc-fab{",
    /* 语义色 */
    "--sc-bg1:var(--dsw-alias-bg-layer-1,#1e1e1e);",
    "--sc-bg-card:#2a2a2f; /* v9 对齐：卡面比页面亮一档（凸卡体系）；sc-dark/sc-light 会覆盖 */",
    "--sc-bg2:var(--dsw-alias-bg-layer-2,#191919);",
    "--sc-bg3:var(--dsw-alias-bg-layer-3,#262626);",
    "--sc-text:var(--dsw-alias-label-primary,#e6e6e6);",
    "--sc-muted:var(--dsw-alias-label-secondary,#a2a2a2);",
    "--sc-faint:var(--dsw-alias-label-tertiary,#707070);",
    "--sc-border:var(--dsw-alias-border-l2,#2d2d2d);",
    "--sc-border-strong:var(--dsw-alias-border-l1,#404040);",
    /* 分隔线（卡内/页头）——v9 的 --border2：比 --sc-border 亮一档（深色 #33333a）。
     * v7 一致性补丁的实测结论：「分隔线与卡面只差 1/255 会看不见」，故分隔线随卡面一起提亮。 */
    "--sc-border2:var(--dsw-alias-border-l3,#33333a);",
    "--sc-accent:var(--dsw-alias-brand-primary,hsl(254deg 80% 68%));",
    "--sc-accent-hover:var(--dsw-alias-brand-primary,hsl(254deg 80% 74%));",
    "--sc-ok:var(--dsw-alias-state-success-primary,#3fb950);",
    "--sc-warn:var(--dsw-alias-state-warn-primary,#e8a33d);",
    "--sc-err:var(--dsw-alias-state-error-primary,#e5534b);",
    "--sc-info:#4a9eff;",
    "--sc-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));",
    "--sc-active:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.11));",
    /* 派生色：由主色 color-mix 生成，杜绝业务层散写 rgba 常量 */
    "--sc-accent-bg:color-mix(in srgb,var(--sc-accent) 14%,transparent);",
    /* 选中态底（导航/标签）：v9 的 --brand-soft 是**实色**（dark #251f3a / light #f0ecff），
     * 用 color-mix 叠出来的同色系偏亮偏蓝 ⇒ 两套皮肤各给实色，host 皮肤退回按主色派生。 */
    "--sc-accent-soft:color-mix(in srgb,var(--sc-accent) 16%,var(--sc-bg2));",
    "--sc-accent-bd:color-mix(in srgb,var(--sc-accent) 45%,transparent);",
    "--sc-ok-bg:color-mix(in srgb,var(--sc-ok) 15%,transparent);",
    "--sc-warn-bg:color-mix(in srgb,var(--sc-warn) 17%,transparent);",
    "--sc-err-bg:color-mix(in srgb,var(--sc-err) 15%,transparent);",
    "--sc-info-bg:color-mix(in srgb,var(--sc-info) 16%,transparent);",
    /* 标尺：4px 基准 / 8pt 节奏；--sc-gap-* = 「留白即分组」的语义层 */
    "--sc-sp-1:4px;--sc-sp-2:8px;--sc-sp-3:12px;--sc-sp-4:16px;--sc-sp-5:24px;--sc-sp-6:32px;--sc-sp-7:48px;",
    "--sc-gap-row:8px;--sc-gap-item:12px;--sc-gap-group:24px;",
    "--sc-pad-card:12px 14px;",
    /* 字阶（模数 1.15，中文可读下限 12px）+ 行高三档 + 字重 + 字距 */
    "--sc-fs-xs:12px;--sc-fs-sm:13px;--sc-fs-md:14px;--sc-fs-lg:16px;--sc-fs-xl:20px;--sc-fs-2xl:28px;",
    "--sc-lh-tight:1.35;--sc-lh-normal:1.6;--sc-lh-loose:1.75;",
    "--sc-fw-normal:400;--sc-fw-medium:500;--sc-fw-semibold:600;--sc-fw-bold:700;",
    "--sc-ls-tight:-.01em;--sc-ls-wide:.06em;",
    /* 圆角四档 + 阴影三级 + 动效两速 */
    "--sc-r-sm:6px;--sc-r-md:8px;--sc-r-lg:12px;--sc-r-pill:999px;",
    "--sc-shadow-1:0 1px 2px rgba(0,0,0,.20);--sc-shadow-2:0 4px 16px rgba(0,0,0,.28);--sc-shadow-3:0 18px 56px rgba(0,0,0,.45);",
    "--sc-t-fast:.12s;--sc-t-base:.18s;--sc-ease:cubic-bezier(.4,0,.2,1);",
    "--sc-ring:0 0 0 2px color-mix(in srgb,var(--sc-accent) 55%,transparent);",
    "--sc-disabled-op:.45;",
    /* 宽度：控件 / 阅读 / 布局 */
    "--sc-w-control:280px;--sc-w-read:72ch;--sc-w-sm:180px;--sc-w-md:200px;--sc-w-lg:300px;--sc-w-xl:320px;",
    "--sc-nav-w:216px;",
    /* 容器级内距（v9 对齐）：`.sc-nav`/`.sc-statusbar` 属容器级选择器，门禁禁裸 px ⇒ 收敛为令牌 */
    "--sc-nav-pad:14px 10px 10px;--sc-nav-item-pad:8px 10px;--sc-statusbar-pad:7px 16px;",
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",sans-serif;',
    /* 根字号对齐 v9 的 body（13px/1.6）：面板此前继承宿主 16px ⇒ 未显式定字号的文本比方案大一档 */
    "font-size:13px;line-height:1.6;",
    "}",
    /* ══════════ ①.5 组件适配层（U2/U4 · 2026-09-26）══════════
     * **宿主组件包裹容器 + 降级自绘件**的样式。
     * ⚠ 位置有语义：在**令牌层之后**（本层用 --sc-* 变量）、**组件规则之前**
     *   —— 同层选择器由位置决胜负；改位置须复查 `audit-css-usage` 的「同层重复定义」判据。
     * ⚠ 本层曾抽到 `styles-host-ui.js`，因 `__SC_CSS__` 锚点限制（见文件头）**回退内联**；
     *   对应 `check-module-growth` 超基线走**出路② rebase**（理由：全是本轮功能必需的规则）。 */
    /* U2：宿主组件（primitives 路径）的**包裹容器** + 自绘降级件（进度轨道 / 分段）。
     *   `toggle`/`button` 走宿主 React 组件时用 `mountReact` 挂进一个 span —— 壳由本面板 CSS 定位，
     *   外观由宿主组件自带样式管（只做布局贴合，不覆盖宿主观感）。
     *   ⚠ 进度轨道/分段的尺寸与配色**逐值沿用**组件时代为对齐方案接管过的 WA 变量
     *     （6px 轨道 / --sc-bg3 / --sc-accent / pill；28px 胶囊 / 内距 0·14 / 12.5px）
     *     ⇒ 宿主路径与降级路径**观感一致**。
     *   ⚠ 以下多条规则**合并进一行字符串**（纯格式，逐字符等价），以守 check-module-growth 行数棘轮。 */
    "#scpanl-root .sc-host-switch,#scpanl-root .sc-host-btn{display:inline-flex;align-items:center;vertical-align:middle;}#scpanl-root .sc-host-btn{flex:none;}#scpanl-root .sc-prog-track{height:6px;border-radius:var(--sc-r-pill);background:var(--sc-bg3);overflow:hidden;}#scpanl-root .sc-prog-fill{height:100%;width:0;border-radius:var(--sc-r-pill);background:var(--sc-accent);transition:width var(--sc-t-base) var(--sc-ease);}",
    /* ⚠ 分段（.sc-tabnav/.sc-tabbtn）的规则**不在此处** —— 第 500 行附近已有一份（本轮先加、
     *   后与既有位置重合，被 audit-css-usage 判「同层重复定义 4 个」）。单一来源留在那一处。 */
    /* U4 侧栏全局面板图标（sidebar.panellist）：尺寸由宿主 size prop 给定 ⇒ 此处不写死尺寸。 */
    ".sc-panel-icon{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:0;border-radius:var(--sc-r-sm);background:transparent;padding:var(--sc-sp-1);color:var(--sc-text);transition:background var(--sc-t-base) var(--sc-ease);}.sc-panel-icon:hover{background:var(--sc-hover);}.sc-panel-icon.on{background:var(--sc-accent-soft);}",
    /* ══════════ ② 基础层 ══════════ */
    "#scpanl-root *{box-sizing:border-box;}",
    "#scpanl-root :focus{outline:none;}",
    "#scpanl-root :focus-visible{outline:none;box-shadow:var(--sc-ring);border-radius:var(--sc-r-sm);}",
    "#scpanl-root button:disabled,#scpanl-root input:disabled,#scpanl-root select:disabled,",
    "#scpanl-root textarea:disabled{opacity:var(--sc-disabled-op);cursor:not-allowed;}",
    '#scpanl-root [aria-disabled="true"]{opacity:var(--sc-disabled-op);pointer-events:none;}',
    /* 两种「看不见」是**不同语义**，不要共用一个状态位：
       .sc-hidden   = 折叠态（由 Fold 单一数据源驱动）
       .sc-filtered = 检索过滤（由关键词派生）
       旧实现两者都用 .sc-hidden，一旦折叠与检索叠在同一元素上就会互相覆盖（收起/过滤互相打架）。 */
    "#scpanl-root .sc-hidden,#scpanl-root .sc-filtered{display:none !important;}",
    /* 滚动条（WebKit + Firefox 双写） */
    "#scpanl-root .sc-view,#scpanl-root .sc-logwrap,#scpanl-root .sc-card-body,#scpanl-root .sc-nav{",
    "scrollbar-width:thin;scrollbar-color:var(--sc-border-strong) transparent;}",
    "#scpanl-root ::-webkit-scrollbar{width:10px;height:10px;}",
    "#scpanl-root ::-webkit-scrollbar-track{background:transparent;}",
    "#scpanl-root ::-webkit-scrollbar-thumb{background:var(--sc-border-strong);border-radius:5px;",
    "border:2px solid transparent;background-clip:padding-box;}",
    "#scpanl-root ::-webkit-scrollbar-thumb:hover{background:var(--sc-faint);background-clip:padding-box;}",
    /* 排版基类：层级由「字号 + 字重 + 色阶」三重编码，不靠单一变量 */
    "#scpanl-root .sc-h1{font-size:clamp(15px,1.35vw,18px);font-weight:650;line-height:var(--sc-lh-normal);",
    "letter-spacing:.2px;color:var(--sc-text);margin:0 0 var(--sc-sp-1);}",
    /* .sc-h2 已于 2026-09-13 删除（S3 门禁收口）：JS 零使用 = 死规则；标题层级由 .sc-h1（页级）/ .sc-h3（组级）承担 */
    "#scpanl-root .sc-h3{font-size:var(--sc-fs-xs);font-weight:var(--sc-fw-semibold);line-height:var(--sc-lh-tight);",
    "color:var(--sc-muted);margin:var(--sc-gap-item) 0 var(--sc-sp-1);}",
    "#scpanl-root .sc-desc{font-size:clamp(12px,.98vw,13px);line-height:1.55;color:var(--sc-muted);",
    "max-width:640px;margin:0 0 var(--sc-gap-item);}",
    /* 动作行（v9 .acts）：左按钮 + 右侧说明文字，与卡间留白一致（设置页「恢复默认」用） */
    "#scpanl-root .sc-acts{display:flex;align-items:center;gap:var(--sc-gap-item);flex-wrap:wrap;}",
    "#scpanl-root .sc-acts-note{font-size:var(--sc-fs-xs);color:var(--sc-faint);line-height:var(--sc-lh-normal);}",
    /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 h1/desc）。
     * v9 对齐（2026-09-13）：页头**不随内容滚动** —— 结构上移入 .sc-headslot（钉在 .sc-main 顶部，
     * 与 v9 的 .pagehead 同为 flex:none + 底部分隔线全宽），内距取 v9 实测 18/24/14。 */
    "#scpanl-root .sc-headslot{flex:none;background:var(--sc-bg-page);}",
    "#scpanl-root .sc-headslot:empty{display:none;}",
    "#scpanl-root .sc-pagehead{margin:0;padding:18px 24px 14px;border-bottom:1px solid var(--sc-border2);display:flex;flex-wrap:wrap;align-items:flex-start;gap:var(--sc-gap-item);}",
    "#scpanl-root .sc-pagehead .sc-h1{margin-bottom:var(--sc-sp-1);}",
    "#scpanl-root .sc-pagehead .sc-desc{margin-bottom:0;}",
    /* 架构视图（2026-09-13）：小节标题 / 事实行 / JSON 原文——供 renderFacts 与 rawDetails 使用 */
    "#scpanl-root .sc-sub{margin:var(--sc-sp-2) 0 var(--sc-sp-1);font-size:clamp(12px,.95vw,13px);font-weight:600;color:var(--sc-fg2);}",
    "#scpanl-root .sc-facts-row{padding:var(--sc-sp-1) 0;border-bottom:1px dashed var(--sc-border2);}",
    "#scpanl-root .sc-code{margin:var(--sc-sp-1) 0 0;padding:var(--sc-sp-2);background:var(--sc-bg2);border:1px solid var(--sc-border2);border-radius:var(--sc-radius,8px);font-size:clamp(11px,.88vw,12px);line-height:1.5;color:var(--sc-fg2);overflow:auto;max-height:320px;}",
    /* ══════════ ③ 布局层 ══════════ */
    /* ── 层叠值对齐宿主体系（2026-09-26 U1 根因实修） ──
     * **判因（真机实测，非推断）**：本面板原为 \`z-index:9900\`，而宿主自己的层叠体系是
     *   引导 900 · 弹窗/拖放/灯箱 1000 · 菜单/Toast/Tooltip 1100（扫宿主 lib 实测）。
     *   ⇒ 面板一打开就把**宿主审批/权限/提问弹窗压在下面**：实测命中测试
     *   \`{ourZ:"9900", hostZ:"1000", topElAtHostModal:"sc-view", hostModalCovered:true}\`
     *   —— 宿主弹窗中心点最顶层元素是我们的 \`.sc-view\`，用户**点不到审批按钮**。
     *   这正是「会掩盖其他问题、让失败不可观测」类缺陷：面板看着正常，用户却卡在批不了。
     * **修法**：面板落到宿主 Modal **之下** = \`950\`（宿主实测体系：主框架 ≤20 · 引导 900 ·
     *   弹窗 1000 · 菜单/Toast/Tooltip 1100）⇒ 审批弹窗、结果通知、工具提示**全部浮在面板之上**。
     *   ⚠ **为什么不取 1000（第一版修错了，已纠正）**：与宿主 Modal **同层时胜负由 DOM 顺序决定**，
     *     而本面板是 \`document.body.appendChild\` 追加在 **body 末尾** ⇒ 同层必赢，遮挡照旧
     *     （实测复核：改 1000 后 \`hostModalCovered\` 仍为 \`true\`）。要根治就得在**数值上**低于它，
     *     不能指望顺序 —— 宿主随时可能把弹窗容器挪位置。 */
    "#scpanl-mask{position:fixed;inset:0;z-index:950;background:rgba(0,0,0,.55);display:none;",
    "align-items:center;justify-content:center;color:var(--sc-text);padding:clamp(8px,2vw,24px);}",
    "#scpanl-mask.open{display:flex;}",
    "#scpanl-modal{width:min(1480px,96vw);height:min(900px,92vh);display:flex;overflow:hidden;",
    "border-radius:var(--sc-r-lg);background:var(--sc-bg1);border:1px solid var(--sc-border);",
    "box-shadow:var(--sc-shadow-3);}",
    /* 左导航 */
    "#scpanl-root .sc-nav{width:var(--sc-nav-w);flex:none;background:var(--sc-bg2);",
    "padding:var(--sc-nav-pad);display:flex;flex-direction:column;gap:2px;",
    "border-right:1px solid var(--sc-border);overflow-y:auto;overflow-x:hidden;}",
    /* 导航标题/分组标题：v9 的 .nav-title 规格（10.5px / 700 / .9px 字距 / 10-10-6 内距），首项顶距归零 */
    "#scpanl-root .sc-nav-title{font-size:10.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;",
    "color:var(--sc-faint);padding:10px 10px 6px;}",
    "#scpanl-root .sc-nav-title:first-child{padding-top:0;}",
    "#scpanl-root .sc-nav-group{margin:0;padding:10px 10px 6px;font-size:10.5px;font-weight:700;",
    "letter-spacing:.9px;text-transform:uppercase;color:var(--sc-faint);}",
    "#scpanl-root .sc-nav-item{position:relative;display:flex;align-items:center;gap:10px;",
    "padding:var(--sc-nav-item-pad);border-radius:var(--sc-r-sm);cursor:pointer;",
    "font-size:var(--sc-fs-sm);line-height:var(--sc-lh-normal);color:var(--sc-muted);user-select:none;",
    "transition:background var(--sc-t-base) var(--sc-ease),color var(--sc-t-base) var(--sc-ease),",
    "transform var(--sc-t-fast) var(--sc-ease);}",
    "#scpanl-root .sc-nav-item:hover{background:var(--sc-hover);color:var(--sc-text);}",
    "#scpanl-root .sc-nav-item:active{transform:translateY(1px);}",
    "#scpanl-root .sc-nav-item.active{background:var(--sc-accent-soft);",
    "color:var(--sc-accent);font-weight:var(--sc-fw-semibold);}",
    /* v9 对齐：方案选中态**无左侧强调竖条**（真机多一条 3px 紫条） */
    "#scpanl-root .sc-nav-item.active::before{display:none;}",
    "#scpanl-root .sc-nav-item svg{width:16px;height:16px;flex:none;}",
    "#scpanl-root .sc-nav-spacer{flex:1;}",
    "#scpanl-root .sc-nav-close{display:none;}",
    /* 右内容 */
    "#scpanl-root .sc-main{flex:1;display:flex;flex-direction:column;background:var(--sc-bg-page);min-width:0;min-height:0}",
    /* 内容区：v9 实测内距 18 / 24 / 26（保弹性 —— clamp 在 1280 档收敛到方案值） */
    "#scpanl-root .sc-view{flex:1;overflow-y:auto;padding:clamp(16px,1.45vw,20px) clamp(18px,1.9vw,28px) clamp(22px,2vw,28px);min-height:0}",
    /* v9 的块节奏：同级块间 16px（.view > * + * {margin-top:16px}）；下方自有 margin-bottom 的块与之取大 */
    "#scpanl-root .sc-view>*+*{margin-top:var(--sc-sp-4);}",
    "#scpanl-root .sc-view>*:last-child{margin-bottom:0;}",
    /* 异步填充的卡槽（深睡页：回执 / 材料预估由 /cognition/report 异步回填）——
     *   占位必须在**同步阶段**插入，否则异步返回晚于后续同步块 ⇒ 卡片落到页面末尾（实测踩到）。 */
    "#scpanl-root .sc-stack>*+*{margin-top:var(--sc-sp-4);}",
    "#scpanl-root .sc-statusbar{padding:var(--sc-statusbar-pad);border-top:1px solid var(--sc-border);",
    "font-size:11.5px;color:var(--sc-muted);min-height:28px;line-height:20px;",
    "background:var(--sc-bg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    "#scpanl-root .sc-status-info{color:var(--sc-muted);}",
    "#scpanl-root .sc-status-warn{color:var(--sc-warn);}",
    "#scpanl-root .sc-status-error{color:var(--sc-err);font-weight:var(--sc-fw-semibold);}",
    /* ── 卡片层（v9 `.card`：卡头 11/14 · 12.5px/620 · 底分隔 1px --sc-border2；卡体 13/14）──
     * 与 .sc-fold 的分工：.sc-fold 是**可折叠**容器（带箭头/开合态），.sc-card 是**静态分组**容器。 */
    "#scpanl-root .sc-card{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);",
    "background:var(--sc-bg-card);overflow:hidden;}",
    "#scpanl-root .sc-card-hd{display:flex;align-items:center;gap:var(--sc-sp-2);padding:11px 14px;",
    "border-bottom:1px solid var(--sc-border2);font-size:12.5px;font-weight:620;color:var(--sc-text);}",
    "#scpanl-root .sc-card-hd .sub{font-weight:400;font-size:11.5px;color:var(--sc-faint);}",
    "#scpanl-root .sc-card-hd .right{margin-left:auto;display:flex;align-items:center;gap:var(--sc-sp-2);font-weight:400;}",
    "#scpanl-root .sc-card-bd{padding:13px 14px;display:flex;flex-direction:column;gap:var(--sc-gap-item);}",
    /* 卡内首末元素边距归零（v9 的卡片内不存在"末元素还带 24px 下边距"的空带——
     * 实测：卡体 221px = 内容 163 + 内距 26 + 网格上 8/下 24，底部多出 24px 暗带） */
    "#scpanl-root .sc-card-bd>*:first-child{margin-top:0;}",
    "#scpanl-root .sc-card-bd>*:last-child{margin-bottom:0;}",
    /* 卡内数值网格用更小列宽下限：v9 的三列（容量/成长）在卡内**一行排开**，
     * 沿用页面级 168px 下限会被挤成两行（实测 1.3fr 卡宽 ~540px）。 */
    "#scpanl-root .sc-card-bd .sc-mem-grid,#scpanl-root .sc-card-bd .sc-mem-stats{",
    "grid-template-columns:repeat(auto-fit,minmax(120px,1fr));}",
    /* 卡内**不再套卡**（v9 的卡体里是纯列：label/值/明细，没有第二层边框盒子——
     * 套卡会让"卡片层"失去语义，视觉上多一层噪声） */
    "#scpanl-root .sc-card-bd .sc-mem-stat{border:0;background:transparent;padding:0;border-radius:0;}",
    "#scpanl-root .sc-card-bd .sc-mem-stat:hover{border:0;background:transparent;}",
    /* 页头路由 chip（v9 的 .pagehead .src：等宽字体 + 胶囊 + panel2 底） */
    /* ⚠ 2026-09-13：此处原有 `#scpanl-root .sc-pagehead{display:flex;…}` 与上方同名顶层规则**重复定义**
       （CSS 审计门禁判「同层重复」）——已合并进上方唯一规则，勿在此再写第二份。 */
    "#scpanl-root .sc-ph-main{flex:1;min-width:0;}",
    "#scpanl-root .sc-ph-acts{margin-left:auto;display:flex;align-items:center;gap:var(--sc-sp-2);flex:none;}",
    "#scpanl-root .sc-srch{display:flex;align-items:center;gap:6px;border:1px solid var(--sc-border);",
    "border-radius:var(--sc-r-sm);background:var(--sc-bg2);padding:0 9px;min-width:190px;}",
    "#scpanl-root .sc-srch svg{width:14px;height:14px;color:var(--sc-faint);flex:none;}",
    "#scpanl-root .sc-srch input{border:0;background:none;outline:none;font:inherit;font-size:12px;",
    "color:var(--sc-text);padding:5px 0;width:100%;min-width:0;}",
    "#scpanl-root .sc-routes{display:flex;flex-wrap:wrap;gap:var(--sc-sp-1);margin-top:var(--sc-sp-2);}",
    "#scpanl-root .sc-src{display:inline-block;padding:2px 8px;border-radius:var(--sc-r-pill);",
    "border:1px solid var(--sc-border);background:var(--sc-bg2);color:var(--sc-faint);",
    "font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;}",
    /* v9 容量占用组件（.cap：三列 / 标签 / 大数值 / 明细 / 无门虚线槽）+ 卡内说明段（v7 一致性补丁第 5 条） */
    "#scpanl-root .sc-cap3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:var(--sc-gap-item);}",
    /* 记忆库容量区：与标准 KPI（.sc-kpi-*）**同一组排版值** —— 原型该区就是标准 .kpi（110 高、
     *   k-val 26px / min-height 34、条沉底共线），面板此前是自定的紧凑数值（22px 固定、88 高）⇒ 高度与
     *   字号都对不上。此处收敛为同一组声明（含 clamp 弹性，非定值），并用 margin-top:auto 让条槽共线。 */
    "#scpanl-root .sc-cap-item{display:flex;flex-direction:column;}",
    "#scpanl-root .sc-cap-top{font-size:11.5px;line-height:var(--sc-lh-normal);color:var(--sc-muted);}",
    "#scpanl-root .sc-cap-val{min-height:34px;display:flex;align-items:baseline;margin:5px 0 1px;line-height:1.15;",
    "font-size:clamp(22px,2.05vw,26px);font-weight:680;letter-spacing:-.3px;color:var(--sc-text);",
    "font-variant-numeric:tabular-nums;word-break:break-word;}",
    "#scpanl-root .sc-cap-sub{min-height:18px;font-size:11px;color:var(--sc-faint);}",
    "#scpanl-root .sc-cap-track{margin-top:auto;height:6px;border-radius:3px;background:var(--sc-border2);overflow:hidden;}",
    "#scpanl-root .sc-cap-track i{display:block;height:100%;width:var(--sc-pct,0);border-radius:3px;background:var(--sc-accent);}",
    "#scpanl-root .sc-cap-track i.ok{background:var(--sc-ok);}",
    "#scpanl-root .sc-cap-track i.warn{background:var(--sc-warn);}",
    "#scpanl-root .sc-cap-track i.err{background:var(--sc-err);}",
    "#scpanl-root .sc-cap-track.na{background:repeating-linear-gradient(90deg,var(--sc-border) 0 6px,transparent 6px 12px);}",
    "#scpanl-root .sc-cap-track.na i{display:none;}",
    "#scpanl-root .sc-cap-note{font-size:11.5px;color:var(--sc-faint);line-height:1.7;}",
    /* 卡下注脚（v9 `.bp-note`：小字灰） */
    "#scpanl-root .sc-note{font-size:11.5px;color:var(--sc-faint);line-height:1.7;}",
    /* ── 插件集合页（v9 `.grid2 > .pcard` + 矩阵表）── */
    "#scpanl-root .sc-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(232px,100%),1fr));gap:var(--sc-gap-item);}",
    "#scpanl-root .sc-pcard{display:flex;flex-direction:column;border:1px solid var(--sc-border);border-radius:var(--sc-r-md);",
    "padding:13px;background:var(--sc-bg-card);transition:border-color var(--sc-t-base) var(--sc-ease);}",
    "#scpanl-root .sc-pcard:hover{border-color:var(--sc-accent-bd);}",
    "#scpanl-root .sc-pcard .ph{display:flex;align-items:center;gap:var(--sc-sp-2);margin-bottom:var(--sc-sp-2);}",
    "#scpanl-root .sc-pcard .ph .ic{width:26px;height:26px;border-radius:7px;background:var(--sc-accent-bg);",
    "color:var(--sc-accent);display:grid;place-items:center;flex:none;}",
    "#scpanl-root .sc-pcard .ph .ic svg{width:14px;height:14px;}",
    "#scpanl-root .sc-pcard .ph b{font-size:13px;font-weight:600;color:var(--sc-text);}",
    "#scpanl-root .sc-pcard .pd{font-size:12px;color:var(--sc-muted);line-height:1.6;}",
    "#scpanl-root .sc-pcard .pmeta{display:flex;align-items:center;gap:var(--sc-sp-2);margin-top:9px;",
    "font-size:11.5px;color:var(--sc-faint);font-variant-numeric:tabular-nums;}",
    /* 「添加目标库」虚线卡（v9 同款：非动作卡，提示需在白名单登记） */
    "#scpanl-root .sc-pcard.is-add{border-style:dashed;background:transparent;color:var(--sc-faint);}",
    "#scpanl-root .sc-pcard.is-add .ph .ic{background:var(--sc-bg3);color:var(--sc-faint);}",
    /* 矩阵表（v9 表格：th 11.5px faint / td 底分隔 --sc-border2 / 数字等宽） */
    "#scpanl-root .sc-table{width:100%;border-collapse:collapse;font-size:12.5px;}",
    "#scpanl-root .sc-table th{text-align:left;font-weight:600;font-size:11.5px;color:var(--sc-faint);",
    "padding:6px 9px;border-bottom:1px solid var(--sc-border2);}",
    "#scpanl-root .sc-table td{text-align:left;padding:8px 9px;border-bottom:1px solid var(--sc-border2);",
    "color:var(--sc-text);vertical-align:top;}",
    "#scpanl-root .sc-table tr:last-child td{border-bottom:0;}",
    "#scpanl-root .sc-table .num{font-variant-numeric:tabular-nums;color:var(--sc-muted);}",
    "#scpanl-root .sc-table .tgt{font-weight:600;}",
    /* v9 的 .pill（表格状态列）：11px / 2px 8px / 20px 圆角 / hover 底；.pill.ok 走 ok 语义底 */
    "#scpanl-root .sc-table .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;",
    "padding:2px 8px;border-radius:var(--sc-r-pill);background:var(--sc-hover);color:var(--sc-muted);white-space:nowrap;}",
    "#scpanl-root .sc-table .pill.ok{background:var(--sc-ok-bg);color:var(--sc-ok);}",
    "#scpanl-root .sc-table .pill.warn{background:var(--sc-warn-bg);color:var(--sc-warn);}",
    /* 段/面板：v9 的 `.tabs`/`.pane` —— 面板已有的 .sc-tabbox/.sc-tabpane 直接复用 */
    "#scpanl-root .sc-cols2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);",
    "gap:var(--sc-gap-item);align-items:start;}",
    /* 导航脚状态块（v9 .nav-foot：分隔线 + 状态点 + 名称 + 副行） */
    "#scpanl-root .sc-nav-foot{margin-top:auto;padding:10px 10px 6px;border-top:1px solid var(--sc-border);}",
    "#scpanl-root .sc-nav-health{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--sc-muted);}",
    "#scpanl-root .sc-nav-health b{color:var(--sc-text);font-size:12px;font-weight:600;}",
    "#scpanl-root .sc-nav-foot-sub{margin-top:3px;font-size:11px;color:var(--sc-faint);}",
    "#scpanl-root .sc-nav-foot .sc-dot{width:7px;height:7px;}",
    /* ══════════ ④ 原件层 ══════════ */
    /* 按钮：主 / 次 / 危险 / 幽灵 + xs 尺寸，统一 min-height 与动效 */
    "#scpanl-root .sc-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;",
    "min-height:30px;padding:5px 12px;border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);",
    "background:var(--sc-bg2);color:var(--sc-text);font:inherit;font-size:var(--sc-fs-sm);line-height:1.4;",
    "cursor:pointer;white-space:nowrap;flex:none;",
    "transition:background var(--sc-t-base) var(--sc-ease),border-color var(--sc-t-base) var(--sc-ease),",
    "color var(--sc-t-base) var(--sc-ease),transform var(--sc-t-fast) var(--sc-ease),",
    "box-shadow var(--sc-t-fast) var(--sc-ease);}",
    "#scpanl-root .sc-btn:hover:not(:disabled){background:var(--sc-hover);border-color:var(--sc-border-strong);}",
    "#scpanl-root .sc-btn:active:not(:disabled){transform:translateY(1px);}",
    "#scpanl-root .sc-btn:disabled{opacity:var(--sc-disabled-op);cursor:not-allowed;}",
    "#scpanl-root .sc-btn-primary{background:var(--sc-accent);border-color:var(--sc-accent);color:#fff;",
    "font-weight:var(--sc-fw-medium);}",
    "#scpanl-root .sc-btn-primary:hover:not(:disabled){background:var(--sc-accent-hover);border-color:var(--sc-accent-hover);}",
    "#scpanl-root .sc-btn-ok{color:var(--sc-ok);}",
    "#scpanl-root .sc-btn-xs{min-height:24px;padding:2px 9px;font-size:var(--sc-fs-xs);}",
    /* 输入 / 下拉 / 文本域 —— 统一控件外观（此前 select 完全无样式，深色主题下为系统白底） */
    "#scpanl-root .sc-input,#scpanl-root input[type=text],#scpanl-root input[type=number],",
    "#scpanl-root input[type=password],#scpanl-root select,#scpanl-root textarea{",
    "appearance:none;-webkit-appearance:none;font:inherit;font-size:var(--sc-fs-sm);color:var(--sc-text);",
    "background:var(--sc-bg2);border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);",
    "padding:5px 10px;min-height:30px;outline:none;max-width:var(--sc-in-w,100%);",
    "transition:border-color var(--sc-t-base) var(--sc-ease),box-shadow var(--sc-t-fast) var(--sc-ease);}",
    /* 宽度走 CSS 变量（--sc-in-w）而非 style.maxWidth：样式集中可审，JS 只赋值 */
    "#scpanl-root textarea{min-height:unset;resize:vertical;}",
    "#scpanl-root select{padding-right:28px;cursor:pointer;background-repeat:no-repeat;",
    "background-position:right 9px center;",
    'background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22%3E%3Cpath d=%22M2.5 4.5 6 8l3.5-3.5%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E");}',
    "#scpanl-root select option{background:var(--sc-bg2);color:var(--sc-text);}",
    "#scpanl-root .sc-input:focus,#scpanl-root input:focus,#scpanl-root select:focus,#scpanl-root textarea:focus{",
    "border-color:var(--sc-accent);box-shadow:0 0 0 3px var(--sc-accent-bg);}",
    /* 开关：单一实现 = input.checkbox-container（label 包裹形态亦兼容） */
    "#scpanl-root .checkbox-container{appearance:none;-webkit-appearance:none;position:relative;",
    "width:38px;height:21px;border-radius:var(--sc-r-pill);flex:none;cursor:pointer;margin:0;",
    "background:var(--sc-bg3);border:1px solid var(--sc-border);padding:0;",
    "transition:background var(--sc-t-base) var(--sc-ease),border-color var(--sc-t-base) var(--sc-ease);}",
    '#scpanl-root .checkbox-container::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;',
    "border-radius:50%;background:var(--sc-muted);box-shadow:var(--sc-shadow-1);",
    "transition:left var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}",
    "#scpanl-root .checkbox-container:checked{background:var(--sc-accent);border-color:var(--sc-accent);}",
    "#scpanl-root .checkbox-container:checked::after{left:19px;background:#fff;}",
    "#scpanl-root .checkbox-container:disabled{opacity:var(--sc-disabled-op);cursor:not-allowed;}",
    "#scpanl-root .checkbox-material{display:none;}",
    "label.checkbox-container{display:inline-flex;align-items:center;}",
    "label.checkbox-container>input[type=checkbox]{position:absolute;inset:0;width:100%;height:100%;",
    "margin:0;opacity:0;cursor:pointer;}",
    "label.checkbox-container:has(>input:checked){background:var(--sc-accent);border-color:var(--sc-accent);}",
    "label.checkbox-container:has(>input:checked)::after{left:19px;background:#fff;}",
    /* 表单行：标题 + 描述 + 控件 */
    "#scpanl-root .setting-item{display:flex;align-items:center;gap:var(--sc-gap-item);",
    "padding:var(--sc-sp-3) 0;border-top:1px solid var(--sc-border);}",
    "#scpanl-root .setting-item:first-child,#scpanl-root .setting-item:first-of-type{border-top:none;}",
    "#scpanl-root .setting-item-info{flex:1;min-width:0;}",
    "#scpanl-root .setting-item-name{font-size:var(--sc-fs-md);line-height:var(--sc-lh-tight);color:var(--sc-text);}",
    "#scpanl-root .setting-item-desc{font-size:var(--sc-fs-xs);line-height:var(--sc-lh-normal);color:var(--sc-muted);",
    "margin-top:2px;max-width:var(--sc-w-read);}",
    "#scpanl-root .setting-item-control{display:flex;align-items:center;gap:var(--sc-sp-2);flex:none;}",
    /* 界面偏好两枚开关的作用面（设置页「导航分组显示 / 页脚健康条」）：只切显示，不动结构 */
    "#scpanl-modal.sc-nogroups .sc-nav-group{display:none;}",
    "#scpanl-modal.sc-nofoot .sc-nav-foot{display:none;}",
    /* 徽标 / 标签（形状 + 语义色双编码，色弱可辨） */
    "#scpanl-root .sc-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;",
    "border-radius:var(--sc-r-pill);font-size:var(--sc-fs-xs);line-height:18px;",
    "background:var(--sc-hover);color:var(--sc-muted);white-space:nowrap;flex:none;}",
    "#scpanl-root .sc-badge-ok{background:var(--sc-ok-bg);color:var(--sc-ok);}",
    "#scpanl-root .sc-badge-warn{background:var(--sc-warn-bg);color:var(--sc-warn);}",
    "#scpanl-root .sc-badge-error{background:var(--sc-err-bg);color:var(--sc-err);}",
    "#scpanl-root .sc-badge-info{background:var(--sc-info-bg);color:var(--sc-info);}",
    "#scpanl-root .sc-chip{display:inline-flex;align-items:center;padding:0 var(--sc-sp-2);",
    "border-radius:var(--sc-r-pill);border:1px solid var(--sc-border);color:var(--sc-muted);",
    "font-size:var(--sc-fs-xs);line-height:18px;white-space:nowrap;}",
    "#scpanl-root .sc-chip.warn{border-color:var(--sc-warn);color:var(--sc-warn);}",
    "#scpanl-root .sc-tag{display:inline-block;padding:0 6px;margin:0 4px 2px 0;border-radius:var(--sc-r-pill);",
    "background:var(--sc-bg3);border:1px solid var(--sc-border);color:var(--sc-muted);",
    "font-size:var(--sc-fs-xs);line-height:18px;}",
    /* 作用域/生效态徽标组（接缝① 阶段 2b · 2026-09-17）：**必须 fit-content**。
     *  判因（实测几何，比初判更精确）：本元素是 `display:flex` 的**块级 div**，
     *  在**块级父**（`.setting-item-info`，`extra` 挂载路径）里按块级宽度**撑满** = 966px，
     *  在 **flex 父**（`.setting-item`，`children` 挂载路径）里按内容宽 = 112px
     *  ⇒ 同一组件两态宽、徽标左边界漂在 286/898/1066 三处（用户实测「chip 位置漂移」）。
     *  `width:fit-content` 让**两种父容器下都是内容宽** ⇒ 一处定义根治两条路径。 */
    "#scpanl-root .sc-ctrl-meta{display:flex;flex-wrap:wrap;gap:var(--sc-sp-1);margin-top:var(--sc-sp-1);width:fit-content;}",
    /* 折叠（概览—详情分层） */
    "#scpanl-root .sc-fold{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);background:var(--sc-bg-card);",
    "margin:var(--sc-gap-row) 0;overflow:hidden;}",
    /* 卡头规格对齐 v9 的 .card > .hd（11px 14px / 12.5px / 620） */
    "#scpanl-root .sc-fold-head{display:flex;align-items:center;gap:var(--sc-sp-2);",
    "padding:11px 14px;cursor:pointer;font-size:12.5px;",
    "font-weight:620;color:var(--sc-text);user-select:none;",
    "transition:background var(--sc-t-base) var(--sc-ease),transform var(--sc-t-fast) var(--sc-ease);}",
    "#scpanl-root .sc-fold-head:hover{background:var(--sc-hover);}",
    "#scpanl-root .sc-fold-head:active{transform:translateY(1px);}",
    "#scpanl-root .sc-fold-arrow{color:var(--sc-muted);width:12px;flex:none;font-size:var(--sc-fs-xs);}",
    "#scpanl-root .sc-fold-summary{margin-left:auto;font-weight:var(--sc-fw-normal);font-size:var(--sc-fs-xs);",
    "color:var(--sc-muted);}",
    "#scpanl-root .sc-fold-body{display:none;padding:2px var(--sc-gap-item) var(--sc-gap-item);}",
    "#scpanl-root .sc-fold.open .sc-fold-body{display:block;}",
    /* 进度 */
    "#scpanl-root .sc-prog{margin:var(--sc-gap-row) 0;}",
    /* P0-1（2026-09-13）：条体改由 <wa-progress-bar> 承载 ⇒ 用组件暴露的 CSS 变量接管尺寸与配色。
     *   **必须显式接管**：组件自带 `--track-height:1rem`(=16px)，比方案 6px 高 10px、且自带
     *   `min-height`/`padding`/`margin` ⇒ 不接管就会把整页网格顶开（首版直接替换实测
     *   `ui-geo-regress` 93 → 70 PASS）。变量名取自组件源码 `progress-bar.styles.ts`。 */
    "#scpanl-root wa-progress-bar.sc-prog-bar{--track-height:6px;--track-color:var(--sc-bg3);",
    "--indicator-color:var(--sc-accent);display:block;}",
    "#scpanl-root .sc-prog-txt{font-size:var(--sc-fs-xs);color:var(--sc-muted);margin-top:var(--sc-sp-1);}",
    /* 键值（display:contents 让 k/v 真正落进栅格，此前被包裹层挡住不生效） */
    "#scpanl-root .sc-kv{display:grid;grid-template-columns:auto 1fr;gap:var(--sc-sp-1) var(--sc-gap-item);",
    "font-size:var(--sc-fs-sm);align-items:baseline;}",
    "#scpanl-root .sc-kv-row{display:contents;}",
    "#scpanl-root .sc-kv-k{color:var(--sc-muted);white-space:nowrap;}",
    "#scpanl-root .sc-kv-v{color:var(--sc-text);word-break:break-all;}",
    /* 日志 */
    /* v9 对齐：折叠态只留标题行（一行 ~33px），展开态才给滚动高度 */
    "#scpanl-root .sc-logwrap.sc-log-collapsed{max-height:none;}",
    "#scpanl-root .sc-logwrap.sc-log-collapsed .sc-log-row{display:none;}",
    "#scpanl-root .sc-log-toggle{cursor:pointer;user-select:none;}",
    /* v9 对齐：折叠态是**单行细条**（v9 .logbar-hd 只有箭头 + 计数）——
     * 级别下拉与清空按钮在方案里属日志**正文工具**（.logtools），折叠时不该占高。 */
    "#scpanl-root .sc-log-collapsed .sc-log-head select,",
    "#scpanl-root .sc-log-collapsed .sc-log-head wa-button{display:none;}",
    "#scpanl-root .sc-logwrap{border-top:1px solid var(--sc-border);background:var(--sc-bg2);",
    "max-height:min(34vh,320px);overflow:auto;}",
    "#scpanl-root .sc-log-head{display:flex;align-items:center;gap:var(--sc-sp-2);padding:6px var(--sc-gap-item);",
    "font-size:10.5px;text-transform:uppercase;letter-spacing:var(--sc-ls-wide);color:var(--sc-faint);",
    "position:sticky;top:0;background:var(--sc-bg2);border-bottom:1px solid var(--sc-border);z-index:1;}",
    /* v9 对齐（§6-4）：日志行改**原型形态**——`✓ GET /memory/overview 42ms 200`
     *   （级别图标 + 方法 + 端点 + 耗时 + 状态码），时间戳右对齐 faint 保留（原型无，但排障必需）。
     *   定宽列改 flex：方法/端点长度不一，定宽反会把端点折断。 */
    "#scpanl-root .sc-log-row{display:flex;gap:8px;align-items:baseline;",
    "padding:3px var(--sc-gap-item);font-size:var(--sc-fs-xs);font-family:ui-monospace,Menlo,Consolas,monospace;}",
    "#scpanl-root .sc-log-t{color:var(--sc-faint);font-variant-numeric:tabular-nums;flex:none;}",
    "#scpanl-root .sc-log-lv{font-size:11px;flex:none;}",
    "#scpanl-root .sc-log-info .sc-log-lv{color:var(--sc-muted);}",
    "#scpanl-root .sc-log-warn .sc-log-lv{color:var(--sc-warn);}",
    "#scpanl-root .sc-log-error .sc-log-lv{color:var(--sc-err);}",
    "#scpanl-root .sc-log-m{color:var(--sc-faint);flex:none;}",
    "#scpanl-root .sc-log-p{color:var(--sc-text);word-break:break-all;flex:1;min-width:0;}",
    "#scpanl-root .sc-log-ms,#scpanl-root .sc-log-st{color:var(--sc-muted);font-variant-numeric:tabular-nums;flex:none;}",
    "#scpanl-root .sc-log-msg{color:var(--sc-text);word-break:break-word;flex:1;min-width:0;}",
    /* 边界态：加载（空态走 .sc-mem-empty，见业务层 —— 曾并存两套空态组件，.sc-empty 零使用已删） */
    "#scpanl-root .sc-loading{position:relative;pointer-events:none;}",
    '#scpanl-root .sc-loading::after{content:"";position:absolute;inset:0;border-radius:inherit;',
    "background:linear-gradient(90deg,transparent,var(--sc-hover),transparent);background-size:200% 100%;",
    "animation:sc-shimmer 1.2s linear infinite;}",
    "@keyframes sc-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}",
    "/* ---------- 分段 Tab（P2） ---------- */",
    "#scpanl-root .sc-tabbox{display:flex;flex-direction:column;gap:var(--sc-gap-item);}",
    "#scpanl-root .sc-tabpane{margin-top:var(--sc-sp-1);min-height:0}",
    /* 组件库按钮（S3）：宿主元素不自带盒模型（尺寸/配交组件自身与 --wa-* 令牌），字号接方案标尺。
     * .sc-btn 规则保留：宿主设置中心里的 React 按钮仍在用（跨运行时共用同一套类名）。 */
    /* 注意（实测踩坑）：**不要在宿主上覆盖 font-size** —— 组件尺寸是 em 派生，
     *   覆盖成 11px 会让 size="m" 也只有 19px 高。字号交给组件自身的 size 标尺。 */
    /* 令牌桥（S3）：组件库的**尺寸/圆角标尺**接到方案标尺上（颜色由 wa-dark + --dsw/--sc 令牌决定）。
     *   不做这层桥，组件会按自带 16px 字号/大内距渲染（实测按钮 43px 高、日志折叠条被撑到 57px）。 */
    /* 令牌桥（S3）：一条规则装齐 —— 颜色走方案令牌、字号/间距/圆角接方案标尺。
     *   踩坑：此前拆成两条且第一条**未闭合** ⇒ CSS 解析器把后续 87 条规则吞进该块（含网格规则），
     *   表现为「KPI 4 行 / 操作卡 3 行 / 徽章 7 行」的布局塌陷 + 审计报 87 个缺样式。 */
    "#scpanl-root{",
    "--wa-color-brand-fill-loud:var(--sc-accent);--wa-color-brand-fill-normal:var(--sc-accent);",
    "--wa-color-brand-on:#ffffff;--wa-color-danger-fill-loud:var(--sc-err);--wa-color-danger-on:#ffffff;",
    "--wa-color-neutral-on:#ffffff;",
    "--wa-color-surface-default:var(--sc-bg-card);--wa-color-text-normal:var(--sc-text);",
    /* 尺寸层接管（关键，2026-09-13）：WA 的字号/间距/圆角**全部由三个 scale 令牌派生** ——
     *   --wa-font-size-m = 1rem × fontSize-scale；--wa-space-m = 1rem × space-scale；
     *   --wa-border-radius-m = 0.375rem × radius-scale。
     *   直接覆盖派生值无效（上轮实测被其 calc 覆盖）。故只改这三个源头：
     *   字号 scale .78 ⇒ m≈12.5px / s≈11px（对齐方案 --sc-fs-sm/xs）；间距 scale .375 ⇒ m≈6px（紧凑）；圆角保持 1 ⇒ 6px。 */
    "--wa-font-size-scale:.78;--wa-space-scale:.375;--wa-border-radius-scale:1;}",
    /* 组件库 Tab（S3）：把方案令牌接到 wa-tab-group 的 CSS 变量上，使其跟随皮肤/主题 */
    "#scpanl-root wa-button{vertical-align:middle;}",
    "#scpanl-root wa-switch,#scpanl-root wa-select{vertical-align:middle;}",
    /* 注：曾用 '#scpanl-root wa-select::part(combobox){…}' 对齐填充，**实测未生效**（复核测得的填充仍等于卡底）。
     *   要不要用 ::part、部件名是什么，必须**先核对组件导出的 parts 再落**（本次是照经验猜名，属教训）。 */
    /* 组件开关定形（S3 视觉复核判定后）：圆点回白、宽度提到方案档 —— 均走其公开扩展点
     *   （switch.d.ts 的 @cssproperty --width 与 @csspart thumb），非 hack。 */
    "#scpanl-root wa-switch{--width:2.4rem;}",
    "#scpanl-root wa-switch::part(thumb){background:#ffffff;}",
    /* 按钮文字色（S3 实测）：组件库的 on 色令牌在本面板上下文未解析成白，实测标签为蓝 rgb(110,179,255)
     *   （压紫底 ≈1.2:1，视觉复核判为不可读）。改用它公开的扩展点 ::part(button) 显式定色 ——
     *   这是组件库文档化的定制方式，非 hack；并由几何回归的「标签亮度 ≥0.7」断言长期守住。 */
    '#scpanl-root wa-button[variant="brand"]::part(button),#scpanl-root wa-button[variant="danger"]::part(button){color:#ffffff;}',
    '#scpanl-root wa-button[variant="neutral"]::part(button){color:var(--sc-text);}',
    /* 分段控件对齐 v9 `.tabs`（第二轮）：**仍走组件库** wa-tab-group（保留 S3 决策与门禁断言），
     * 用**实测存在**的部件名改造成胶囊分段：外框 --sc-bg1 + 1px 边 + 8px 圆角 + 2px 内距；
     * 每个 tab = 28px 胶囊（内距 0/14 · 12.5px · 圆角 6）；激活项 bg --sc-bg-card + shadow-1；
     * 组件自带的**下划线指示器关掉**（v9 无下划线）：--indicator-color:transparent。
     * 部件名来源：shadow DOM 实测 wa-tab-group::part(base/nav/tabs/body) · wa-tab::part(base)。 */
    /* U2（2026-09-26）：**降级路径的自绘分段**（宿主 SegmentedTabs 拿不到时用）。
     *   尺寸/配色**逐值对齐**上面那批 wa-tab 的接管值（28px 胶囊 · 内距 0/14 · 12.5px ·
     *   外框 --sc-bg1 + 1px 边 + 8px 圆角 + 2px 内距；激活 bg --sc-bg-card + shadow-1），
     *   故两条路径观感一致。 */
    "#scpanl-root .sc-tabnav{background:var(--sc-bg1);border:1px solid var(--sc-border);",
    "border-radius:var(--sc-r-md);padding:2px;display:inline-flex;gap:2px;align-self:flex-start;}",
    "#scpanl-root .sc-tabbtn{height:28px;padding:0 14px;border-radius:var(--sc-r-sm);border:0;cursor:pointer;",
    "font-size:12.5px;font-weight:400;font-family:inherit;color:var(--sc-muted);background:transparent;}",
    "#scpanl-root .sc-tabbtn:hover{color:var(--sc-text);}",
    "#scpanl-root .sc-tabbtn.sc-on{background:var(--sc-bg-card);color:var(--sc-text);font-weight:600;box-shadow:var(--sc-shadow-1);}",
    /* 面板切换（U2）：宿主 SegmentedTabs 不带面板容器 ⇒ 由 .sc-hidden 控制显隐。
     *   ⚠ 此处**不再声明** `.sc-tabpane` —— 第 428 行既有 `.sc-tabpane{margin-top…}`、
     *     第 83 行 `.sc-hidden{display:none !important}` 已构成完整判据；
     *     曾在此重复声明 display:block，被 audit-css-usage 判「同层重复定义」。 */
    "#scpanl-root wa-tab-group{--indicator-color:transparent;--track-color:transparent;}",
    "#scpanl-root wa-tab-group::part(nav){background:var(--sc-bg1);border:1px solid var(--sc-border);",
    "border-radius:var(--sc-r-md);padding:2px;display:inline-flex;width:auto;align-self:flex-start;height:auto;}",
    "#scpanl-root wa-tab-group::part(tabs){display:inline-flex;gap:2px;}",
    "#scpanl-root wa-tab::part(base){height:28px;padding:0 14px;border-radius:var(--sc-r-sm);",
    "font-size:12.5px;font-weight:400;color:var(--sc-muted);background:transparent;}",
    "#scpanl-root wa-tab[active]::part(base){background:var(--sc-bg-card);color:var(--sc-text);",
    "font-weight:600;box-shadow:var(--sc-shadow-1);}",
    "#scpanl-root wa-tab{font-size:12.5px;color:var(--sc-muted);}",
    /* ═══ 皮肤层（2026-09-13 用户拍板：**v9 皮肤为准 + 宿主皮肤可选**）═══
     * 结构：① 上面是宿主变量兜底（无皮肤标记时的向后兼容）② 下面是两套显式皮肤，同一层语义令牌、只换值：
     *   · .sc-skin-v9（默认）：方案调色板，分 .sc-dark/.sc-light 两态（对应 v9 的 dark/light token 块）
     *   · .sc-skin-host：单一真源 = 宿主 --dsw-alias-*（面板与 DSH 同色，跟随宿主换肤）
     * 切换：Cfg('skin')（面板「设置」页 + 宿主设置中心「守藏」分区均有入口）；syncTheme() 负责打标记。 */
    "#scpanl-root.sc-skin-v9.sc-dark{",
    /* P0-1/v9 严格对齐（2026-09-13）：新增**页面级**令牌 --sc-bg-page。
     * 原型 v9 的层级是 bg(#131315) < panel2(#171719) < panel(#1b1b1e) < panel3(#2a2a2f) ——
     * 面板此前把 --panel 的值(#1b1b1e)当成了**页面底**，比原型亮一档（vfiff 实测 --bg DIFF）。
     * 不直接改 --sc-bg1 的值：它还服务按钮/输入/胶囊等部件（改了会连锁引入新差异），
     * 故拆出"页面底"这一层语义，只让 .sc-main / .sc-headslot 用它。 */
    "--sc-bg-page:#131315;",
    "--sc-bg1:#1b1b1e;--sc-bg2:#171719;--sc-bg3:#232327;--sc-bg-card:#2a2a2f;",
    "--sc-border:#2c2c31;--sc-border-strong:#3a3a40;--sc-border2:#33333a;",
    "--sc-text:#e8e8ea;--sc-muted:#9a9aa2;--sc-faint:#6e6e76;",
    "--sc-accent:#a78bfa;--sc-accent-hover:#b9a3fb;--sc-accent-soft:#251f3a;--sc-ok:#3fb950;--sc-warn:#d29922;--sc-err:#f85149;--sc-info:#58a6ff;",
    "--sc-hover:#242428;--sc-active:#2c2c31;",
    "--sc-r-sm:6px;--sc-r-md:10px;--sc-r-lg:14px;",
    "--sc-shadow-1:0 1px 2px rgba(0,0,0,.4);--sc-shadow-2:0 4px 14px rgba(0,0,0,.45);--sc-shadow-3:0 12px 40px rgba(0,0,0,.6);",
    "}",
    "#scpanl-root.sc-skin-v9.sc-light{",
    /* 浅色态：原型 --bg 与 --panel 同为 #f4f5f7 ⇒ 页面底不再分层（与 v9 一致） */
    "--sc-bg-page:#f4f5f7;",
    "--sc-bg1:#f4f5f7;--sc-bg2:#fafbfc;--sc-bg3:#eef0f3;--sc-bg-card:#ffffff;",
    "--sc-border:#e3e6ea;--sc-border-strong:#d5d9de;--sc-border2:#eef0f3;",
    "--sc-text:#1f2328;--sc-muted:#656d76;--sc-faint:#8c959f;",
    "--sc-accent:#7c5cff;--sc-accent-soft:#f0ecff;--sc-ok:#1a7f37;--sc-warn:#9a6700;--sc-err:#cf222e;--sc-info:#0969da;",
    "--sc-hover:#f2f3f5;--sc-r-sm:6px;--sc-r-md:10px;--sc-r-lg:14px;",
    "}",
    /* 宿主原生皮肤：全部颜色令牌单一取自宿主 --dsw-alias-*（卡面用 color-mix 提亮一档，保持"凸卡"结构） */
    "#scpanl-root.sc-skin-host{",
    "--sc-bg-page:var(--dsw-alias-bg-layer-1,#1b1b1e);",
    "--sc-bg1:var(--dsw-alias-bg-layer-1,#1b1b1e);--sc-bg2:var(--dsw-alias-bg-layer-2,#171719);",
    "--sc-bg3:var(--dsw-alias-bg-layer-3,#232327);",
    "--sc-bg-card:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#1b1b1e) 88%,#ffffff 12%);",
    "--sc-border:var(--dsw-alias-border-l2,#2c2c31);--sc-border-strong:var(--dsw-alias-border-l1,#3a3a40);",
    "--sc-border2:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2,#33333a));",
    "--sc-text:var(--dsw-alias-label-primary,#e8e8ea);--sc-muted:var(--dsw-alias-label-secondary,#9a9aa2);",
    "--sc-faint:var(--dsw-alias-label-tertiary,#6e6e76);",
    "--sc-accent:var(--dsw-alias-brand-primary,#7c5cff);--sc-accent-hover:var(--dsw-alias-brand-primary,#7c5cff);",
    "--sc-ok:var(--dsw-alias-state-success-primary,#3fb950);--sc-warn:var(--dsw-alias-state-warn-primary,#d29922);",
    "--sc-err:var(--dsw-alias-state-error-primary,#f85149);",
    "--sc-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));",
    "}",
    /* 组件规格对齐 v9：凸卡体系 / 字号标尺 / 圆角 / 按钮 / 分段 / 导航选中（去掉左侧竖条） */
    /* ══════════ ⑤ 业务层 ══════════ */
    /* 记忆卡：自适应栅格 + hero 跨列 */
    "#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{display:grid;",
    "grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:var(--sc-gap-item);",
    "margin:var(--sc-sp-2) 0 var(--sc-gap-group);}",
    "#scpanl-root .sc-mem-stat{padding:var(--sc-pad-card);border:1px solid var(--sc-border);background:var(--sc-bg-card);",
    "border-radius:var(--sc-r-md);",
    "transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}",
    "#scpanl-root .sc-mem-stat:hover{border-color:var(--sc-border-strong);background:var(--sc-bg2);}",
    "#scpanl-root .sc-mem-stat-label{font-size:var(--sc-fs-xs);color:var(--sc-muted);",
    "line-height:var(--sc-lh-tight);margin-bottom:var(--sc-sp-1);}",
    "#scpanl-root .sc-mem-stat-value{font-size:var(--sc-fs-lg);font-weight:var(--sc-fw-bold);",
    "line-height:var(--sc-lh-tight);color:var(--sc-text);font-variant-numeric:tabular-nums;}",
    "#scpanl-root .sc-mem-stat-sub{font-size:var(--sc-fs-xs);color:var(--sc-faint);",
    "line-height:var(--sc-lh-normal);margin-top:2px;}",
    "#scpanl-root .sc-mem-stat.hero{grid-column:span 2;padding:var(--sc-gap-item) var(--sc-sp-4);",
    "border-color:var(--sc-accent-bd);background:var(--sc-accent-bg);}",
    "#scpanl-root .sc-mem-stat.hero .sc-mem-stat-value{font-size:var(--sc-fs-2xl);}",
    "#scpanl-root .sc-mem-stat.hero .sc-mem-stat-label{font-size:var(--sc-fs-sm);}",
    /* v9 严格对齐（第五轮 · 画像页）：USER/AGENT 构成用 sc-mem-stat 形态后，
     * stat-box 底部需要一条"红线 / 容量门 / 路径"提示行（v9 原型 `.rule`）。
     * 与 .sc-mem-stat-sub 同字号但有左色条 + 顶距，便于视觉分组。 */
    "#scpanl-root .sc-mem-stat-rule{margin-top:var(--sc-sp-2);padding-top:var(--sc-sp-2);",
    "border-top:1px dashed var(--sc-border);font-size:11px;line-height:1.55;color:var(--sc-faint);}",
    /* v9 严格对齐（第五轮 · 画像页）：成熟度分布柱状图（5 根柱，0–.2 / .2–.4 / … / .8–1） */
    "#scpanl-root .sc-hist-wrap{padding:var(--sc-sp-2) 0;}",
    "#scpanl-root .sc-hist{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));",
    "gap:var(--sc-gap-item);align-items:end;height:88px;}",
    "#scpanl-root .sc-hist i{position:relative;display:block;height:0;min-height:1px;",
    "background:var(--sc-accent);border-radius:3px 3px 0 0;transition:height var(--sc-t-base) var(--sc-ease);}",
    "#scpanl-root .sc-hist i b{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);",
    "font-size:11px;font-weight:400;color:var(--sc-muted);white-space:nowrap;}",
    /* v9 严格对齐（第五轮 · 深睡页）：状态机（三节点指示器 + 睡眠水位条）
     * 形态对齐 v9 原型 .sm / .sm-node / .sm-circle / .sm-seg（96px 节点 / 34px 圆 / 2px 连线）。 */
    "#scpanl-root .sc-sm{display:flex;align-items:flex-start;gap:0;margin:var(--sc-sp-1) 0 var(--sc-sp-3);}",
    "#scpanl-root .sc-sm-node{display:flex;flex-direction:column;align-items:center;gap:var(--sc-sp-1);",
    "flex:none;width:96px;}",
    "#scpanl-root .sc-sm-circle{width:34px;height:34px;border-radius:50%;border:2px solid var(--sc-border);",
    "display:grid;place-items:center;background:var(--sc-bg2);color:var(--sc-faint);",
    "transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}",
    "#scpanl-root .sc-sm-node.on .sc-sm-circle{border-color:var(--sc-accent);background:var(--sc-accent-soft);",
    "color:var(--sc-accent);}",
    "#scpanl-root .sc-sm-node.done .sc-sm-circle{border-color:var(--sc-ok);background:var(--sc-ok-bg);",
    "color:var(--sc-ok);}",
    "#scpanl-root .sc-sm-label{font-size:11.5px;line-height:1.4;color:var(--sc-muted);text-align:center;}",
    "#scpanl-root .sc-sm-node.on .sc-sm-label{font-weight:var(--sc-fw-semibold);}",
    "#scpanl-root .sc-sm-seg{flex:1;height:2px;background:var(--sc-border);margin-top:16px;}",
    "#scpanl-root .sc-sm-seg.done{background:var(--sc-ok);}",
    /* v9 总览对齐（2026-09-13）：原型 .pill / .tl / .mini 三组原子类的面板实现 ——
     * 原型总览页用它们承载「晨起摘要 / 最近动态 / 判据与重排门」三张卡，面板此前无对应类。 */
    "#scpanl-root .sc-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:2px 8px;",
    "border-radius:20px;background:var(--sc-hover);color:var(--sc-muted);font-weight:var(--sc-fw-medium);white-space:nowrap;}",
    "#scpanl-root .sc-pill.ok{background:var(--sc-ok-bg);color:var(--sc-ok);}",
    "#scpanl-root .sc-pill.warn{background:var(--sc-warn-bg);color:var(--sc-warn);}",
    "#scpanl-root .sc-pill.info{background:var(--sc-info-bg);color:var(--sc-info);}",
    "#scpanl-root .sc-pill.brand{background:var(--sc-accent-bg);color:var(--sc-accent);}",
    "#scpanl-root .sc-pill.mono{font-family:ui-monospace,Consolas,monospace;}",
    /* 时间线（原型 .tl）：1px 竖线 + 9px 圆点（2px 语义色描边，ok/warn 变色） */
    "#scpanl-root .sc-tl{position:relative;padding-left:20px;}",
    '#scpanl-root .sc-tl:before{content:"";position:absolute;left:5px;top:6px;bottom:6px;width:1px;background:var(--sc-border);}',
    "#scpanl-root .sc-tl-item{position:relative;padding:0 0 15px;}",
    "#scpanl-root .sc-tl-item:last-child{padding-bottom:0;}",
    '#scpanl-root .sc-tl-item:before{content:"";position:absolute;left:-18px;top:5px;width:9px;height:9px;',
    "border-radius:50%;background:var(--sc-bg-card);border:2px solid var(--sc-accent);}",
    "#scpanl-root .sc-tl-item.ok:before{border-color:var(--sc-ok);}",
    "#scpanl-root .sc-tl-item.warn:before{border-color:var(--sc-warn);}",
    "#scpanl-root .sc-tl-t{font-size:12.5px;font-weight:var(--sc-fw-medium);}",
    "#scpanl-root .sc-tl-d{font-size:11.5px;color:var(--sc-faint);margin-top:2px;}",
    "#scpanl-root .sc-tl-time{font-size:11px;color:var(--sc-faint);font-variant-numeric:tabular-nums;}",
    /* 键值双列（原型 .mini 的 auto/1fr 两列版，去掉原型的空占位列） */
    "#scpanl-root .sc-mini{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px;}",
    "#scpanl-root .sc-mini .k{color:var(--sc-muted);}",
    "#scpanl-root .sc-mini .v{color:var(--sc-text);font-variant-numeric:tabular-nums;}",
    /* 告警条：原型 .alert > b（加粗前缀）+ a（跳转链接） */
    "#scpanl-root .sc-ds-alert b{font-weight:var(--sc-fw-semibold);}",
    "#scpanl-root .sc-ds-alert a{color:var(--sc-accent);cursor:pointer;margin-left:4px;}",
    /* 卡内行（原型 .card > .bd .row）：**不能复用 .sc-row** —— 后者是表单行语义
     * （flex:none、无内距无下边框），混用会把表单布局带坏。故单列 .sc-crow。 */
    "#scpanl-root .sc-crow{display:flex;align-items:center;gap:11px;padding:10px 14px;",
    "border-bottom:1px solid var(--sc-border2);transition:background var(--sc-t-base) var(--sc-ease);}",
    "#scpanl-root .sc-crow:last-child{border-bottom:0;}",
    "#scpanl-root .sc-crow:hover{background:var(--sc-bg2);}",
    "#scpanl-root .sc-crow .sc-ct{font-size:13px;font-weight:var(--sc-fw-medium);}",
    "#scpanl-root .sc-crow .sc-cd{font-size:11.5px;color:var(--sc-faint);margin-top:1px;}",
    "#scpanl-root .sc-crow .sc-right{margin-left:auto;display:flex;align-items:center;gap:9px;",
    "font-size:11.5px;color:var(--sc-muted);}",
    "#scpanl-root .sc-crow .sc-right b{color:var(--sc-text);font-variant-numeric:tabular-nums;}",
    /* 索引行右列（v9 记忆库页：tag 胶囊 + 「N 条」）—— 复用 .sc-right 的右靠语义 */
    "#scpanl-root .sc-idx-row .sc-right{margin-left:auto;display:flex;align-items:center;gap:9px;",
    "font-size:11.5px;color:var(--sc-muted);}",
    /* v9 原型 .proto-note 形态：虚线边框 + 透明背景 + 灰字（页头右侧占位说明）
     * 与运行时实操作 chip 区分（实操作 chip 是 .sc-btn 实色）。 */
    "#scpanl-root .sc-proto-note{border:1px dashed var(--sc-border);background:transparent;",
    "color:var(--sc-faint);font-size:11.5px;border-radius:8px;padding:3px 8px;}",
    "#scpanl-root .sc-mem-group-title{font-size:var(--sc-fs-sm);font-weight:var(--sc-fw-bold);",
    "color:var(--sc-accent);letter-spacing:.03em;margin:var(--sc-gap-group) 0 var(--sc-gap-item);",
    "padding-bottom:var(--sc-sp-1);border-bottom:1px solid var(--sc-border);}",
    "#scpanl-root .sc-mem-group-title:first-child{margin-top:var(--sc-sp-2);}",
    "#scpanl-root .sc-mem-empty{margin:0 0 var(--sc-gap-item);padding:var(--sc-pad-card);",
    "font-size:var(--sc-fs-xs);line-height:var(--sc-lh-normal);color:var(--sc-faint);",
    "border:1px dashed var(--sc-border);border-radius:var(--sc-r-md);background:var(--sc-bg2);}",
    "#scpanl-root .sc-mem-sub{font-size:var(--sc-fs-sm);color:var(--sc-muted);",
    "line-height:var(--sc-lh-normal);margin:2px 0 0;padding-bottom:var(--sc-sp-2);}",
    "#scpanl-root .sc-mem-sub.muted{color:var(--sc-muted);}",
    /* UI1/U2（2026-09-15）：此处原有 4 条 `.sc-spark` 规则（迷你趋势图）—— 已随
     *   **死代码 `sparkline()` 一并删除**。此前未被发现，是因为 `audit-css-usage` 用
     *   子串包含判"是否被使用"，而产物里恰有 `sparkline` 这个**函数名** ⇒ 误判为在用。
     *   函数迁到 pane 模块后无人 import ⇒ tree-shaking 掉函数名 ⇒ 真死规则暴露。
     *   ⇒ 删函数 + 删规则（**不是加 ALLOW_NO_STYLE 白名单掩盖**）。 */
    /* 注：`.sc-danger` 规则已随 v9 严格对齐删除（其唯一使用者是记忆库页「蒸馏运行」段内的失败文字，
     *   该段属「运行态」Tab —— 原型记忆库页无此 Tab ⇒ 一并移除；CSS 审计门禁正是靠"死规则"抓到的）。 */
    /* 指针卡（可点击跳转） */
    "#scpanl-root .sc-pointer-list{display:flex;flex-direction:column;gap:var(--sc-gap-row);}",
    "#scpanl-root .sc-pointer{display:flex;align-items:center;gap:var(--sc-gap-item);",
    "padding:10px var(--sc-gap-item);border:1px solid var(--sc-border);border-radius:var(--sc-r-md);",
    "background:var(--sc-bg1);cursor:pointer;",
    "transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease),",
    "transform var(--sc-t-fast) var(--sc-ease);}",
    "#scpanl-root .sc-pointer:hover{background:var(--sc-bg2);border-color:var(--sc-accent-bd);}",
    "#scpanl-root .sc-pointer:active{transform:translateY(1px);}",
    "#scpanl-root .sc-pointer-main{flex:1;min-width:0;}",
    "#scpanl-root .sc-pointer-head{display:flex;align-items:baseline;gap:var(--sc-sp-2);}",
    "#scpanl-root .sc-pointer-title{font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);color:var(--sc-text);}",
    "#scpanl-root .sc-pointer-meta{flex:none;font-size:var(--sc-fs-xs);color:var(--sc-faint);}",
    "#scpanl-root .sc-pointer-summary{margin-top:3px;font-size:var(--sc-fs-sm);color:var(--sc-muted);",
    "line-height:var(--sc-lh-normal);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;",
    "-webkit-line-clamp:2;-webkit-box-orient:vertical;}",
    "#scpanl-root .sc-pointer-go{flex:none;color:var(--sc-accent);font-size:var(--sc-fs-md);",
    "font-weight:var(--sc-fw-bold);}",
    /* 索引行 / 笔记 chip */
    "#scpanl-root .sc-idx-list{display:flex;flex-direction:column;gap:1px;margin-bottom:var(--sc-gap-row);}",
    /* 索引组头（接缝① · 2026-09-17 阶段 2）：标签与「N 条」在此**只出现一次** ——
     *  修「每行重复 N 条」与「标签两页前后不一」两处用户实测症状。 */
    "#scpanl-root .sc-idx-group{display:flex;align-items:center;gap:var(--sc-sp-2);margin:var(--sc-sp-3) 0 var(--sc-sp-1);}",
    "#scpanl-root .sc-idx-group:first-child{margin-top:0;}",
    "#scpanl-root .sc-idx-group-n{color:var(--sc-faint);font-size:var(--sc-fs-xs);font-variant-numeric:tabular-nums;}",
    "#scpanl-root .sc-idx-row{display:flex;gap:var(--sc-sp-2);align-items:baseline;padding:4px var(--sc-sp-1);",
    "cursor:pointer;border-radius:var(--sc-r-sm);transition:background var(--sc-t-fast) var(--sc-ease);}",
    "#scpanl-root .sc-idx-row:hover{background:var(--sc-hover);}",
    "#scpanl-root .sc-idx-tag{flex:none;font-size:10px;font-weight:var(--sc-fw-bold);padding:0 7px;",
    "border-radius:var(--sc-r-pill);line-height:18px;background:var(--sc-accent-bg);color:var(--sc-accent);}",
    /* 标签色相：数据驱动的颜色改为「只传一个色相变量」，配色算法留在 CSS（旧实现在 JS 里拼整条 hsl + color-mix）。
       仅 .hued 变体着色（backrefs 处的标签仍用品牌色，不受影响）。 */
    "#scpanl-root .sc-idx-tag.hued{color:hsl(var(--sc-tag-h,254),72%,58%);",
    "background:color-mix(in srgb,hsl(var(--sc-tag-h,254),85%,60%) 15%,transparent);}",
    "#scpanl-root .sc-idx-subject{flex:1;min-width:0;font-size:var(--sc-fs-sm);color:var(--sc-text);",
    "line-height:var(--sc-lh-normal);}",
    "#scpanl-root .sc-idx-pointer{flex:none;font-size:var(--sc-fs-xs);color:var(--sc-muted);",
    "cursor:pointer;margin-left:var(--sc-sp-2);}",
    "#scpanl-root .sc-idx-pointer:hover{color:var(--sc-accent);text-decoration:underline;}",
    "#scpanl-root .sc-idx-more{font-size:var(--sc-fs-sm);color:var(--sc-accent);cursor:pointer;",
    "padding:5px 2px;border:none;background:none;text-align:left;}",
    "#scpanl-root .sc-idx-more:hover{text-decoration:underline;}",
    "#scpanl-root .sc-notes-list{display:flex;flex-direction:column;gap:6px;margin-top:var(--sc-sp-1);}",
    "#scpanl-root .sc-note-chip{display:flex;align-items:center;gap:6px;border:1px solid var(--sc-border);",
    "border-radius:var(--sc-r-sm);padding:5px 9px;cursor:pointer;background:var(--sc-bg1);",
    "font-size:var(--sc-fs-sm);color:var(--sc-text);",
    "transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}",
    "#scpanl-root .sc-note-chip:hover{border-color:var(--sc-accent-bd);background:var(--sc-bg2);}",
    "#scpanl-root .sc-note-chip .sc-tag{background:var(--sc-bg3);color:var(--sc-faint);border:none;",
    "font-weight:var(--sc-fw-semibold);}",
    "#scpanl-root .sc-sec-arrow{display:inline-block;width:12px;flex:none;color:var(--sc-faint);}",
    /* 深度睡眠 */
    "#scpanl-root .sc-ds-badges{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:var(--sc-gap-row);margin:0 0 var(--sc-sp-3);}",
    /* v9 严格对齐：睡眠状态分布 —— 分段条 + 图例（原型深睡页第 2 张卡）。
     *   五态语义色与总览徽章同源（running 绿 / ended 蓝 / probing 黄 / suspect 紫 / stalled 红）。 */
    "#scpanl-root .sc-dseg{display:flex;height:8px;border-radius:var(--sc-r-pill);overflow:hidden;background:var(--sc-bg3);margin-bottom:var(--sc-sp-3);}",
    "#scpanl-root .sc-dseg i{display:block;height:100%;min-width:2px;}",
    "#scpanl-root .sc-dseg i.running,#scpanl-root .sc-segdot.running{background:var(--sc-ok);}",
    "#scpanl-root .sc-dseg i.ended,#scpanl-root .sc-segdot.ended{background:var(--sc-info);}",
    "#scpanl-root .sc-dseg i.probing,#scpanl-root .sc-segdot.probing{background:var(--sc-warn);}",
    "#scpanl-root .sc-dseg i.suspect,#scpanl-root .sc-segdot.suspect{background:var(--sc-accent);}",
    "#scpanl-root .sc-dseg i.stalled,#scpanl-root .sc-segdot.stalled{background:var(--sc-err);}",
    "#scpanl-root .sc-dlegend{display:flex;flex-wrap:wrap;gap:var(--sc-sp-3) var(--sc-gap-item);font-size:var(--sc-fs-xs);color:var(--sc-muted);}",
    "#scpanl-root .sc-dlegend-i{display:inline-flex;align-items:center;gap:6px;}",
    "#scpanl-root .sc-segdot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none;}",
    /* 状态徽标规格对齐 v9 的 .badge（4px 10px / 12px / 999px / panel2 底 + border2 边） */
    "#scpanl-root .sc-ds-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;",
    "border-radius:var(--sc-r-pill);font-size:12px;font-weight:var(--sc-fw-medium);",
    "line-height:var(--sc-lh-normal);background:var(--sc-bg2);border:1px solid var(--sc-border2);",
    "color:var(--sc-text);}",
    "#scpanl-root .sc-ds-badge .dot{width:8px;height:8px;border-radius:50%;flex:none;}",
    "#scpanl-root .sc-ds-badge.running{color:var(--sc-ok);background:var(--sc-ok-bg);border-color:transparent;}",
    "#scpanl-root .sc-ds-badge.running .dot{background:var(--sc-ok);}",
    "#scpanl-root .sc-ds-badge.ended{color:var(--sc-ok);background:var(--sc-ok-bg);border-color:transparent;}",
    "#scpanl-root .sc-ds-badge.ended .dot{background:var(--sc-faint);}",
    "#scpanl-root .sc-ds-badge.probing{color:var(--sc-info);background:var(--sc-info-bg);border-color:transparent;}",
    "#scpanl-root .sc-ds-badge.probing .dot{background:var(--sc-info);animation:scblink 1s infinite;}",
    "#scpanl-root .sc-ds-badge.suspect{color:var(--sc-info);background:var(--sc-info-bg);border-color:transparent;}",
    "#scpanl-root .sc-ds-badge.suspect .dot{background:var(--sc-info);}",
    "#scpanl-root .sc-ds-badge.stalled{color:var(--sc-err);background:var(--sc-err-bg);border-color:transparent;}",
    "#scpanl-root .sc-ds-badge.stalled .dot{background:var(--sc-err);}",
    /* v9 深睡页重排（2026-09-13）后零使用的规则已删：.sc-ds-timing / .sc-ds-stat（计时条）、
     *   .sc-ds-sessions / .sc-ds-session* / .sc-ds-dot* / .sc-ds-sid（会话明细列表）、@keyframes scblink
     *   —— 三者分别被状态机卡的水位条、分布卡图例、「最近会话」卡（.row + pill）取代。
     *   死规则由 check-runner 的 CSS 审计门禁守（本轮正是它抓出来的）。 */
    "#scpanl-root .sc-ds-alert{margin:var(--sc-gap-row) 0;padding:9px var(--sc-gap-item);",
    "border-radius:var(--sc-r-md);background:var(--sc-err-bg);",
    "border:1px solid color-mix(in srgb,var(--sc-err) 45%,transparent);color:var(--sc-err);",
    "font-size:var(--sc-fs-sm);}",
    /* v9 对齐：**待处理**类提示是 amber（方案 .alert.warn：琥珀底 + 琥珀字 + 22% 边），
     * 红色只留真错误（如深睡水位回滚、会话卡住）。此前一律红 ⇒ 语义被放大。 */
    "#scpanl-root .sc-ds-alert.warn{background:var(--sc-warn-bg);",
    "border-color:color-mix(in srgb,var(--sc-warn) 22%,transparent);color:var(--sc-warn);}",
    /* v9 记忆库页新增两种语义：候选区 `.alert.info`（说明性）/ 归档区 `.alert.ok`（安全声明）。 */
    "#scpanl-root .sc-ds-alert.info{background:var(--sc-info-bg);",
    "border-color:color-mix(in srgb,var(--sc-info) 22%,transparent);color:var(--sc-info);}",
    "#scpanl-root .sc-ds-alert.ok{background:var(--sc-ok-bg);",
    "border-color:color-mix(in srgb,var(--sc-ok) 22%,transparent);color:var(--sc-ok);}",
    "#scpanl-root .sc-ds-alert code{font-family:ui-monospace,Consolas,monospace;",
    "background:color-mix(in srgb,currentColor 12%,transparent);border-radius:4px;padding:0 4px;}",
    /* 向量 / 模型配置（早期 sc-vec-row/cell/label/... 一套已随向量区改版废弃，零使用已删；
       现向量区走 .sc-mem-grid + .setting-item，与记忆板块同构） */
    "#scpanl-root .sc-prov-btns{display:flex;flex-wrap:wrap;gap:6px;flex:none;max-width:420px;",
    "justify-content:flex-end;}",
    "#scpanl-root .sc-prov-btns .sc-btn{min-height:26px;padding:3px 10px;font-size:var(--sc-fs-xs);",
    "border-color:transparent;background:transparent;color:var(--sc-muted);}",
    "#scpanl-root .sc-prov-btns .sc-btn:hover{color:var(--sc-text);background:var(--sc-hover);}",
    "#scpanl-root .sc-prov-btns .sc-btn.on{color:var(--sc-accent);border-color:var(--sc-accent-bd);",
    "background:var(--sc-accent-bg);}",
    "#scpanl-root .sc-vec-actions{display:flex;gap:var(--sc-gap-row);justify-content:flex-end;",
    "align-items:center;margin:var(--sc-sp-1) 0;}",
    /* 根目录 */
    "#scpanl-root .sc-rootitem{display:flex;align-items:center;gap:var(--sc-gap-row);}",
    "#scpanl-root .sc-rootitem.active .sc-rootname{color:var(--sc-accent);font-weight:var(--sc-fw-semibold);}",
    "#scpanl-root .sc-dot{width:8px;height:8px;border-radius:50%;background:var(--sc-faint);flex:none;}",
    "#scpanl-root .sc-dot.on{background:var(--sc-accent);}",
    /* 状态色点四态（v9 的 .dot.ok/.warn/.err/.info）：KPI 顶行与导航脚状态块共用 */
    "#scpanl-root .sc-dot.ok{background:var(--sc-ok);}",
    "#scpanl-root .sc-dot.warn{background:var(--sc-warn);}",
    "#scpanl-root .sc-dot.err{background:var(--sc-err);}",
    "#scpanl-root .sc-dot.info{background:var(--sc-info);}",
    "#scpanl-root .sc-rootname{font-size:var(--sc-fs-md);flex:none;max-width:180px;overflow:hidden;",
    "text-overflow:ellipsis;white-space:nowrap;}",
    "#scpanl-root .sc-rootpath{flex:1;font-size:var(--sc-fs-xs);color:var(--sc-faint);overflow:hidden;",
    "text-overflow:ellipsis;white-space:nowrap;}",
    /* 画像 / 滑块 / 区间 */
    "#scpanl-root .sc-persona-slider{display:flex;width:100%;max-width:var(--sc-w-control);height:32px;",
    "border:1px solid var(--sc-border);border-radius:var(--sc-r-md);overflow:hidden;flex:none;",
    "margin:var(--sc-sp-1) 0;background:var(--sc-bg2);}",
    "#scpanl-root .sc-persona-cell{flex:1 1 0;display:flex;align-items:center;justify-content:center;",
    "font-size:var(--sc-fs-xs);color:var(--sc-muted);cursor:pointer;user-select:none;",
    "border-right:1px solid var(--sc-border);white-space:nowrap;padding:0 2px;",
    "transition:background var(--sc-t-base) var(--sc-ease),color var(--sc-t-base) var(--sc-ease),",
    "transform var(--sc-t-fast) var(--sc-ease);}",
    "#scpanl-root .sc-persona-cell:last-child{border-right:none;}",
    "#scpanl-root .sc-persona-cell.active{background:var(--sc-accent);color:#fff;font-weight:var(--sc-fw-semibold);}",
    "#scpanl-root .sc-persona-cell:not(.active):hover{background:var(--sc-hover);color:var(--sc-text);}",
    "#scpanl-root .sc-persona-cell:active{transform:translateY(1px);}",
    "button.sc-persona-cell{appearance:none;-webkit-appearance:none;background:none;border:0;",
    "border-right:1px solid var(--sc-border);font:inherit;}",
    "button.sc-persona-cell:last-child{border-right:none;}",
    "button.sc-persona-cell.active{background:var(--sc-accent);color:#fff;}",
    "#scpanl-root .sc-range-wrap{display:flex;flex-direction:column;gap:var(--sc-sp-1);align-items:flex-start;",
    "flex:none;min-width:var(--sc-w-control);margin:var(--sc-sp-1) 0;}",
    "#scpanl-root .sc-range-label{font-size:var(--sc-fs-xs);color:var(--sc-text);font-weight:var(--sc-fw-semibold);}",
    "#scpanl-root .sc-range-wrap input[type=range]{width:100%;max-width:var(--sc-w-control);",
    "accent-color:var(--sc-accent);}",
    /* 成分 / 小盒 / 笔记体 / 折叠体 */
    "#scpanl-root .sc-box{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);",
    "padding:var(--sc-sp-1) var(--sc-sp-2);margin-bottom:var(--sc-sp-1);background:var(--sc-bg1);}",
    "#scpanl-root .sc-card-body{margin:0;padding:var(--sc-pad-card);font-family:ui-monospace,Menlo,Consolas,monospace;",
    "font-size:var(--sc-fs-xs);line-height:var(--sc-lh-loose);color:var(--sc-text);white-space:pre-wrap;",
    "word-break:break-word;max-height:min(60vh,420px);overflow-y:auto;background:var(--sc-bg1);",
    "border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);}",
    "#scpanl-root .sc-card-head{display:flex;align-items:baseline;gap:var(--sc-sp-1);cursor:pointer;",
    "padding:3px var(--sc-sp-1);border-radius:var(--sc-r-sm);",
    "padding-left:calc(var(--sc-sp-2) + var(--sc-indent,0));}",
    "#scpanl-root .sc-card-head:hover{background:var(--sc-hover);}",
    "#scpanl-root .sc-edit-sec{display:inline-block;margin:var(--sc-sp-1) 0 var(--sc-sp-1) ",
    "calc(var(--sc-sp-2) + var(--sc-indent,0));padding:var(--sc-sp-1) var(--sc-sp-2);",
    "font-size:var(--sc-fs-xs);color:var(--sc-accent);cursor:pointer;}",
    "#scpanl-root .sc-more-btn{display:block;width:100%;margin:var(--sc-gap-item) 0 var(--sc-sp-1);",
    "padding:var(--sc-sp-1) var(--sc-sp-3);border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);",
    "color:var(--sc-muted);cursor:pointer;font:inherit;font-size:var(--sc-fs-xs);text-align:left;background:none;}",
    "#scpanl-root .sc-more-btn:hover{background:var(--sc-hover);color:var(--sc-text);}",
    "#scpanl-root .sc-more-body{display:flex;flex-direction:column;}",
    "#scpanl-root .sc-search-bar{display:flex;align-items:center;gap:var(--sc-gap-row);",
    "margin:var(--sc-sp-2) 0 var(--sc-sp-1);}",
    "#scpanl-root .sc-search-count{font-size:var(--sc-fs-xs);color:var(--sc-faint);}",
    "#scpanl-root .sc-recent{display:flex;flex-direction:column;gap:var(--sc-sp-1);margin:var(--sc-sp-1) 0;}",
    "#scpanl-root .sc-recent-row{display:flex;gap:var(--sc-gap-row);font-size:var(--sc-fs-xs);",
    "line-height:var(--sc-lh-normal);}",
    "#scpanl-root .sc-recent-at{color:var(--sc-faint);flex:none;min-width:calc(var(--sc-sp-6) * 3 + var(--sc-sp-5));}",
    "#scpanl-root .sc-recent-msg{color:var(--sc-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    /* 布局原语（供 JS 去内联样式） */
    "#scpanl-root .sc-spacer{margin-left:auto;}",
    "#scpanl-root .sc-row{display:flex;align-items:center;gap:var(--sc-sp-2);flex:none;}",
    "#scpanl-root .sc-col{display:flex;flex-direction:column;gap:var(--sc-sp-2);}",
    "#scpanl-root .sc-row-gap{display:flex;gap:var(--sc-sp-1);flex:none;align-items:center;}",
    "#scpanl-root .sc-col-end{display:flex;flex-direction:column;gap:var(--sc-sp-1);flex:none;align-items:flex-end;}",
    "#scpanl-root .sc-toolbar{display:flex;gap:var(--sc-gap-row);margin-top:var(--sc-sp-1);flex-wrap:wrap;}",
    "#scpanl-root .sc-num-wrap{display:flex;align-items:center;gap:var(--sc-sp-1);flex:none;}",
    "#scpanl-root .sc-num-wrap .sc-input{width:calc(var(--sc-sp-6) * 3);}",
    "#scpanl-root .sc-w-sm{width:var(--sc-w-sm);}#scpanl-root .sc-w-md{width:var(--sc-w-md);}",
    "#scpanl-root .sc-w-lg{width:var(--sc-w-lg);}#scpanl-root .sc-w-xl{width:var(--sc-w-xl);max-width:var(--sc-w-xl);}",
    "#scpanl-root .sc-max-xl{max-width:var(--sc-w-xl);}",
    "#scpanl-root .sc-on{color:var(--sc-accent);}",
    "#scpanl-root .sc-inline-note{margin:var(--sc-sp-1) 0 var(--sc-pad-card);font-size:var(--sc-fs-xs);",
    "color:var(--sc-accent);}",
    "#scpanl-root .sc-ta{width:100%;min-height:calc(var(--sc-sp-6) * 3 + var(--sc-sp-5));",
    "font-family:ui-monospace,Menlo,Consolas,monospace;font-size:var(--sc-fs-xs);}",
    /* YAML 编辑区（id 选择器需两个 id 提升权重，压过 textarea 通用规则） */
    "#scpanl-root #sc-yaml,#scpanl-root .sc-yaml{width:100%;height:clamp(160px,30vh,320px);padding:var(--sc-sp-2) var(--sc-gap-item);",
    "border-radius:var(--sc-r-md);border:1px solid var(--sc-border);resize:vertical;",
    "background:var(--sc-bg2);color:var(--sc-text);font-family:ui-monospace,Menlo,Consolas,monospace;",
    "font-size:var(--sc-fs-xs);line-height:var(--sc-lh-loose);outline:none;}",
    "#scpanl-root #sc-yaml:focus,#scpanl-root .sc-yaml:focus{border-color:var(--sc-accent);}",
    /* 侧栏入口 / 兜底悬浮按钮 */
    ".sc-trigger{box-sizing:border-box;cursor:pointer;width:calc(100% + 4px);height:42px;",
    "color:var(--dsw-alias-label-primary,var(--sc-text));background:0 0;border:none;",
    "border-radius:var(--sc-r-md);flex:none;align-items:center;gap:var(--sc-sp-2);",
    "margin:var(--sc-sp-1) -2px;padding:0 var(--sc-sp-2);font-family:inherit;font-size:var(--sc-fs-md);",
    "line-height:22px;display:flex;overflow:hidden;user-select:none;",
    "transition:background var(--sc-t-base) var(--sc-ease);}",
    ".sc-trigger:hover{background:var(--sc-hover);}",
    ".sc-trigger-label{white-space:nowrap;overflow:hidden;}",
    ".sc-trigger.sc-rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;",
    "margin:var(--sc-gap-row) 0 10px;padding:0;}",
    ".sc-trigger.sc-rail .sc-trigger-label{display:none;}",
    "#scpanl-root .sc-ic-lg{width:24px;height:24px;display:block;margin:var(--sc-gap-row) auto;pointer-events:none;}",
    "#scpanl-root .sc-ic-sm{width:var(--sc-sp-4);height:var(--sc-sp-4);display:block;pointer-events:none;}",
    /* 浮动入口同理（2026-09-26 U1）：原 \`9800\` 会浮在宿主弹窗/Toast 之上。
     * 它是**常驻入口按钮**（非模态），取 900 —— 与宿主引导浮层同档，低于弹窗 1000
     * ⇒ 宿主弹窗打开时它退到后面，不会挡住审批与提示。 */
    ".sc-fab{position:fixed;left:var(--sc-sp-4);bottom:var(--sc-sp-4);z-index:900;width:40px;height:40px;",
    "border-radius:50%;border:none;cursor:pointer;font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);",
    "color:#fff;background:var(--sc-accent);box-shadow:var(--sc-shadow-2);}",
    /* 旧 footer 类名兼容（DSH 宿主演进后多为死代码，保留防回退） */
    ".hHd-Xa_footerActions{padding-left:var(--sc-sp-2);margin:0;}",
    ".hHd-Xa_settingsArea{margin:0;}",
    "/* ---------- 运行总览组件（P1-1） ---------- */",
    "#scpanl-root .sc-opgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:var(--sc-gap-item);margin-bottom:var(--sc-sp-4);}",
    /* v9 严格对齐：操作卡标题行 = 图标 + 标题（原型三张卡各带一个线框图标） */
    "#scpanl-root .sc-opcard-head{display:flex;align-items:center;gap:var(--sc-sp-2);}",
    "#scpanl-root .sc-opcard-ic{display:inline-flex;align-items:center;color:var(--sc-accent);}",
    "#scpanl-root .sc-opcard{display:flex;flex-direction:column;border:1px solid var(--sc-border);border-radius:var(--sc-r-md);padding:var(--sc-pad-card);background:var(--sc-bg-card);}",
    "#scpanl-root .sc-opcard-t{font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);color:var(--sc-text);}",
    "#scpanl-root .sc-opcard-d{margin-top:var(--sc-sp-2);font-size:var(--sc-fs-xs);line-height:var(--sc-lh-normal);color:var(--sc-muted);}",
    "#scpanl-root .sc-opcard-f{margin-top:auto;padding-top:var(--sc-sp-3);display:flex;align-items:center;gap:var(--sc-sp-2);}",
    "#scpanl-root .sc-opcard-f .sc-btn{min-width:84px;}",
    /* v9 严格对齐：原型 .kpis 是 **固定 4 列**（此前用 auto-fit+minmax，实测在 946px 下算出 5 列，
     *   多出一个 0 宽的轨道）；画像页则是 **2×2** ⇒ 专用 .sc-kpis-2（见下）。 */
    "#scpanl-root .sc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sc-gap-item);margin-bottom:var(--sc-sp-4);}",
    "#scpanl-root .sc-kpis-2{grid-template-columns:repeat(2,minmax(0,1fr));}",
    "#scpanl-root .sc-kpi{display:flex;flex-direction:column;border:1px solid var(--sc-border);border-radius:var(--sc-r-md);padding:13px 14px;background:var(--sc-bg-card);}",
    "#scpanl-root .sc-kpi-top{display:flex;align-items:center;gap:7px;font-size:11.5px;line-height:var(--sc-lh-normal);color:var(--sc-muted);}",
    /* v9 对齐：KPI 顶行的**状态色点**（7px，随 KPI 状态变色）—— 此前面板无点，状态只能靠进度条读 */
    "#scpanl-root .sc-kpi-top .sc-dot{width:7px;height:7px;flex:none;}",
    "#scpanl-root .sc-kpi-val{min-height:34px;display:flex;align-items:baseline;margin:5px 0 1px;line-height:1.15;font-size:clamp(22px,2.05vw,26px);font-weight:680;letter-spacing:-.3px;color:var(--sc-text);}",
    "#scpanl-root .sc-kpi-val.txt{font-size:17px;font-weight:var(--sc-fw-semibold);letter-spacing:0;}",
    "#scpanl-root .sc-kpi-sub{min-height:18px;font-size:11px;color:var(--sc-faint);}",
    "#scpanl-root .sc-kpi-bar{margin-top:auto;height:6px;border-radius:3px;background:var(--sc-border2);overflow:hidden;}",
    "#scpanl-root .sc-kpi-bar i{display:block;height:100%;width:var(--sc-pct,0);border-radius:3px;background:var(--sc-accent);}",
    "#scpanl-root .sc-kpi-bar i.ok{background:var(--sc-ok);}",
    "#scpanl-root .sc-kpi-bar i.info{background:var(--sc-info);}",
    "#scpanl-root .sc-kpi-bar i.suspect{background:var(--sc-warn);}",
    "#scpanl-root .sc-kpi-bar i.stalled{background:var(--sc-err);}",
    "#scpanl-root .sc-kpi-bar.na{background:repeating-linear-gradient(90deg,var(--sc-border) 0 6px,transparent 6px 12px);}",
    "#scpanl-root .sc-kpi-bar.na i{display:none;}",
    /* ══════════ ⑥ 适配层 ══════════ */
    /* 密度：紧凑（隐藏描述、压缩行高与留白） */
    "#scpanl-root .sc-density-compact .setting-item,#scpanl-modal.sc-density-compact .setting-item{padding:var(--sc-sp-1) 0;}",
    "#scpanl-root .sc-density-compact .setting-item-desc,#scpanl-modal.sc-density-compact .setting-item-desc{display:none;}",
    "#scpanl-root .sc-density-compact .sc-fold-head,#scpanl-modal.sc-density-compact .sc-fold-head{padding:5px var(--sc-gap-item);}",
    "#scpanl-root .sc-density-compact .sc-view,#scpanl-modal.sc-density-compact .sc-view{",
    "padding:var(--sc-sp-4) var(--sc-sp-5) var(--sc-sp-6);}",
    "#scpanl-root .sc-density-compact .sc-mem-stat,#scpanl-modal.sc-density-compact .sc-mem-stat{",
    "padding:var(--sc-sp-2) var(--sc-sp-3);}",
    /* 大屏 ≥1440：放宽导航与阅读宽度 */
    "@media (min-width:1440px){",
    "#scpanl-modal{--sc-nav-w:232px;}",
    "#scpanl-root .sc-view{padding:clamp(16px,2.2vw,32px) clamp(20px,3vw,48px) clamp(24px,3vw,48px);max-width:min(1120px,100%);min-height:0}",
    "}",
    /* 中屏 ≤1180：导航收窄、描述让位 */
    "@media (max-width:1180px){",
    "#scpanl-modal{--sc-nav-w:184px;}",
    "#scpanl-root .sc-view{padding:var(--sc-sp-5) var(--sc-sp-5) var(--sc-sp-6);min-height:0}",
    "#scpanl-root .setting-item-desc{max-width:52ch;}",
    "}",
    /* 平板 ≤900：表单行转纵向，控件占满整行 */
    "@media (max-width:900px){",
    /* v9 严格对齐：原型在此档把 .kpis 收敛为 2 列 */
    "#scpanl-root .sc-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}",
    "#scpanl-modal{--sc-nav-w:160px !important;}",
    "#scpanl-root .sc-nav{padding:var(--sc-sp-2) var(--sc-sp-1);}",
    "#scpanl-root .sc-nav-item{padding:8px var(--sc-sp-2);gap:var(--sc-sp-1);}",
    "#scpanl-root .sc-nav-item svg{width:15px;height:15px;}",
    "#scpanl-root .sc-view{padding:var(--sc-sp-4) var(--sc-sp-4) var(--sc-sp-6);min-height:0}",
    "#scpanl-root .setting-item:not(.sc-rootitem){flex-direction:column;align-items:stretch;gap:var(--sc-sp-2);}",
    "#scpanl-root .setting-item-control{width:100%;justify-content:flex-start;flex-wrap:wrap;}",
    "#scpanl-root .sc-mem-stat.hero{grid-column:span 2;}",
    "}",
    /* 移动 ≤720：导航转顶部横向 tab，模态全屏，出现关闭按钮（此前移动端无法关闭面板） */
    "@media (max-width:720px){",
    "#scpanl-mask{padding:0;}",
    "#scpanl-modal{--sc-nav-w:100% !important;width:min(1480px,96vw);height:min(900px,92vh);max-width:100vw;max-height:100vh;",
    "border-radius:0;border:none;flex-direction:column;}",
    "#scpanl-root .sc-nav{width:100% !important;flex:none;flex-direction:row;overflow-x:auto;overflow-y:hidden;",
    "border-right:none;border-bottom:1px solid var(--sc-border);padding:var(--sc-sp-2);gap:var(--sc-sp-1);",
    "align-items:center;}",
    "#scpanl-root .sc-nav-title,#scpanl-root .sc-nav-group,#scpanl-root .sc-nav-spacer{display:none !important;}",
    "#scpanl-root .sc-nav-item{flex:none;white-space:nowrap;border-radius:var(--sc-r-pill);",
    "padding:6px var(--sc-sp-3);}",
    "#scpanl-root .sc-nav-close{display:inline-flex;align-items:center;justify-content:center;flex:none;",
    "position:sticky;right:0;margin-left:auto;width:32px;height:32px;border-radius:50%;",
    "border:1px solid var(--sc-border);background:var(--sc-bg1);color:var(--sc-text);",
    "cursor:pointer;font-size:17px;line-height:1;appearance:none;-webkit-appearance:none;padding:0;}",
    "#scpanl-root .sc-view{padding:var(--sc-sp-4) var(--sc-sp-3) var(--sc-sp-6);min-height:0}",
    "#scpanl-root .sc-h1{font-size:clamp(15px,1.15vw,18px);}",
    "#scpanl-root .sc-desc{font-size:clamp(12px,.85vw,13px);}",
    "#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));}",
    "#scpanl-root .sc-mem-stat.hero{grid-column:span 1;}",
    "#scpanl-root .sc-kv{grid-template-columns:1fr;gap:0;}",
    "#scpanl-root .sc-kv-k{padding-top:var(--sc-sp-1);}",
    "#scpanl-root .sc-statusbar{padding:var(--sc-sp-2) var(--sc-sp-4);}",
    "#scpanl-root textarea{font-size:13px;}",
    "}",
    /* 小屏 ≤480：双列卡片，压缩按钮内距 */
    "@media (max-width:480px){",
    "#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{grid-template-columns:1fr 1fr;}",
    "#scpanl-root .sc-mem-stat.hero{grid-column:span 2;}",
    "#scpanl-root .sc-btn{padding:5px 10px;}",
    "#scpanl-root .sc-ds-badges{gap:6px;}",
    "#scpanl-root .sc-prov-btns{max-width:100%;justify-content:flex-start;}",
    "}",
    /* 触摸设备：加大点击热区 */
    "@media (hover:none){",
    "#scpanl-root .sc-nav-item{padding:10px var(--sc-sp-3);}",
    "#scpanl-root .sc-btn{min-height:36px;padding:8px 14px;}",
    "#scpanl-root .sc-fold-head{padding:12px var(--sc-gap-item);}",
    "#scpanl-root .sc-note-chip,#scpanl-root .sc-pointer{padding:12px;}",
    "}",
    /* 尊重系统「减少动效」 */
    "@media (prefers-reduced-motion:reduce){",
    "#scpanl-root *,#scpanl-root *::before,#scpanl-root *::after{",
    "transition-duration:.01ms !important;animation-duration:.01ms !important;}",
    "}"
  ].join("");

  // src-client/i18n-dict-cfg.js
  var EN = {
    " / 空闲 ": " / idle ",
    " / 蒸馏模型 ": " / distillation model ",
    " 分钟 / 本轮最少 ": " min / this turn minimum ",
    " 字符 / 预筛 ": " chars / prescan ",
    " 字符 · 双画像+记忆指针 ": " chars · dual profile + memory pointers ",
    " 字符）。不影响任务执行注入——注入总看完整画像": " chars). Does not affect task-execution injection — injection always sees the full profile",
    " 字符）。不影响任务执行注入": " chars). Does not affect task-execution injection",
    " 字符）。注入按档位行数不受此限": " chars). Injection follows tier line counts and is not bound by this limit",
    " 完成": " done",
    " 已设": " set",
    " 条带耗时记录均算": " timed records averaged",
    " 条）——每轮随提示词注入": " items) — injected with the prompt every round",
    " 次 · ": " times · ",
    " 行薄行，~秒级）": " thin lines, ~seconds)",
    " 轮": " rounds",
    " 项": " items",
    "0 = 关闭轮询。影响运行态数据刷新频率。": "0 = polling off. Affects how often runtime data is refreshed.",
    "AGENT.md 容量门 cap_agent": "AGENT.md capacity gate cap_agent",
    "MCL 状态": "MCL status",
    "MEMORY.md 容量门 cap_memory": "MEMORY.md capacity gate cap_memory",
    "Ollama（本机缺省）": "Ollama (local default)",
    "POST /eval/test —— 发一次最小判定，返回**分态**结果（ok / off / egress-denied / key-missing / unreachable / bad-body / type-violation），不落库。": "POST /eval/test — sends one minimal judgment and returns a **state-classified** result (ok / off / egress-denied / key-missing / unreachable / bad-body / type-violation); nothing is persisted.",
    "URL 无效": "Invalid URL",
    "URL 无效（需 http(s):// 开头）": "Invalid URL (must start with http(s)://)",
    "USER.md 容量门 cap_user": "USER.md capacity gate cap_user",
    "active→warm 无命中天数（缺省 14）": "Days with no hit before active→warm (default 14)",
    // ADR-333（2026-09-22）：容量门文案改为**随开关态**如实描述（原文案无条件称"被拒"，
    //   而实测四条路径里三条本就不阻断 ⇒ 开关关闭后那三句全是假话）。
    //   ⚠ 键必须与 `panes-capacity.js` 的 tr() 串**逐字一致**（`check-i18n-keys` 守）。
    "写入超限会被拒（当前：阻断已开启）": "writes over the limit are rejected (currently: blocking is ON)",
    "写入超限不再阻断（当前：阻断已关闭，超限照写并留一条 capacity-over 审计痕）": "writes over the limit are no longer blocked (currently: blocking is OFF — over-limit writes pass and leave a capacity-over audit trace)",
    "容量门 = 记忆库能长多大（超限是否阻断由下方开关决定）；活性/遗忘为天级阈值。": "Capacity gate = how large the memory bank may grow (whether over-limit blocks is decided by the switch below); activity/forgetting are day-level thresholds.",
    "容量门是否阻断写入 capacityEnforce": "Does the capacity gate block writes? (capacityEnforce)",
    "缺省「关闭」= 超限照写（并落一条 capacity-over 留痕）。开=超限拒写（改造前画像行为）。只影响容量这一支：源指针悬空 / 行格式 / 疑似凭据三道门始终硬拒，不受此开关影响。改后即时生效（写门每轮重读）。": 'Default "OFF" = over-limit writes pass (and leave a capacity-over trace). ON = reject over-limit writes (the pre-change profile behaviour). Affects only the capacity branch: dangling source pointers / line format / suspected credentials always stay hard-rejected regardless of this switch. Takes effect immediately (the write gate re-reads it every round).',
    "关闭（缺省·超限照写并留痕）": "OFF (default · pass over-limit and leave a trace)",
    "开启（超限拒写）": "ON (reject over-limit writes)",
    "agent 画像记忆库容量（字符）：": "Agent profile memory bank capacity (chars): ",
    "（AGENT.md 当前实际 ": "(AGENT.md currently ",
    "（当前实际 ": "(currently ",
    " 字符）。不影响任务执行注入——注入总看完整画像": " chars). Does not affect task-execution injection — injection always sees the full profile",
    " 字符）。不影响任务执行注入": " chars). Does not affect task-execution injection",
    " 字符）。注入按档位行数不受此限": " chars). Injection is limited by per-level row count, not by this",
    "cold 后超此天数未命中 → 遗忘候选清单（缺省 90，只建议不删除）": "No hit for more than this many days after cold → forgetting candidate list (default 90; suggestion only, never deletes)",
    "cold/retired 小节在融合召回中的降权系数（百分比 → /100；缺省 35%，后端范围校验 [5,95] 兜底）": "Downweight factor for cold/retired sections in fusion recall (percentage → /100; default 35%, backend range validation [5,95] as a fallback)",
    "key 环境变量名（本地免填）": "Key environment variable name (not needed locally)",
    "key 环境变量名（本机免填）": "API key environment variable name (not needed for local endpoints)",
    "off=不注入 / low(2 条) / medium(4 条) / high(8 条) / smart=智能上限(10 条)；当前：": "off = no injection / low(2 items) / medium(4 items) / high(8 items) / smart = smart cap (10 items); current: ",
    "provider → 中文模式名：fusion=融合 / lexical=词法 / gpu-ready=就绪 / off=关": "provider → Chinese mode name: fusion=fusion / lexical=lexical / gpu-ready=ready / off=off",
    "rrf=排名融合（缺省，对离群分稳健）；weighted=旧 min-max 加权（回滚用）。阈值口径与融合解耦——始终用绝对余弦（ACT-024）": "rrf=rank fusion (default, robust to outlier scores); weighted=legacy min-max weighting (for rollback). The threshold measure is decoupled from fusion — always absolute cosine (ACT-024)",
    "running 无事件持续此毫秒后发起输出增长探测（默认 3 小时）。": "After running with no events for this many milliseconds, an output-growth probe is launched (default 3 hours).",
    "spawn 前先扫增量信号词 + pending 候选，皆无则跳过（不唤醒 LLM，省成本）": "Before spawning, scan the delta for signal words + pending candidates; if neither is present, skip (no LLM wake-up, saving cost)",
    "turn 结束后空闲满此时长才蒸馏（≥1 分钟，默认 10 分钟）": "Distillation runs only after the turn ends and the session has been idle this long (≥1 minute, default 10 minutes)",
    "v17 已生效：关闭=不注入画像；仅注入我=只注入 agent 画像 AGENT.md（含 [原则] 习得原则与 [路径] 任务路径）；仅注入你=只注入用户画像 USER.md；全注入=双画像（默认）": "v17 in effect: off = no profile injection; inject me only = inject only the agent profile AGENT.md (including [原则] learned principles and [路径] task paths); inject you only = inject only the user profile USER.md; inject both = both profiles (default)",
    "v9 = 方案调色板（默认）；宿主 = 跟随 DSH 主题令牌（与宿主同色）。": "v9 = scheme palette (default); host = follow DSH theme tokens (same colors as the host).",
    "v9 方案皮肤": "v9 scheme skin",
    "warm→cold 无命中天数（缺省 44 = warm+30）": "Days with no hit before warm→cold (default 44 = warm+30)",
    "——下次召回按当前模型自动重嵌": " — the next recall re-embeds automatically with the current model",
    "——根会话活跃中会跳过，等闲置自动跑": " — it is skipped while the root session is active; it runs automatically once idle",
    "——重载后生效": " — takes effect after reload",
    "① 注入与画像": "① Injection and profile",
    "② 记忆与容量": "② Memory and capacity",
    "③ 模型与向量": "③ Models and vectors",
    "④ 后台与调度": "④ Background and scheduling",
    "⚠ 宿主模型不可用": "⚠ Host models unavailable",
    "⚠ 评估通道配置读取失败：": "⚠ Failed to read the evaluation channel configuration: ",
    "⚠ 读取失败：": "⚠ Read failed: ",
    "⚠ 调度器未就绪：显示值为持久文件值，运行时值需插件激活后读取": "⚠ Scheduler not ready: the displayed values are from the persistent file; runtime values are read only after the plugin activates",
    "✓ persona 档位 = ": "✓ persona level = ",
    "✓ 分级策略连败上限 = ": "✓ Graded policy consecutive-failure limit = ",
    "✓ 向量 ": "✓ Vector ",
    "✓ 向量缓存已清": "✓ Vector cache cleared",
    "✓ 已保存（重载后生效——若换了服务/模型请点「清缓存重建」）": '✓ Saved (takes effect after reload — if you switched service/model, click "Clear cache & rebuild")',
    "✓ 已保存（重载生效）": "✓ Saved (takes effect on reload)",
    "✓ 已保存，原文件已备份为 .bak-*": "✓ Saved; the original file was backed up as .bak-*",
    "✓ 已写入 ": "✓ Written to ",
    "✓ 已切换 ": "✓ Switched to ",
    "✓ 已启用 ": "✓ Enabled ",
    "✓ 根目录已启用": "✓ Root directory enabled",
    "✓ 深睡未消化策略 = ": "✓ Deep sleep unprocessed policy = ",
    "✓ 配置快照已导出": "✓ Configuration snapshot exported",
    "「用户文本 ↔ 命中索引行」的绝对余弦阈值（0–1，缺省 0.65；ACT-024 校准：0.65 → 触发率 ~2% 且阈上全为真命中）": 'Absolute cosine threshold for "user text ↔ matched index line" (0–1, default 0.65; ACT-024 calibration: 0.65 → trigger rate ~2% and everything above the threshold is a true hit)',
    "三级选择（服务 → 模型 → 档位）。服务选好先「枚举模型」（浏览器直连该端点），或直接手填模型名——本机 Ollama 的模型不在宿主目录里，手填是常态。": 'Three-level selection (service → model → level). After choosing a service, click "List models" (the browser connects to that endpoint directly), or simply type the model id — local Ollama models are not in the host catalog, so typing them is the norm.',
    "与开关**分离**的两项授权：「允许装外部服务」≠「允许记忆内容出机」。缺省 false；填了远端地址但未勾此项 ⇒ 拒发并如实记 egress-denied。": 'A **separate** authorization from the on/off switch: "allow installing an external service" ≠ "allow memory content to leave the machine". Defaults to false; a remote URL without this checked ⇒ the request is refused and honestly recorded as egress-denied.',
    "两轮采样之间的间隔（默认 60 秒）。": "Interval between two sampling rounds (default 60 seconds).",
    "事件蒸馏（会话闲置提炼可复用知识）用的模型。继承=跟随主会话。": "The model used for event distillation (extracting reusable knowledge while the session is idle). Inherit = follow the main session.",
    "仅在「分级」策略下生效（1–100，缺省 3）：连续失败达此轮数后放行深睡水位并记一条审计告警；全重捞策略下此项不参与判定。": 'Only effective under the "graded" policy (1–100, default 3): after this many consecutive failed rounds, the deep sleep watermark is released and one audit alert is logged; under the full re-fetch policy this setting does not take part in the decision.',
    "仅注入你": "Inject you only",
    "仅注入我": "Inject me only",
    "保存": "Save",
    "保存端点与档位": "Save endpoint and level",
    "保存配置": "Save config",
    "停滞阈值 deepSleepIdleMs": "Stall threshold deepSleepIdleMs",
    "允许出网 evalEgressAllow": "Allow egress (evalEgressAllow)",
    "先填写服务地址": "Enter the service address first",
    "全局": "Global",
    "全注入": "Inject both",
    "全部会话停滞 ≥ 阈值后自动提炼原则层（关闭 = 暂停，等于原「暂停到明天」）。": 'Once all sessions have been stalled ≥ the threshold, distill the principle layer automatically (off = paused, same as the former "pause until tomorrow").',
    "全部会话无活动持续满此毫秒数才触发（默认 3 小时）。": "Triggers only after all sessions have been inactive for this many milliseconds (default 3 hours).",
    "全重捞（retry）= 永不放弃，未消化就一直重捞本批（保证不丢料；材料永久失败时每轮都会重试）；分级（graded）= 连续失败达 N 轮后放行水位并记审计告警（避免无限重试烧 LLM）。缺省 graded。": "Full re-fetch (retry) = never give up; keeps re-fetching this batch while unprocessed (guarantees nothing is lost; retries every round when material fails permanently); graded = releases the watermark after N consecutive failed rounds and logs an audit alert (avoiding infinite retries burning LLM calls). Default graded.",
    "全重捞（不丢料，永不放弃）": "Full re-fetch (lose nothing, never give up)",
    "关=不注册蒸馏器（/suite 等只读视图仍可用）；改动需重载生效": "Off = the distiller is not registered (read-only views such as /suite remain available); changes take effect after reload",
    "关闭": "Off",
    "关闭面板": "Close panel",
    "写入 ~/.dsh/suite/scheduler.json；改后需重载插件生效。": "Written to ~/.dsh/suite/scheduler.json; reload the plugin for changes to take effect.",
    "写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前值读取中…": "Written to the self-held config ~/.dsh/suite/scheduler.json (same channel as deep sleep). Changes do not affect running sessions immediately — **they take effect after reloading the plugin**. Reading current values…",
    "写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前：蒸馏 ": "Written to the self-held config ~/.dsh/suite/scheduler.json (same channel as deep sleep). Changes do not affect running sessions immediately — **they take effect after reloading the plugin**. Current: distillation ",
    "分级策略连败上限 deepSleep.failPolicyMaxRounds": "Graded policy consecutive-failure limit deepSleep.failPolicyMaxRounds",
    "分级（连败 N 轮后放行并告警）": "Graded (release and alert after N consecutive failures)",
    "分钟": "minutes",
    "切换日志面板": "Toggle log panel",
    "列表默认折叠详情，先给概览再按需展开。": "Details are collapsed by default: overview first, expand on demand.",
    "加权": "Weighted",
    "加深候选命中数 activityHotHits": "Deepening candidate hit count activityHotHits",
    "加载可用模型中…": "Loading available models…",
    "匹配 ": "Matched ",
    "即时生效：改动直接写 ~/.dsh/suite/scheduler.json（写前备份）。": "Takes effect immediately: changes are written straight to ~/.dsh/suite/scheduler.json (backed up before writing).",
    "原生校准型": "Natively calibrated",
    "参数调节": "Parameter tuning",
    "召回 ": "Recall ",
    "召回与库版本": "Recall & bank version",
    "召回冷条目降权 recallColdFactorPercent": "Recall downweight for cold entries recallColdFactorPercent",
    "召回模式 ": "Recall mode ",
    "召回融合策略 recallFusion": "Recall fusion strategy recallFusion",
    "可用": "Available",
    "向量与模型 · 当前链路": "Vectors & models · current pipeline",
    "向量状态不可用: ": "Vector status unavailable: ",
    "向量缓存": "Vector cache",
    "向量缓存已清": "Vector cache cleared",
    "启动时视图": "Startup view",
    "启用": "Enable",
    "启用深度睡眠自动归纳 enableDeepSleep": "Enable deep sleep auto-induction enableDeepSleep",
    "启用认知环 mclEnabled": "Enable cognition ring mclEnabled",
    "启用评估通道 evalEnabled": "Enable the evaluation channel (evalEnabled)",
    "在状态栏上方常驻显示调用日志。": "Keep the call log visible above the status bar.",
    "天": "days",
    "如 http://127.0.0.1:11434/v1（Ollama）或 http://127.0.0.1:9915/v1（自建桥）；改完回车自动探测。": "e.g. http://127.0.0.1:11434/v1 (Ollama) or http://127.0.0.1:9915/v1 (self-hosted bridge); press Enter after editing to probe automatically.",
    "如何启用语义检索": "How to enable semantic retrieval",
    "字符": "chars",
    "守藏根目录": "Shoucang root directories",
    "守藏蒸馏器 enableDistill": "Shoucang distiller enableDistill",
    "宿主原生皮肤": "Host native skin",
    "宿主可用 ": "Host available ",
    "宿主模型目录为空 —— 可在「自定义」里手填模型名，或先在 Harness 里配好模型": 'The host model catalog is empty — type a model id under "Custom", or configure a model in Harness first',
    "导出中…": "Exporting…",
    "导出快照": "Export snapshot",
    "导出配置原文 + 界面偏好（JSON）": "Export the raw configuration + interface preferences (JSON)",
    "导航分组显示": "Show navigation groups",
    "导航宽度": "Nav width",
    "尚未登记任何根目录——在上方输入路径添加。": "No root directory registered yet — enter a path above to add one.",
    "嵌入服务连通性测试": "Embedding service connectivity test",
    "左侧导航像素宽度（140–320）；窄屏（≤900px）由响应式断点接管。": "Left navigation width in pixels (140–320); narrow screens (≤900px) are handled by the responsive breakpoint.",
    "已允许出网": "Egress allowed",
    "已写入": "Saved",
    "已禁止出网": "Egress disallowed",
    "常驻显示记忆库状态与库路径。": "Always show memory bank status and bank path.",
    "平均耗时": "Avg duration",
    "开": "On",
    "开=按相关性选行（缺省）；关=回落「基线 + 新鲜度」选行。即时生效（下次注入即用）": 'on = select lines by relevance (default); off = fall back to "baseline + freshness" selection. Takes effect immediately (used on the next injection)',
    "开=类型化判定可用（choice / boolean / score）；关=通道整体停用（缺省关，fail-closed）。写入 scheduler.json。": "On = typed judgments available (choice / boolean / score); off = the whole channel is disabled (off by default, fail-closed). Written to scheduler.json.",
    "开=融合召回（dense0.7+lexical0.3）；关=纯词法。写 scheduler.json": "On = fusion recall (dense 0.7 + lexical 0.3); off = pure lexical. Writes to scheduler.json",
    "当前": "Current",
    "当前为显式关闭态（scheduler.json 里 evalEnabled=false）。": "Currently explicitly off (evalEnabled=false in scheduler.json).",
    "当前根": "Current root",
    "当前注入：空（hot_memory 关或画像/记忆为空）": "Current injection: empty (hot_memory off, or profile/memory is empty)",
    "当前直接注入 ≈ ": "Current direct injection ≈ ",
    "当前：": "Current:",
    "快捷键": "Shortcuts",
    "恢复默认设置": "Restore defaults",
    "慢通道最多再引导次数（0–3，缺省 1；绝不死锁）": "Maximum re-guidance count on the slow path (0–3, default 1; never deadlocks)",
    "慢通道材料硬预算（120–4000 字符，缺省 600；只作用于慢通道首步）": "Hard budget for slow path material (120–4000 chars, default 600; applies only to the first slow path step)",
    "慢通道注入的指针条数（1–5，缺省 3）": "Number of pointers injected on the slow path (1–5, default 3)",
    "慢通道首步注入「薄契约 + top-k 指针」并按需再引导一次；快通道零额外往返。缺省开（false = 一键回滚）": 'The slow path injects a "thin contract + top-k pointers" on its first step and re-guides once as needed; the fast path adds zero extra round trips. On by default (false = one-click rollback)',
    "成功率": "Success rate",
    "手写 ~/.dsh/suite/scheduler.json：embedBaseUrl=云端端点 + embedModel=模型名 + embedApiKeyEnv=key 环境变量名；改后重载并「清缓存重建」。": 'Hand-edit ~/.dsh/suite/scheduler.json: embedBaseUrl=cloud endpoint + embedModel=model name + embedApiKeyEnv=key environment variable name; after editing, reload and "Clear cache & rebuild".',
    "手动触发一轮蒸馏——携带 pending/ 候选（如 project-defer 降级卡）重裁决入册。workspace 反解修复后 project 卡直写工作区 devref。": "Manually trigger one distillation round — carrying pending/ candidates (such as project-defer downgrade cards) through re-adjudication and into the bank. After the workspace back-resolution fix, project cards are written directly to the workspace devref.",
    "打开 / 关闭面板": "Open / close panel",
    "打开时自动刷新": "Auto-refresh on open",
    "打开面板即重新拉取当前视图数据。": "Re-fetch the current view\\'s data as soon as the panel opens.",
    "打开面板后默认落地的页面。优先级：#sc=<视图名> 深链 > 上次视图记忆 > 此项。": "The page the panel lands on by default when opened. Priority: #sc=<view name> deep link > last-view memory > this setting.",
    "把「答案可枚举、但判据写不成代码」的判定交给一个可配置模型。**默认关闭**：关闭时行为与未装此能力逐字节一致。改动写 ~/.dsh/suite/scheduler.json，**重载插件后生效**。": "Delegate judgments whose answers are enumerable but whose criteria cannot be expressed as code to a configurable model. **Off by default**: while off, behavior is byte-identical to not having this capability at all. Changes are written to ~/.dsh/suite/scheduler.json and **take effect after reloading the plugin**.",
    "折叠阈值": "Fold threshold",
    "指向含 shoucang.config.yaml 的工作区目录。该目录本身即为 Obsidian 兼容 vault（Markdown + frontmatter + [[双链]]），可用 Obsidian 直接打开。": "Points to a workspace directory containing shoucang.config.yaml. That directory is itself an Obsidian-compatible vault (Markdown + frontmatter + [[wikilinks]]) and can be opened directly in Obsidian.",
    "按 ": "By ",
    "按**成本结构**分档（不是按厂商）：本机零成本 / 远程小快 / 原生校准 / 现有大模型。档位决定**超时预算**（本机推理含模型加载给 60s、远端快模型 15s）与**置信阈值口径**（原生档用校准阈值，其余用保守阈值）。": "Tiered by **cost structure**, not by vendor: local zero-cost / remote small-fast / natively calibrated / existing large model. The level determines the **timeout budget** (local inference includes model loading, so 60s; remote fast models 15s) and the **confidence-threshold regime** (the native tier uses calibrated thresholds, the rest use conservative ones).",
    "按语义显示分组标题（守藏 / 总览 / 记忆 / 运行 / 配置）。": "Show semantic group headings (Shoucang / Overview / Memory / Runtime / Config).",
    "探测发起延迟 deepSleepProbeAfterMs": "Probe launch delay deepSleepProbeAfterMs",
    "探测采样间隔 deepSleepProbeWindowMs": "Probe sampling interval deepSleepProbeWindowMs",
    "新鲜度保底槽 injectFreshSlots": "Freshness reserved slots injectFreshSlots",
    /* ── 槽位预算三键（2026-09-22 · ADR-328 ②）—— 控件新入面板，文案须双语齐备 ── */
    "注入总预算 injectBudgetChars": "Injection total budget injectBudgetChars",
    "注入文本的字符总预算（**参与限额的三层之和**：稳定面 + 动态面 + 一次性；范围 800–20000，缺省 4000）。越界由服务端夹回并在面板标「已夹取」": 'Character budget for the injected text (**sum of the three limited layers**: stable + dynamic + one-shot; range 800–20000, default 4000). Out-of-range values are clamped server-side and flagged as "clamped" in the panel',
    "情境槽预算 injectSituationBudgetChars": "Situation slot budget injectSituationBudgetChars",
    "情境槽（环记录按情境键匹配）的字符预算（范围 0–4000，缺省 1200）。它**独立于**注入总预算，不吃三层额度": "Character budget for the situation slot (ring records matched by situation key; range 0–4000, default 1200). It is **independent of** the total injection budget and does not consume the three layers",
    "档位上限 injectLevelCaps": "Level caps injectLevelCaps",
    "四档（low/medium/high/smart）各自的选行上限（**对象键**，缺省 2/4/8/14）。改后整对象写回；单档越界由服务端拒并回报": "Per-level row caps for the four levels (low/medium/high/smart; an **object key**, default 2/4/8/14). The whole object is written back; an out-of-range level is rejected server-side and reported",
    "方案 A · 本地 GPU 服务（推荐，零 token 成本）": "Option A · Local GPU service (recommended, zero token cost)",
    "方案 B · 云端 API": "Option B · Cloud API",
    "无响应": "No response",
    "无法连接该服务（/v1/models 与 /health 均无响应）": "Cannot reach the service (neither /v1/models nor /health responded)",
    "无法连接该服务（/v1/models 与 /health 均无响应）——检查地址/服务是否在跑/CORS": "Cannot connect to this service (neither /v1/models nor /health responds) — check the address / whether the service is running / CORS",
    "无记录": "No records",
    "显示密度": "Display density",
    "显示日志面板": "Show log panel",
    "暂无带耗时的记录": "No timed records yet",
    "最近改动（5 条）": "Recent changes (last 5)",
    "最近查询: ": "Last query: ",
    "服务": "Service",
    "服务在但无 /models 枚举（用固定模型）": "Service is up but has no /models listing (using the fixed model)",
    "服务在但无 /models——用固定 ": "Service is up but has no /models — using fixed ",
    "服务地址（OpenAI 兼容 /v1 根）": "Service address (OpenAI-compatible /v1 root)",
    "服务地址（OpenAI 兼容 /v1 根）与 key 环境变量": "Service URL (OpenAI-compatible /v1 root) and key environment variable",
    "未探测到模型": "No models detected",
    "未激活根目录——请在「高级 · 根目录」区添加。": "No active root directory — add one in the “Advanced · Root directories” section.",
    "未配置时自动词法召回（可用但无语义）；配置后本页 provider 变就绪。": "When unconfigured, recall falls back to lexical automatically (usable but without semantics); once configured, the provider on this page becomes ready.",
    "本地保留（上限 500 条）": "Kept locally (max 500)",
    "本机 Ollama（零成本 · 免 key）": "Local Ollama (zero cost · no key)",
    "本机 arbiter（Laya / Jev 快模型）": "Local arbiter (Laya / Jev fast models)",
    "本机端点免 key；远端端点须另开出网许可（见下）。地址按**解析后的主机名**判是否本机——127.0.0.1.evil.com 这类伪造不会被当成本机。": "Local endpoints need no key; remote endpoints additionally require egress permission (see below). Whether an address is local is decided by the **parsed hostname** — look-alikes such as 127.0.0.1.evil.com are not treated as local.",
    "本机端点模型不在宿主目录里 —— 用「枚举模型」列出来，或直接手填模型名": 'Local endpoint models are not in the host catalog — use "List models", or type the model id directly',
    "本机（零成本 · 免 key）": "Local (zero cost · no key)",
    "本轮新增正文少于此值跳过蒸馏（水位仍推进；0=不设限，默认 200）": "Skip distillation when this turn\\'s new body text is below this value (the watermark still advances; 0 = no limit, default 200)",
    "本轮最少字符 minTurnChars": "Minimum chars this turn minTurnChars",
    "条": "items",
    "枚举中…": "Listing…",
    "枚举模型": "List models",
    "档位": "Level",
    "档位 evalTier": "Level (evalTier)",
    "档位（reasoning effort / 成本结构分档）": "Level (reasoning effort / cost tier)",
    "检索参数（名称 / 键名 / 说明）…": "Search parameters (name / key / description)…",
    "概览—详情分层": "Overview–detail layering",
    "模型": "Model",
    "模型名（如 qwen3.5:2b / jev-latest）": "Model id (e.g. qwen3.5:2b / jev-latest)",
    "模型名（如 qwen3.5:2b）": "Model id (e.g. qwen3.5:2b)",
    "次": "times",
    "每次成功写入后提交库快照（可 diff/revert；库在 ~/.dsh 下，不入公开树）。缺省开": "Commit a bank snapshot after every successful write (diff/revert; the bank lives under ~/.dsh and never enters the public tree). On by default",
    "每步一行写 suite/knowledge/audit/mcl-audit.jsonl（通道/熟悉度/注入/再引导/合规）": "Writes one line per step to suite/knowledge/audit/mcl-audit.jsonl (path/familiarity/injection/re-guidance/compliance)",
    "沿用模型默认": "Use the model's default",
    "注入参数（全局，写 ~/.dsh/suite/scheduler.json）与运行时通道。改动即时写回（scheduler.json 备份先行）。注入配置已迁全局，不再随 root 切换变化（root YAML 仅剩「配置原文」页可直接编辑）。": 'Injection parameters (global, written to ~/.dsh/suite/scheduler.json) and runtime channels. Changes are written back immediately (scheduler.json is backed up first). Injection config has moved to global scope and no longer changes with root switching (the root YAML only keeps the "raw config" page, which is still directly editable).',
    "注入时优先保留「最近新增条目」的槽位数（0–6，缺省 2）": 'Number of slots reserved at injection time for "most recently added items" (0–6, default 2)',
    "注入相关性重排 injectRelevance": "Injection relevance re-ranking injectRelevance",
    "活性 / 遗忘阈值（v7）": "Activity / forgetting thresholds (v7)",
    "活性降级 warm 阈值 activityWarmDays": "Activity demotion warm threshold activityWarmDays",
    "测试连通性": "Test connectivity",
    "深度睡眠阈值": "Deep sleep thresholds",
    "深度睡眠（离线回想提炼 [原则]/[路径] 画像成长）用的模型。继承=跟随主会话。": "The model used for deep sleep (offline recall that extracts [principle]/[path] profile growth). Inherit = follow the main session.",
    "深睡归纳模型": "Deep sleep summarization model",
    "深睡未消化策略": "Deep sleep unprocessed policy",
    "深睡未消化策略 deepSleep.failPolicy": "Deep sleep unprocessed policy deepSleep.failPolicy",
    "深睡每轮用 deepSleepLanded 判定本轮是否「已消化」。未消化时的两种取向在此切换——全重捞保证不丢料但可能无限重试；分级在连败达上限后放行并告警，避免无限重试烧 LLM。": 'Each deep sleep round uses deepSleepLanded to decide whether this round has been "processed". The two approaches for unprocessed rounds are switched here — full re-fetch guarantees nothing is lost but may retry forever; graded releases the watermark after the consecutive-failure limit and raises an alert, avoiding infinite retries burning LLM calls.',
    "添加并启用": "Add and enable",
    "添加根目录": "Add root directory",
    "清理中…": "Clearing…",
    "清空向量缓存并重建？换模型后必须执行（否则旧向量混用导致语义失真）。": "Clear the vector cache and rebuild? This is required after switching models (otherwise old and new vectors mix and distort semantics).",
    "清缓存重建": "Clear cache & rebuild",
    "点击「枚举模型」加载…": 'Click "List models" to load…',
    "热记忆注入强度 injection.level": "Hot-memory injection strength injection.level",
    "熟悉度": "Familiarity",
    "现有大模型": "Existing large model",
    "用户画像记忆库容量（字符）：": "User profile memory bank capacity (chars): ",
    "画像 persona 注入档位 injection.persona": "Profile persona injection level injection.persona",
    "界面偏好": "Interface preferences",
    "界面偏好与高级操作。配置原文（YAML）与行级编辑收在此处，配风险提示。": "Interface preferences and advanced operations. The raw configuration (YAML) and line-level editing live here, with risk warnings.",
    "界面皮肤": "UI skin",
    "界面设置已恢复默认": "UI settings restored to defaults",
    "留空=继承主会话模型": "Leave blank = inherit the main session model",
    "直接编辑 shoucang.config.yaml 全文。保存时原文件自动备份为 .bak-时间戳。": "Edit shoucang.config.yaml in full directly. On save the original file is automatically backed up as .bak-timestamp.",
    "知识索引记忆库容量（字符）：": "Knowledge index memory bank capacity (chars): ",
    "确认恢复全部界面设置为默认值？": "Restore all UI settings to their default values?",
    "秒": "sec",
    "空闲唤醒 idleWakeMs": "Idle wake-up idleWakeMs",
    "立即处理 pending 候选": "Process pending candidates now",
    "立即蒸馏一次": "Distill now",
    "端点与档位已设": "Endpoint and level saved",
    "紧凑": "Compact",
    "紧凑模式隐藏描述文字、压缩行高，提升信息密度。": "Compact mode hides description text and compresses row height to increase information density.",
    "绝对路径，须包含 shoucang.config.yaml": "Absolute path; must contain shoucang.config.yaml",
    "继承主会话": "Inherit the main session",
    "继承主会话（默认）": "Inherit the main session (default)",
    "继承主模型（默认）": "Inherit the main model (default)",
    "缓存 ": "Cache ",
    "缓存按 模型+行文本+地址 指纹命中；换模型/改云端后点「清缓存重建」，下次召回按新模型自动重嵌（当前 ": 'The cache is keyed by the model + line text + address fingerprint; after switching models or changing the cloud config, click "Clear cache & rebuild" and the next recall re-embeds automatically with the new model (currently ',
    "自定义 OpenAI 兼容（云端）": "Custom OpenAI-compatible (cloud)",
    "自定义（手填地址与模型名）": "Custom (type the URL and model id)",
    "自定义（手填模型名）": "Custom (type the model id)",
    "自建 bge-m3 桥（可选）": "Self-hosted bge-m3 bridge (optional)",
    "舒适": "Comfortable",
    "获取失败": "Fetch failed",
    "蒸馏 / 深睡模型": "Distillation / deep sleep models",
    "蒸馏与深度睡眠各自可选宿主模型（直接用 DeepSeek Harness 模型——先在 Harness 配置好模型，这里下拉选即可）。「继承主会话」= 不指定，跟随当前会话模型。档位（reasoning effort）由模型适配器声明，未声明则沿用模型默认。改动写 scheduler.json，需重载生效。": 'Distillation and deep sleep can each pick a host model (straight from the DeepSeek Harness model system — configure the model in Harness first, then select it here). "Inherit the main session" = unspecified, follow the current session model. The level (reasoning effort) is declared by the model adapter; if it declares none, the model default applies. Changes are written to scheduler.json and take effect after reloading.',
    "蒸馏中…（约 1-2 分钟）": "Distilling… (about 1-2 minutes)",
    "蒸馏未触发": "Distillation not triggered",
    "蒸馏模型": "Distillation model",
    "蒸馏节流（运行时通道）": "Distillation throttling (runtime channel)",
    "行级删除已执行（可能需同步索引）：": "Line-level deletion applied (index may need re-sync): ",
    "行级编辑已执行（可能需同步索引）：": "Line-level edit applied (index may need re-sync): ",
    "见下方「错误定位」": "See Error location below",
    "认知环审计流 mclAudit": "Cognition ring audit stream mclAudit",
    "认知环（MCL · 熟悉度分流 + 有界再引导）": "Cognition ring (MCL · familiarity routing + bounded re-guidance)",
    "记忆库 git 版本化 bankGit": "Memory bank git versioning bankGit",
    "记忆库尚无 git 快照（写入一次即出现）": "No git snapshot for the memory bank yet (one write and it appears)",
    "记忆条目活性状态机（active→warm→cold）与遗忘/加深候选的判定阈值，以及融合召回对 cold/retired 条目的降权系数。改动经 /set 即时写回 scheduler.json（与注入/蒸馏配置同通道，重载后按新阈值运行）。": "The memory entry activity state machine (active→warm→cold) and the thresholds for forgetting/deepening candidates, plus the downweight factor that fusion recall applies to cold/retired entries. Changes are written back immediately to scheduler.json via /set (same channel as injection/distillation config; the new thresholds take effect after reload).",
    "评估模型": "Evaluation model",
    "评估通道 关": "Evaluation channel off",
    "评估通道 开": "Evaluation channel on",
    "评估通道配置已设": "Evaluation channel configuration saved",
    "评估通道（可配置模型 · 按需开启）": "Evaluation channel (configurable model · opt-in)",
    "该模型未声明可选档位 —— 沿用模型默认": "This model declares no selectable level — use the model's default",
    "该通道未定义档位 —— 保持「不指定」": "This channel defines no level — keep it unspecified",
    "语义召回开关 embedEnabled": "Semantic recall switch embedEnabled",
    "语义召回（vec.ts + bge-m3）运行态与开关。改动写 ~/.dsh/suite/scheduler.json，**需重载插件后生效**。本地 GPU 零 token；换云端在下方填 baseUrl/model。": "Runtime state and switch for semantic recall (vec.ts + bge-m3). Changes are written to ~/.dsh/suite/scheduler.json and **take effect after reloading the plugin**. Local GPU costs zero tokens; to switch to the cloud, fill in baseUrl/model below.",
    "语义检索来源": "Semantic retrieval source",
    "请求总数": "Total requests",
    "请输入 vault 的绝对路径": "Enter the vault\\'s absolute path",
    "读取中…": "Loading…",
    "读取失败（/config/recent）": "Failed to load (/config/recent)",
    "超过该行数的列表默认折叠。": "Lists longer than this row count are collapsed by default.",
    "轮询间隔": "Polling interval",
    "轮询间隔（毫秒）": "Polling interval (ms)",
    "过滤日志面板显示的最低级别（全部 / 警告+ / 仅错误）。": "Minimum level shown in the log panel (all / warning+ / errors only).",
    "近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5，喂深睡归纳）": "Hits in the last 30 days ≥ this value → deepening candidate B (default 5; feeds deep sleep summarization)",
    "远程小快模型": "Remote small fast model",
    "连通性测试": "Connectivity test",
    "选择模型…": "Select a model…",
    "选服务 → 自动填地址 → 下方自动探测并列出可用模型（浏览器直连）。换服务/模型后请点「清缓存重建」。": 'Pick a service → the address is filled in automatically → availability is probed below and available models are listed (direct browser connection). After switching service/model, click "Clear cache & rebuild".',
    "通过": "passed",
    "通道已关闭——先打开上方开关并重载": "Channel is off — turn on the switch above and reload first",
    "遗忘候选 archive 阈值 activityArchiveDays": "Forgetting candidate archive threshold activityArchiveDays",
    "遗忘冷降 cold 阈值 activityColdDays": "Forgetting cold demotion threshold activityColdDays",
    "配置原文": "Raw config",
    "配置原文（shoucang.config.yaml）保存后自动备份 .bak-*；根目录切换与新增在此。": "The raw config (shoucang.config.yaml) is auto-backed up to .bak-* on save; switch or add root directories here.",
    "配置快照已导出": "Configuration snapshot exported",
    "配置文件尚无记录": "No config file changes recorded yet",
    "配置文件改动：": "Config file changes:",
    "重新探测": "Probe again",
    "重置 10 项界面偏好并立即重绘（密度 / 导航宽度 / 日志面板 / 轮询全部重新应用）": "Reset 10 UI preferences and redraw immediately (density / nav width / log panel / polling are all reapplied)",
    "链路与模型选择；本组改动写入自持配置，需重载插件后生效。": "Pipeline and model selection; changes in this group are written to the self-held config and take effect after reloading the plugin.",
    "错误": "Errors",
    "长列表折叠阈值": "Long-list fold threshold",
    "阈值加载失败：": "Failed to load thresholds:",
    "零成本预筛 distillPrescan": "Zero-cost prescan distillPrescan",
    "需 http(s):// 开头": "Must start with http(s)://",
    "需自备嵌入服务（OpenAI 兼容 /v1/embeddings）：Ollama（ollama pull bge-m3，:11434）或自建 bge-m3 桥（:9915）。当前检测不可达。": "You need your own embedding service (OpenAI-compatible /v1/embeddings): Ollama (ollama pull bge-m3, :11434) or a self-hosted bge-m3 bridge (:9915). Currently detected as unreachable.",
    "非失败请求占比": "Share of non-failed requests",
    "面板内": "In panel",
    "面板内可用": "Available in panel",
    "页脚健康条": "Footer health bar",
    "高级": "Advanced",
    "高级 · 配置原文与根目录": "Advanced · raw config and root directories",
    "高级项：蒸馏节流 / 召回与库版本 / 认知环；改后需重载生效。": "Advanced: distillation throttling / recall & bank version / cognition ring; changes take effect after reload.",
    "（不指定）": "(unspecified)",
    "（先选服务）": "(choose a service first)",
    "（删除 ": "(deleted ",
    "（即时）": "(immediate)",
    "（嵌入）": "(embedding)",
    "（无可枚举模型）": "(no enumerable models)",
    "（该 provider 未枚举到模型）": "(this provider listed no models)",
    "（连接失败）": "(connection failed)",
    "（重载后生效）": " (takes effect after reload)",
    "（重载生效）": " (takes effect on reload)",
    "（需重载插件生效）": "(requires reloading the plugin to take effect)",
    "（需重载生效）": "(takes effect on reload)",
    "；改动即时生效（缓存作废）": "; changes take effect immediately (cache invalidated)"
  };

  // src-client/i18n-dict-memory.js
  var EN2 = {
    "记忆库画像不可用": "Memory-bank profiles unavailable",
    "画像 · ": "Profiles · ",
    "小节不可用": "Section unavailable",
    "压缩画像": "Compact profiles",
    "压缩中…": "Compacting…",
    "压缩执行位：下方 USER.md 卡": "Compaction entry: the USER.md card below",
    "画像压缩（深度睡眠归纳）触发中…": "Profile compaction (deep-sleep distillation) in progress…",
    "画像压缩：触发一次深度睡眠归纳，由树整理把高分重复条目折叠为索引项（无独立端点）": "Profile compaction: triggers one deep-sleep distillation that folds high-score duplicate entries into index items (no dedicated endpoint)",
    "「压缩画像」= 触发一次深度睡眠归纳，由深睡树整理折叠高分重复条目。立即执行？": "Compact profiles = trigger one deep-sleep distillation that folds high-score duplicate entries into index items. Run now?",
    "✓ 已触发深睡归纳（高分重复条目将折叠为索引项）": "✓ Deep-sleep distillation triggered (high-score duplicate entries will be folded into index items)",
    "已触发归纳": "Distillation triggered",
    "进行中": "In progress",
    "USER.md（用户画像）与 AGENT.md（Agent 画像）的唯一展示位。": "The only place where USER.md (user profile) and AGENT.md (agent profile) are shown.",
    "成熟度分布": "Maturity distribution",
    "成熟度台账为空：库内 audit/maturation.jsonl 尚无记录（跑一次成熟度扫描即写入）。": "Maturity ledger is empty: no records in audit/maturation.jsonl yet (run a maturity scan to populate it).",
    "v4 新增 · 按 0.2 分档统计库内小节数": "New in v4 · counts library sections bucketed by 0.2",
    "口径：库内 audit/maturation.jsonl 按 A 值 0.2 分档的小节数。": "Definition: sections in the library bucketed by A value in 0.2 steps, from audit/maturation.jsonl.",
    "（升格线）才具备升格为 [原则] / [路径] 的稳定条件。": " (the promotion line) does a section become eligible for promotion to [principles] / [paths].",
    " —— [原则] / [路径] 行数在「总览 · 本月成长」按月跟踪。": " — [principles] / [paths] line counts are tracked monthly in Overview · This month's growth.",
    " —— 超过 80% 时在此显示一行提示；红线由 write_gate 写入时强制。": " — a notice line appears here once usage exceeds 80%; the hard limit is enforced by write_gate on write.",
    "注：容量百分比与容量条按 write_gate 的实际上限计算；指针行点击可直达 notes/ 对应小节。": "Note: capacity percentage and bar use write_gate's actual limit; clicking a pointer row jumps to the matching section under notes/.",
    "暂无容量门。": "No capacity gate yet.",
    "容量 ": "Capacity ",
    " 容量": " capacity",
    " 字符 · ": " chars · ",
    " 节": " section(s)",
    " 节：A ≥ ": " section(s): A ≥ ",
    " 构成": " composition",
    " 条指针": " pointer(s)",
    " 条画像": " profile(s)",
    " · 点击进详情": " · click for details",
    " 条索引行数据格式异常已跳过（期望 { tag, subject, pointer }）": " index row(s) skipped due to malformed data (expected { tag, subject, pointer })",
    "指针目标非 notes 白名单：": "Pointer target not in the notes whitelist: ",
    "该条目无 notes 跳转目标": "This entry has no notes jump target",
    "该指针命中 ": "This pointer matches ",
    " 个同名/包含小节，无法唯一定位（未展开）：": " same-named/containing sections; cannot locate uniquely (not expanded): ",
    "小节未找到（指针锚：": "Section not found (pointer anchor: ",
    "）——已显示整篇，未自动展开": ") — showing the full note without auto-expanding",
    "（暂无指针行）": "(no pointer rows yet)",
    "（暂无标签行）": "(no tag rows yet)",
    "标签未登记于映射表：": "Tag not in the label map: ",
    "（已按原样显示；请同步 tag-label.js）": " (shown verbatim; please sync tag-label.js)",
    "renderIndexRows：跳过 ": "renderIndexRows: skipping ",
    " 条格式异常索引行（期望 { tag, subject, pointer }）": " malformed index row(s) (expected { tag, subject, pointer })",
    "  原则 +": "  principles +",
    " · 剩余 ": " · ",
    " · 异常 ": " · failed ",
    " · 替换 ": " · replaced ",
    " · 画像 ": " · profile ",
    " · 画像 +": " · profiles +",
    " · 蒸馏 ": " · distillation ",
    " · 路径 ": " · paths ",
    " · 预筛跳过 ": " · prefiltered ",
    " 个小节（白名单只读）": " sections (whitelist, read-only)",
    " 个文件（forgetOps 产物，复制回 notes/ 即恢复）": " files (forgetOps output; copy back into notes/ to restore)",
    " 处引用": " references in total",
    " 字）": " chars)",
    " 条。": " items.",
    " 次": " times",
    " 正文已保存（write_gate 通过）": " body saved (write_gate passed)",
    " 正文（": " body (",
    " 类": " types",
    " 行": " rows",
    " 顶层小节（树状，点击逐层展开；编辑在节点细节）": " top-level sections (tree view, click to expand level by level; edit in the node details)",
    "/替换 ": "/replaced ",
    "AGENT 画像": "AGENT profile",
    "MEMORY.md 索引、候选、笔记与归档区，按「库 → 待消化 → 详情 → 已归档」的生命周期排序。": "MEMORY.md index, candidates, notes and archive, ordered by the life cycle “bank → pending digestion → details → archived”.",
    "cold 且 ≥90 天零命中": "cold and zero hits for ≥90 days",
    "h 有效": "h left",
    "notes 详情小节": "notes detail section",
    "notes/archive/ · 仅归档不删除": "notes/archive/ · archive only, never delete",
    "suite · flow-candidates": "suite · flow-candidates",
    "suite · knowledge/pending": "suite · knowledge/pending",
    "suite 知识区 · ": "suite knowledge area · ",
    "§ 名重叠 0.5–0.66": "§ name overlap 0.5–0.66",
    "… 共 ": "… ",
    "← 返回": "← Back",
    "⚠ 上次未完成（stop=": "⚠ Previous run incomplete (stop=",
    "✎ 编辑此小节": "✎ Edit this section",
    "✓ 已批准 ": "✓ Approved ",
    "下轮材料预估": "Next-round material estimate",
    "不可用": "unavailable",
    "主动遗忘只归档、不删除 —— applyForgetOps 禁直删，热节与画像节有守卫。": "Active forgetting only archives, never deletes — applyForgetOps forbids direct deletion, and hot sections and profile sections are guarded.",
    "候选区 · ": "Candidates · ",
    "记忆库 · pending": "Memory bank · pending",
    "（本根仅显示最近 ": " (this root shows only the latest ",
    "，不入册）": ", not filed)",
    "，内容由蒸馏正常入册）": ", content will be filed by distillation as usual)",
    "（移 ": " (moved to ",
    "共 ": "Total ",
    " 条（双根合并）": " items (both roots merged)",
    " 条，共 ": " items, ",
    " 条 · 批准=确认有价值入册（移 .processed），忽略=移出队列（移 .ignored，不入册）": " items · Approve = confirm it is worth filing (moves to .processed), Ignore = remove from the queue (moves to .ignored, not filed)",
    "忽略并移出候选队列（移入 .ignored，不入册）：": "Ignore and remove from the candidate queue (moves to .ignored, not filed):",
    "暂无候选（已查 记忆库 / suite / flow-candidates 三处）": "No candidates (checked all three: memory bank / suite / flow-candidates)",
    "习得 ": "Acquired ",
    "互抑候选": "Mutual-inhibition candidates",
    "保存中…": "Saving…",
    "保存正文": "Save body",
    "保留": "Kept",
    "候选区 ": "Candidates ",
    "写入由 write_gate 强制红线": "Writes are enforced by the write_gate red line",
    "加深候选": "Deepen candidates",
    "升格 / 降格走 /memory/approve，由 L0 判据裁决。索引行只读，正文编辑走 /memory/section-edit。": "Promotion / demotion goes through /memory/approve and is decided by the L0 criterion. Index rows are read-only; body edits go through /memory/section-edit.",
    "原则 ": "Principles ",
    "取消": "Cancel",
    "只有存在真实容量门的载体才给百分比与进度条：MEMORY.md（cap_memory）与画像（cap_user / cap_agent）；notes / pending 无容量门 ⇒ 只报绝对量。是否因超限**阻断**写入由「参数调节 → 记忆与容量」的容量门开关决定（缺省关闭 = 照写并留一条 capacity-over 留痕）。": "Only carriers with a real capacity gate get a percentage and progress bar: MEMORY.md (cap_memory) and profiles (cap_user / cap_agent); notes / pending have no capacity gate ⇒ absolute counts only. Whether over-limit writes are blocked is decided by the capacity-gate switch under Settings → Memory & Capacity (default OFF = write through and leave a capacity-over trace).",
    "如需恢复，把 notes/archive/ 下的文件移回 notes/ 即可（面板不提供写入口）。": "To restore, simply move the files under notes/archive/ back into notes/ (the panel provides no write entry point).",
    "守藏本地知识区 · suite/knowledge": "Shoucang local knowledge area · suite/knowledge",
    "守藏本地知识区未启用（suite/knowledge 不存在）": "Shoucang local knowledge area is not enabled (suite/knowledge does not exist)",
    "守藏知识区": "Shoucang knowledge area",
    "守藏蒸馏器事实源（ADR-0002）：MEMORY ": "Shoucang distiller source of truth (ADR-0002): MEMORY ",
    "容量占用": "Capacity usage",
    "展开全部 ": "Expand all ",
    "已忽略": "Ignored",
    "已忽略 ": "Ignored ",
    "归档": "Archived",
    "归档区": "Archive",
    "归档区 ": "Archive area ",
    "归档区 notes/archive/": "Archive area notes/archive/",
    "归档区 notes/archive/ · ": "Archive notes/archive/ · ",
    "归档区读取失败（/cognition/report）。": "Failed to read the archive area (/cognition/report).",
    "忽略": "Ignore",
    "忽略中…": "Ignoring…",
    "成功 ": "Succeeded ",
    "批准": "Approve",
    "指针更新": "Pointer updates",
    "新增原则": "Principles added",
    "无小节": "No sections",
    "暂无归档条目。": "No archived entries.",
    "替换原则": "Principles replaced",
    "最近成长 delta · 深睡产出": "Recent growth delta · deep sleep output",
    "本周成长 · 增量": "This week's growth · delta",
    "本月成长 · ": "This month's growth · ",
    "本月有效深睡产出": "Effective deep-sleep output this month",
    "本月深睡有运行但无产出（内容判据合规保守：材料不足宁缺毋滥）": "Deep sleep ran this month but produced nothing (the content criterion is conservatively compliant: with insufficient material, better nothing than noise)",
    "本次深睡归纳产出（48h 有效": "Output of this deep sleep synthesis (valid for 48h",
    "本轮产出回执": "Output receipt for this run",
    "树操作": "Tree operations",
    "正常": "Normal",
    "正文不能为空——如需清空请用删除": "The body cannot be empty — to clear it, use delete instead",
    "水位偏高": "Watermark high",
    "深睡归纳": "Deep sleep distillation",
    "深睡新习得": "Newly acquired in deep sleep",
    "点击展开/收起": "Click to expand/collapse",
    "点击行直达 notes 详情小节（只读）。": "Click a row to jump straight to the notes detail section (read-only).",
    "画像更新": "Profile updates",
    "画像板块": "Profile board",
    "知识索引 ": "Knowledge index ",
    "知识索引 MEMORY.md · ": "Knowledge index MEMORY.md · ",
    "笔记 ": "Notes ",
    "库内结构 · ": "Library structure · ",
    " 个顶层条目（内容 ": " top-level entries (content ",
    " · 工具态 ": " · tooling ",
    " · 产物 ": " · artifacts ",
    "内容": "Content",
    "工具态": "Tooling",
    "产物": "Artifacts",
    "（只报计数，不展开）：": " (counts only, not expanded): ",
    " 件": " files",
    "内容档（承载知识的板块）": "Content tier (boards that carry knowledge)",
    " 件 · ": " files · ",
    "文档": "Doc",
    "板块": "Board",
    "口径：目录为递归文件数；工具态档（.git/.obsidian/scripts 等）**只报文件数不报体量**（.git 递归可达数十 MB，会把「库有多大」这个读数污染）。枚举由后端 readdirSync 派生，未登记的新条目默认落内容档（宁可多报不静默丢）。": 'Measure: directories report recursive file counts; the tooling tier (.git/.obsidian/scripts etc.) reports file counts only (a recursive .git can reach tens of MB and would distort any "how big is the library" reading). Enumeration is derived server-side via readdirSync; unregistered new entries default to the content tier (better to over-report than to silently drop).',
    "统计": "Stats",
    "编辑 §": "Edit §",
    "蒸馏": "Distillation",
    "被引用 · ": "Referenced · ",
    "记忆 · MEMORY ": "Memory · MEMORY ",
    "记忆库不可用": "Memory bank unavailable",
    "过滤索引 / 候选 / 笔记…": "Filter index / candidates / notes…",
    "近 7 天 [原则]/[路径] 归纳": "[principle]/[path] synthesized in the last 7 days",
    "遗忘候选": "Forget candidates",
    "（子树）": "(subtree)",
    "（尚无深睡记录）": "(no deep-sleep records yet)",
    "（空小节）": "(empty section)",
    "）· 已在会话注入可见": ") · already visible in the session injection",
    "）——保留开头摘要行最佳；保存走写门（备份+容量红线），索引指针不变。": ") — keeping the opening summary line is best; saving goes through the write gate (backup + capacity red line), and the index pointer stays unchanged.",
    "）——按「深睡水位护栏」水位已回滚，同批痕迹下轮重试": ") — per the “deep-sleep watermark guard” the watermark was rolled back; this batch's traces will be retried next round"
  };

  // src-client/i18n-dict-nav.js
  var EN3 = {
    " 需要请求体（必填：": " requires a request body (required: ",
    "缺少必填字段：": "Missing required field(s): ",
    "执行中… ": "Running… ",
    "完成 ": " completed ",
    "完成": "Done",
    "已加载 ": "Loaded ",
    " 已发起": " started",
    "slots 服务缺失": "slots service missing",
    "守": "SC",
    "显示": "Show",
    "隐藏": "Hide",
    "日志面板已": "Log panel ",
    "打开面板": "Open panel",
    "打开守藏面板": "Open the Shoucang panel",
    "宿主设置里也能直接唤起守藏面板": "You can also open the Shoucang panel directly from host settings",
    "打开面板默认落地页（深链 > 上次视图 > 此项）": "Default landing page when the panel opens (deep link > last view > this)",
    "守藏面板的界面偏好（与面板内「设置」页同源，改后立即生效；保存在浏览器 localStorage）。": "UI preferences for the Shoucang panel (same source as the in-panel Settings page; take effect immediately; stored in browser localStorage).",
    "紧凑模式隐藏描述、压缩行高": "Compact mode hides descriptions and reduces row height",
    "面板左导航像素宽度（140–320）": "Panel left-nav width in pixels (140-320)",
    "毫秒；0 = 关闭轮询": "milliseconds; 0 = disable polling",
    "状态栏上方常驻日志（关闭即折叠成一行）": "Persistent log above the status bar (turning it off collapses it to one line)",
    "v9 = 方案调色板（默认）；宿生 = 跟随 DSH 主题令牌": "v9 = scheme palette (default); host = follow DSH theme tokens",
    "未激活根目录——请到「配置原文」页根目录区添加。": "No active root — add one in the Roots section of the Raw config page.",
    "注入参数已全局可用（scheduler.json）；root 未登记——「记忆板块显示」开关待登记后可用。": "Injection parameters are globally available (scheduler.json); no root registered — the memory-section switch becomes available after registration.",
    "注入热记忆总闸 hot_memory": "Hot-memory injection master switch hot_memory",
    "关=不注入 agent/用户画像与知识索引任何指针行": "off = inject no pointer lines from agent/user profiles or the knowledge index",
    "全局注入": "Global injection",
    "写门容量": "Write-gate capacity",
    "召回融合": "Recall fusion",
    "调度": "Scheduling",
    "注入选行": "Injection row selection",
    "库版本化": "Library versioning",
    "认知环": "Cognition loop",
    "契约预检未通过：": "Contract precheck failed: ",
    "（本地拦截，未发出请求）": " (blocked locally; request not sent)",
    "需重载": "Reload required",
    "即时": "Instant",
    "折叠收口失败：": "Collapse failed: ",
    /* U2（2026-09-26）删除：`组件库主题注入失败：` —— 该词条的**唯一调用点**是 body.js 中
     *   注入 Web Awesome 主题令牌层的 try/catch，而 U2 已删掉那整段（产物不再带组件库，省 574KB）
     *   ⇒ 词条成孤儿，由 `check-i18n-keys` 断言 A「死键」抓到。删除以恢复双向键集一致。 */
    "设置生效失败（": "Failed to apply setting (",
    "侧栏入口：已注册宿主插槽 sidebar.footer.action（不挂 DOM 直插入口）": "Sidebar entry: registered host slot sidebar.footer.action (no direct DOM entry)",
    "侧栏入口：宿主插槽不可用（": "Sidebar entry: host slot unavailable (",
    "require('react') 不可用": "require('react') unavailable",
    "），回退 DOM 直插": "); falling back to direct DOM insertion",
    "关": "Off",
    "参数": "Parameters",
    "守藏": "Shoucang",
    "守藏 SHOUCANG": "Shoucang",
    "守藏记忆面板": "Shoucang memory panel",
    "守藏面板": "Shoucang panel",
    "展开": "Expand",
    "已重新取数": "Data reloaded",
    "总览": "Overview",
    "插件集合": "Plugins",
    "收起 ▴": "Collapse ▴",
    "架构": "Architecture",
    "深度睡眠": "Deep sleep",
    "画像": "Profiles",
    "记忆": "Memory",
    "记忆库": "Memory bank",
    "设置": "Settings",
    "过滤": "Filter",
    "过滤…": "Filtering…",
    "运行": "Runtime",
    "运行总览": "Overview",
    "运行观测": "Observability",
    "配置": "Configuration",
    "重新取数并重绘本页": "Reload data and redraw this page",
    "（无内容）": "(no content)"
  };

  // src-client/i18n-dict-pane-arch.js
  var EN4 = {
    " + 锚 ": " + anchors ",
    " · **分歧 ": " · **divergent ",
    " · 可还原 ": " · recoverable ",
    " · 当前": " · current",
    " · 成熟度就绪=": " · maturity ready=",
    " · 末次 ": " · last ",
    " · 解析出的会话 = ": " · resolved session = ",
    " · 闭合=": " · closed=",
    " ✓（三条桥已退役）": " ✓ (all three bridges retired)",
    " 分": " min",
    " 分钟": " min",
    " 取数失败（端点不可达）": " fetch failed (endpoint unreachable)",
    " 天 ": " d ",
    " 字符": " chars",
    " 小时": " h",
    " 小时 ": " h ",
    " 新架构模块在": " new-architecture modules present in",
    " 条": " items",
    " 条]": " items]",
    " 条在册": " items registered",
    " 条）": " items)",
    " 桥": " bridges",
    " 次 · 可还原 / 分歧": " runs · recoverable / divergent",
    " 秒": " sec",
    " 载体一致": " carriers consistent",
    " 键}": " keys}",
    "REM 相 enableRemPass": "REM phase enableRemPass",
    "audit 目录实况": "audit directory actuals",
    "dual（md ↔ Record 双写）": "dual (md ↔ Record dual-write)",
    "legacy 流（已并入台账，仅存历史）": "legacy stream (merged into the ledger, history only)",
    "lib 文件数": "lib file count",
    "md = 只写 md 投影；dual = md ↔ Record 双写（写时自证：可还原 / 分歧）。": "md = write the md projection only; dual = md ↔ Record dual-write (self-attested on write: recoverable / divergent).",
    "md ↔ store 逐件": "md ↔ store, item by item",
    "md ↔ store 逐件一致": "md ↔ store item-by-item consistent",
    "md↔store 对账": "md↔store reconciliation",
    "md（只用 md 投影）": "md (md projection only)",
    "suite 装配矩阵": "suite assembly matrix",
    "suite 装配矩阵由 targets.ts 的 suiteAssemblyMatrix() 单一实现；面板与 scheduler 共用。": "The suite assembly matrix has a single implementation, suiteAssemblyMatrix() in targets.ts; the panel and scheduler share it.",
    "systemPrompt 段（P2b 开）": "systemPrompt segment (P2b on)",
    "… 另有 ": "… and ",
    "⚠ storeMode 写入失败（枚举或白名单拒绝）": "⚠ storeMode write failed (rejected by enum or whitelist)",
    "⚠ 未生效": "⚠ Not in effect",
    "⚠ 架构视图渲染失败：": "⚠ Architecture view failed to render: ",
    "⚠ 检测到疑似卡住的会话（无输出增长但会话仍在）：已正常计入停滞并安排睡眠，但建议你确认该任务是否真的卡住——必要时手动重启该会话。": "⚠ Possible stuck session detected (no output growth but the session is still alive): it has been counted as stalled as usual and sleep has been scheduled, but you should confirm whether the task is really stuck — restart that session manually if needed.",
    "⚠ 触发失败：": "⚠ Trigger failed: ",
    "✓ 已触发归纳（见日志）": "✓ Induction triggered (see log)",
    "✓ 自检完成：": "✓ Self-check complete: ",
    "一键回滚开关": "One-click rollback switch",
    "上次结果读 selfcheck-latest.json（GET）；执行走 POST": "Read the last result from selfcheck-latest.json (GET); run it via POST",
    "不限": "Unlimited",
    "于 ": "at ",
    "五环 KPI 与环事件对账": "Five-ring KPI and ring-event reconciliation",
    "五环 KPI 与环事件对账 + 统一台账按 type 分布（缺 `at` 行数 = 信封完整性）。": "Five-ring KPIs reconciled against ring events + unified ledger distribution by type (rows missing `at` = envelope completeness).",
    "仅窄动作且可回滚；改 α/gate/判据 一律只建议": "Narrow, rollback-safe actions only; changes to α/gate/criterion are suggestions only",
    "从未": "Never",
    "便签": "Notes",
    "停滞": "Stalled",
    "待蒸馏": "Pending distill",
    "全部根会话停滞 ≥ 阈值后自动回想当天记忆、提炼原则层 PRINCIPLES.md。状态机区分「正常长任务 / 卡住 / 异常退出」：仅长任务正在推进才拦睡，其余正常睡。": `Once all root sessions have been stalled ≥ the threshold, recall the day's memories and distill the principle layer PRINCIPLES.md. The state machine distinguishes "healthy long task / stuck / abnormal exit": sleep is blocked only while a long task is actually progressing; otherwise it sleeps normally.`,
    "六项检测": "Six checks",
    "内容环": "Content rings",
    "内容环与台账": "Content rings and ledger",
    "再引导上限": "Re-guidance limit",
    "再引导上限 mclMaxNudges": "Re-nudge cap mclMaxNudges",
    "写 ": "Written ",
    "写时自证": "Write-time self-verification",
    "写统一台账（type=mcl*）": "Write to the unified ledger (type=mcl*)",
    "刷新": "Refresh",
    "加载失败：": "Load failed:",
    "单一实现：targets.ts · suiteAssemblyMatrix()": "Single implementation: targets.ts · suiteAssemblyMatrix()",
    "原则 + 路径": "Principles + paths",
    "原始 JSON": "Raw JSON",
    "去调参": "Go to parameter tuning",
    "取数中…": "Fetching…",
    "取数失败（端点不可达或返回非 JSON）": "Fetch failed (endpoint unreachable or returned non-JSON)",
    "口径（族 × 域）": "Breakdown (family × domain)",
    "可还原 / 分歧": "Verifiable / diverged",
    "台账行数": "Ledger rows",
    "台账路径": "Ledger path",
    "否": "No",
    "域：": "Domain:",
    "契约路由数": "Contract route count",
    "存储模式": "Storage mode",
    "存储模式 storeMode": "Storage mode storeMode",
    "定时器/深睡后会自动执行": "Runs automatically on the timer / after deep sleep",
    "审计流 mclAudit": "Audit stream mclAudit",
    "容量": "Capacity",
    "尚未跑过": "Not run yet",
    "已切到「观测」": 'Switched to "Observability"',
    "已切到「认知环旋钮」": 'Switched to "Cognition ring knobs"',
    "已刷新": "Refreshed",
    "已按注入器 registry + profiles 重新核装配": "Assembly re-checked against the injector registry + profiles",
    "已用": "Used",
    "已装配": "Assembled",
    "开 = 材料挂注入面、不进转录（实测 `sysBlockNonEmpty` 会涨）；关 = 走消息面（送达有据）": "On = material attached to the injection surface, not in the transcript (measured: `sysBlockNonEmpty` rises); off = goes through the message surface (delivery is evidenced)",
    "影子 flipReady=": "Shadow flipReady=",
    "悬空证据": "Dangling evidence",
    "惰性桥 / 新架构模块": "Lazy bridges / new architecture modules",
    "惰性桥边数": "Lazy bridge edge count",
    "慢通道未引用材料时的再引导次数（0 = 只注入不引导；缺省 ": "Re-guidance attempts when the slow path does not cite the material (0 = inject without guidance; default ",
    "慢通道材料硬预算（字符；缺省 ": "Slow-path material hard budget (characters; default ",
    "慢通道注入的指针条数（缺省 ": "Number of pointers injected by the slow path (default ",
    "指针条数": "Pointer count",
    "指针条数 mclTopK": "Pointer count mclTopK",
    "按 type 分布": "Distribution by type",
    "探针（定位 P2b 用）：宿主传入 context 键 = ": "Probe (for locating P2b): context key passed in by the host = ",
    "插件版本": "Plugin version",
    "断言图（关系即事实）": "Assertion graph (relations are facts)",
    "族：": "Family:",
    "无": "None",
    "无标签 ": "Untagged ",
    "无标签待归类": "Untagged, awaiting classification",
    "无（除索引/详情同名标题这类结构性重名）": "None (apart from structural duplicates such as index/detail titles sharing a name)",
    "时序轨迹（cap 捕获 · set 写材料 · ren 渲染）": "Timeline (cap capture · set writes material · ren render)",
    "是": "Yes",
    "最近会话": "Recent sessions",
    "未装配": "Not assembled",
    "末次": "Last",
    "权威：": "Authority:",
    "材料入 systemPrompt 段（P2b）": "Material into the systemPrompt segment (P2b)",
    "材料去向": "Material destination",
    "材料送达计数": "Material delivery counts",
    "材料预算": "Material budget",
    "材料预算 mclBudgetChars": "Material budget mclBudgetChars",
    "活跃 / 失效": "Active / stale",
    "消息面": "message surface",
    "深度睡眠 · 会话状态机": "Deep sleep · session state machine",
    "深度睡眠归纳中…": "Deep sleep induction in progress…",
    "深度睡眠归纳器当前未激活（蒸馏器 enableDistill 未启用或尚未就绪）。": "The deep sleep inductor is currently inactive (the distiller's enableDistill is off or not yet ready).",
    "深睡同 pass 内做跨主题联想（缺省关；产物会并入画像，噪声代价高）": "Cross-topic association within the same deep-sleep pass (off by default; output merges into profiles, and the noise cost is high)",
    "添加目标库": "Add target bank",
    "熟悉度阈值": "Familiarity threshold",
    "熟悉度阈值 / 再引导上限 / 材料预算 / topK / 材料去向（P2b）/ REM —— 白名单补丁写 scheduler.json。": "Familiarity threshold / re-nudge cap / material budget / topK / material destination (P2b) / REM — whitelist patches are written to scheduler.json.",
    "熟悉度阈值 mclFamiliarThreshold": "Familiarity threshold mclFamiliarThreshold",
    "状态": "Status",
    "画像 + 偏好": "Profile + preferences",
    "白名单补丁写 `scheduler.json`；**重载后生效**。当前运行态：": "Whitelist patches are written to `scheduler.json`; **effective after reload**. Current runtime:",
    "白名单调整": "Whitelist adjustments",
    "目标库": "Target bank",
    "看观测": "View observability",
    "睡眠期自检（判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账）": "Sleep self-check (criterion gate / carrier gate / layering / maturity / shadow / reconciliation)",
    "经验 + 反例": "Lessons + counterexamples",
    "绝对余弦口径；≥ 阈值且命中高置信标签才走快通道（缺省 ": "Absolute cosine basis; the fast path is taken only when ≥ threshold and a high-confidence tag hits (default ",
    "统一台账与观测面": "Unified ledger and observability surface",
    "缺 at 行（信封完整性）": "Missing at field (envelope integrity)",
    "自检完成": "Self-check complete",
    "节点": "Nodes",
    "裁决": "Verdict",
    "装配": "Assembly",
    "装配内容": "Assembled content",
    "装配根（composition root）与已装能力": "Composition root and installed capabilities",
    "装配面": "Assembly surface",
    "观测": "Observability",
    "认知环开关 mclEnabled": "Cognition ring switch mclEnabled",
    "认知环旋钮": "Cognition ring knobs",
    "认知环（MCL）旋钮": "Cognition ring (MCL) knobs",
    "记录与图": "Records & graph",
    "记录层（Record 事实源）": "Record layer (Record source of truth)",
    "记录数": "Records",
    "记忆记录": "Memory records",
    "读取中…若长期如此说明 /arch/assembly 端点不可达": "Loading… if this persists, the /arch/assembly endpoint is unreachable",
    "读取中…若长期如此说明 /arch/observability 端点不可达": "Loading… if this persists, the /arch/observability endpoint is unreachable",
    "读取中…若长期如此说明 /arch/records · /arch/graph 端点不可达": "Loading… if this persists, the /arch/records · /arch/graph endpoints are unreachable",
    "读取中…若长期如此说明 /mcl/config 端点不可达": "Loading… if this persists, the /mcl/config endpoint is unreachable",
    "读取中…若长期如此说明 /rings 端点不可达": "Loading… if this persists, the /rings endpoint is unreachable",
    "超阈": "Over threshold",
    "跨文件逐字节同文（只报告不删——内容属用户）": "Byte-identical text across files (report only, never delete — the content belongs to the user)",
    "载体对账": "Carrier reconciliation",
    "载体逐件对账": "Carrier item-by-item reconciliation",
    "边": "Edges",
    "运行态通道计数": "Runtime channel counts",
    "重取架构快照": "Reload architecture snapshot",
    "重取装配矩阵（/suite）": "Re-fetch assembly matrix (/suite)",
    "重新拉取记录层 / 断言图 / 观测 / 装配四个只读端点（各页签同时刷新）。": "Re-fetch the four read-only endpoints — record layer / assertion graph / observability / assembly (all tabs refresh together).",
    "重新装配": "Re-assemble",
    "重构后新增模块（装上去的那份是否带着）": "Modules added by the refactor (does the installed copy carry them?)",
    "重构后的事实面与旋钮：内容环 KPI · 记录层对账与自证 · 统一台账与 legacy 流 · 装配根就绪度 · 断言图 · 认知环参数。数据全部来自只读端点，唯一写入口是认知环旋钮（白名单补丁）。": "The post-refactor fact surface and knobs: content-ring KPIs · record-layer reconciliation and self-verification · unified ledger and legacy stream · assembly-root readiness · assertion graph · cognition-ring parameters. All data comes from read-only endpoints; the only write entry point is the cognition ring knobs (whitelist patches).",
    "需在白名单内登记（target-registry / members 配置）": "Must be registered in the whitelist (target-registry / members config)",
    "（suite 域事件流目标 = ": "(suite domain event-stream target = ",
    "（已写 scheduler.json）": "(written to scheduler.json)",
    "（已写入 scheduler.json，重载后生效）": "(written to scheduler.json, effective after reload)",
    "（按持久配置）": "(per persisted config)",
    "（无容量注册表数据）": "(no capacity registry data)",
    "（空）": "(empty)",
    "（记录 ": "(records ",
    "）。数据提示：本库 936 步实测 86% 的步**无召回命中**——先查召回，再调此值。": "). Data note: in this bank, across 936 measured steps 86% had **no recall hit** — check recall before tuning this value."
  };

  // src-client/i18n-dict-pane-run.js
  var EN5 = {
    " / 写事件 ": " / write events ",
    " / 记忆面 ": " / memory-side ",
    " · 尝试 ": " · attempts ",
    " · 已关闭": " · disabled",
    " · 已启用": " · enabled",
    " · 归档 ": " · archived ",
    " · 指针 ": " · pointers ",
    " · 最近 ": " · latest ",
    " · 本月停产（口径）": " · halted this month (per policy)",
    " · 行数门": " · row-count gate",
    " 个": " sessions",
    " 个模型": " models",
    " 个模型 · ": " models · ",
    " 分钟 · ": " minutes · ",
    " 分钟前": " minutes ago",
    " 天前": " days ago",
    " 小时前": " hours ago",
    " 提交": " commits",
    " 期 · 最近 ": " reports · latest ",
    " 条 · 召回面 ": " · recall-side ",
    " 条 · 异常 ": " items · anomalies ",
    " 条待裁决": " items pending verdict",
    " 条日志）": " log entries)",
    " 段": " sections",
    " 行 · 写事件 ": " rows · write events ",
    " 轮 · 深睡轮次 ": " rounds · deep sleep rounds ",
    " 达 ": " reached ",
    " 项待处理": " items pending",
    "/慢": "/slow",
    "/档）· R=任务门控 · E=相关性门控": "/tier) · R=task-gated · E=relevance-gated",
    "24h 内新增 ": "Added in 24h ",
    "MCL 认知环": "MCL cognition ring",
    "P=恒常（索引+P 层画像行 ≤": "P=constant (index + P-tier profile rows ≤",
    "POST /embed/test —— 验证当前 embedding 配置是否可用": "POST /embed/test — verify whether the current embedding configuration works",
    "POST /embed/test —— 验证当前 embedding 配置是否可用（配完即可验证，不必等实际调用失败）。": "POST /embed/test — verifies whether the current embedding configuration works (verify right after configuring; you need not wait for a real call to fail).",
    "POST /eval/test —— 验证评估通道是否可用（默认关闭；本机端点免 key，远端端点须另开出网许可）。": "POST /eval/test — verifies whether the evaluation channel works (off by default; local endpoints need no key, remote endpoints require a separate egress permission).",
    "GET /eval/stats —— 折统一台账 type=eval.decision：分态分布 / 来源 / 真出机次数 / 回落次数。": "GET /eval/stats — aggregates ledger rows of type=eval.decision: outcome distribution, sources, real egress count, fallback count.",
    "POST /maturation/scan —— 重算库内小节成熟度并覆盖台账（只写台账，不改记忆内容）": "POST /maturation/scan — recompute section maturity in the memory bank and overwrite the ledger (writes the ledger only, does not change memory content)",
    "POST /reconcile —— 记忆库对账（只读汇总）": "POST /reconcile — memory bank reconciliation (read-only summary)",
    "POST /root/bootstrap —— 初始化/修复记忆根目录结构。": "POST /root/bootstrap — initializes/repairs the memory root directory structure.",
    "isWritable 白名单内的记忆文件。": "A memory file on the isWritable whitelist.",
    "memory-reconcile.mjs 未部署": "memory-reconcile.mjs is not deployed",
    "notes 告警阈值": "notes alert threshold",
    "⚠ 有差异": "⚠ Differences found",
    "⚠ 行级直接改写记忆文件。改索引行可能导致指针与 notes 正文不一致（详见 R3），常规编辑请用「记忆板块 → 小节编辑」。": '⚠ Directly rewrites memory files at the line level. Changing index rows can make pointers inconsistent with the notes body (see R3 for details); for routine edits use "Memory board → Section edit".',
    "✅ 差异 0": "✅ 0 differences",
    "✓ 可达 · ": "✓ Reachable · ",
    "✓ 对账完成": "✓ Reconciliation complete",
    "✓ 已删除该行": "✓ Line deleted",
    "✓ 已改写该行": "✓ Line rewritten",
    "✓ 已触发深睡归纳（后台执行，回执见「深度睡眠」）": "✓ Deep sleep induction triggered (runs in the background; see 「Deep sleep」 for the receipt)",
    "✓ 扫描完成（分档已写入 audit/maturation.jsonl）": "✓ Scan complete (tiers written to audit/maturation.jsonl)",
    "✓ 自检已执行，结果见「运行观测」": "✓ Self-check executed; see 「Run observation」 for the results",
    "✓ 观测数据已导出（": "✓ Observation data exported (",
    "✗ 文件 / 原始行 / 新行 三项均必填": "✗ File / original line / new line are all required",
    "✗ 文件与原始行必填": "✗ File and original line are required",
    "✗ 未配置 embedBaseUrl（且缺省不可用）": "✗ embedBaseUrl not configured (and the default is unavailable)",
    "✗ 未配置 embedBaseUrl，请先到「参数调节」填写。": '✗ embedBaseUrl is not configured; fill it in under "Parameters" first.',
    "一屏回答「现在怎么样」。徽章行 = 原记忆板块 §0 的 7 枚状态徽章，整体提升为独立首屏。": 'Answers "how are things now" on one screen. The badge row = the 7 status badges from §0 of the original memory section, promoted in full to a standalone first screen.',
    "三层占比": "Three-tier share",
    "上次有效深睡": "Last effective deep sleep",
    "下次可睡 ": "Next sleep in ",
    "下载当前日志/错误/指标（JSON）": "Download the current logs/errors/metrics (JSON)",
    "不可读": "Unreadable",
    "习得原则 ": "Principles acquired ",
    "仅错误": "Errors only",
    "保留 ": "kept ",
    "候选 ": "Candidates ",
    "候选 …": "Candidates …",
    "候选待裁决 · ": "Candidates pending verdict · ",
    "健康度 health.R / K 与 caps 由 criteria-gate.json 提供；本卡只读。": "Health health.R / K and caps come from criteria-gate.json; this card is read-only.",
    "全部": "All",
    "关键指标": "Key metrics",
    "写入被拒率": "Write rejection rate",
    "分母 影响账 ": "denominator: impact ledger ",
    "刚刚": "Just now",
    "判据与重排门": "Criteria & reorder gate",
    "判据台账 · ": "Criteria ledger · ",
    "判据台账 …": "Criteria ledger …",
    "判据台账读取失败（GET /criteria）。": "Failed to read the criteria ledger (GET /criteria).",
    "判据版本": "Criteria version",
    "前往处理": "Go to handle",
    "压缩": "Compaction",
    "原始行": "Original line",
    "可回看": "viewable",
    "可达": "Reachable",
    "台账 ": "Ledger ",
    "向量 ": "Vector ",
    "向量 …": "Vector …",
    "向量 未启用": "Vector not enabled",
    "向量档": "Vector store",
    "堆栈": "Stack",
    "失败": "Failed",
    "失败：": "Failed: ",
    "容量预警 · ": "Capacity warning · ",
    "对账": "Reconciliation",
    "对账中…": "Reconciling…",
    "导出": "Export",
    "尚无汇报": "no report yet",
    "尚无蒸馏事件": "No distillation events yet",
    "尚未产出睡眠汇报（深睡轮跑完才有）。": "No sleep report yet (produced after a deep-sleep round).",
    "嵌入服务": "Embedding service",
    "嵌入服务不可达，向量召回已降级为词法": "Embedding service unreachable; vector recall has degraded to lexical",
    "嵌入服务连通性": "Embedding service connectivity",
    "评估通道连通性": "Evaluation channel connectivity",
    "尚无判定记录（通道未开启或未跑过）": "No decisions recorded yet (channel is off or has never run)",
    "统计中…": "Collecting…",
    "统计完成": "Stats collected",
    "未统计": "Not collected",
    "刷新统计": "Refresh stats",
    "评估通道统计": "Evaluation channel stats",
    "评估通道": "Evaluation channel",
    "评估通道连通性测试完成": "Evaluation channel connectivity test complete",
    "评估通道连通性测试": "Evaluation channel connectivity test",
    "通道已关闭（缺省）。到「参数调节」开启 evalEnabled 后再测。": "Channel is off (default). Enable evalEnabled in Parameters before testing.",
    "（已允许出网）": " (egress allowed)",
    "嵌入连通性": "Embedding connectivity",
    "嵌入连通性测试完成": "Embedding connectivity test complete",
    "已启用": "Enabled",
    "已就绪": "Ready",
    "已清空日志与错误记录": "Logs and error records cleared",
    "已激活": "Active",
    "已达": "Reached",
    "库版本": "Bank version",
    "库版本 · ": "Bank version · ",
    "库版本 …": "Bank version …",
    "库版本 读取失败": "Failed to read the bank version",
    "当前无进行中的任务。": "No task in progress.",
    "当前根目录": "Current root",
    "待匹配的原始行文本": "Original line text to match",
    "待命中": "Standing by",
    "待处理": "Pending",
    "待归档会话 ": "Pending archive: ",
    "必须与原文件中的一行完全一致（后端按行匹配）。": "Must match one line in the original file exactly (the backend matches by line).",
    "快": "Fast",
    "快捷操作": "Quick actions",
    "快通道": "Fast path",
    "慢通道": "Slow path",
    "成熟度扫描": "Maturity scan",
    "成熟度扫描完成": "Maturity scan complete",
    "执行中…": "Running…",
    "执行引导": "Run bootstrap",
    "执行根目录引导会尝试创建缺失的目录结构，确认继续？": "Root bootstrap will try to create any missing directory structure. Continue?",
    "执行进度": "Execution progress",
    "执行进度、调用日志、错误定位与关键指标。日志保留最近 500 条，错误带端点/参数/堆栈，便于定位而非只剩一行提示。": "Execution progress, call log, error triage and key metrics. The log keeps the latest 500 entries, and errors carry endpoint/parameters/stack so you can locate them instead of being left with a single-line notice.",
    "扫描中…": "Scanning…",
    "拒 ": "Rejected ",
    "按水位触发": "Triggered by watermark",
    "按行删除": "Delete by line",
    "按行编辑": "Edit by line",
    "提交中…": "Submitting…",
    "提存": "Admitted",
    "文件，如 MEMORY.md / notes/lessons.md": "file, e.g. MEMORY.md / notes/lessons.md",
    "新增 ": "added ",
    "新行": "New line",
    "新行文本": "New line text",
    "新行文本（仅编辑需要）": "New line text (needed for edit only)",
    "日志": "Logs",
    "日志级别": "Log level",
    "暂无动态。": "No activity yet.",
    "暂无指标（切换各视图会自动采集）。": "No metrics yet (switching views collects them automatically).",
    "暂无错误。": "No errors.",
    "最近 24 小时": "Last 24 hours",
    "最近几期": "Recent reports",
    "最近动态": "Recent activity",
    "未初始化": "Not initialized",
    "未启用": "Disabled",
    "未处理 ": "open ",
    "未就绪": "Not ready",
    "未执行": "Not run",
    "未测试": "Untested",
    "未激活": "Inactive",
    "未生成": "Not generated",
    "未触发：根会话活跃中会跳过，等闲置自动跑": "Not triggered: active root sessions are skipped; it runs automatically once idle",
    "未达": "Not reached",
    "本月": "This month",
    "本月成长": "Growth this month",
    "本次会话 ": "This session ",
    "本次会话的深睡 / 蒸馏进度": "Deep sleep / distillation progress for this session",
    "本轮蒸馏事件": "Distillation events this round",
    "本轮蒸馏事件 · ": "Distillation events this round · ",
    "树 ": "tree ",
    "校验判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账六项；超时上限 180s。": "Checks six items: criteria gate / carrier gate / layering / maturity / shadow / reconciliation; timeout cap 180s.",
    "样本不足": "Insufficient samples",
    "根目录引导": "Root bootstrap",
    "根目录引导完成": "Root bootstrap complete",
    "注入统计": "Injection stats",
    "恒定面通道": "Stable-face channel",
    /* S3 额度夹取可见化（2026-09-22）：`supplyUsage.budgetClamped` 的面板面。
     * 判因：夹取此前只写进账、**无渲染** ⇒ 用户设了越界值仍以为生效（"不静默"只做了一半）。 */
    "额度夹取": "Budget clamped",
    "（你设的值越界 ⇒ 已按范围夹回，未采原值）": "(your value was out of range ⇒ clamped back, the original was not used)",
    "已夹取": "Clamped",
    "已挂 section · 节点0豁免": "section mounted · node 0 exempt",
    "未挂载 ⇒ 随 context 注入（可压区）": "not mounted ⇒ injects via context (compressible)",
    " · 原因：": " · reason: ",
    "睡眠汇报": "Sleep report",
    "睡眠汇报读取失败（/sleep/reports）。": "Failed to read the sleep report (/sleep/reports).",
    "豁免": "Exempt",
    "可压": "Compressible",
    "浅睡": "Light sleep",
    "测试中…": "Testing…",
    "测试中… ": "Testing… ",
    "测试嵌入连通": "Test embedding connectivity",
    "测试连接": "Test connection",
    "深度睡眠整理 · 本月 ": "Deep sleep consolidation · This month ",
    "深睡": "Deep sleep",
    "深睡整理中": "Deep sleep consolidation in progress",
    "清空": "Clear",
    "清空日志": "Clear logs",
    "清空错误": "Clear errors",
    "熟悉度 ": "Familiarity ",
    "现状已有 · 仅改归属": "Already present · ownership change only",
    "目标文件": "Target file",
    "确认执行行级删除？": "Run the line-level delete?",
    "确认清空全部日志与错误记录？": "Clear all logs and error records?",
    "确认清空错误记录？": "Clear error records?",
    "离线回想，提炼「[原则]/[路径]」并做结构整理与归档（禁直删）。预计 1–3 分钟。": "Offline recall: extract 「[principle]/[path]」, then restructure and archive (direct deletion prohibited). Estimated 1–3 minutes.",
    "空闲 ": "Idle ",
    "立即蒸馏": "Distill now",
    "立即触发一次深度睡眠归纳？将调用归纳子代理回顾当天记忆痕迹。": "Trigger one deep sleep distillation now? It will invoke the distillation subagent to review the day's memory traces.",
    "立即跑一次运行自检？执行期间请勿关闭面板。": "Run a self-check now? Do not close the panel while it runs.",
    "立即进入深睡": "Enter deep sleep now",
    "端点": "Endpoint",
    "系统状态": "System status",
    "累计入库 ": "Total stored ",
    "红线由 write_gate 写入时强制；建议在下一次深睡中执行画像压缩": "The red line is enforced by write_gate at write time; consider running profile compression in the next deep sleep",
    "编辑时必填；删除时忽略。": "Required when editing; ignored when deleting.",
    "自检": "Self-check",
    "自检中…": "Self-checking…",
    "蒸馏 · ": "Distillation · ",
    "蒸馏 …": "Distillation …",
    "蒸馏中…": "Distilling…",
    "蒸馏完成": "Distillation complete",
    "蒸馏完成 · 本月 ": "Distillation complete · This month ",
    "蒸馏执行位：下方操作卡（本页仅一处）": "Distillation control: the action card below (the only one on this page)",
    "蒸馏水位": "Distillation watermark",
    "行 · ": " rows · ",
    "行级删除": "Line-level delete",
    "行级编辑": "Line-level edit",
    "警告+": "Warning+",
    "认知环 ": "Cognition ring ",
    "认知环 …": "Cognition ring …",
    "认知环 读取失败": "Failed to read the cognition ring",
    "记忆库 · ": "Memory bank · ",
    "记忆库 …": "Memory bank …",
    "记忆库容量": "Memory bank capacity",
    "记忆文件": "Memory file",
    "词法召回兜底": "Lexical recall fallback",
    "读取中": "Loading",
    "读取失败": "Read failed",
    "读取配置…": "Loading config…",
    "调用日志 ": "Call log ",
    "账本对账": "Ledger reconciliation",
    "账本对账与产出健康（v2.1 M3）": "Ledger reconciliation and output health (v2.1 M3)",
    "账本对账完成": "Ledger reconciliation complete",
    "账本闭合": "Ledger closed",
    "运维操作": "Maintenance operations",
    "运行自检": "Run self-check",
    "连续空转 ": "Consecutive idle rounds ",
    "遍历根会话蒸馏，携带 pending 候选回流；等价于等会话空闲自动触发。": "Distill by traversing root sessions, carrying pending candidates back into the flow; equivalent to waiting for sessions to go idle and triggering automatically.",
    "重排门": "Reorder gate",
    "错误定位 ": "Error triage ",
    "问题": "Issues",
    "阈值 80%": "Threshold 80%",
    "高级：行级编辑 / 删除（谨慎）": "Advanced: line-level edit / delete (use with care)",
    "（已落盘）": " (saved to disk)",
    "（无）": "(none)",
    "（缺省在用）": " (default in use)",
    // ADR-333 册三（2026-09-22）：写入被拒率**按通道**明细 + 门禁拒收**按目标**明细。
    //   判因：原面板只有总量 ⇒ 画像通道 167 次真拒被摊薄成 7.4%，**通道级冻死在 UI 上不可见**。
    " · 按通道：": " · by channel: ",
    "门禁拒收（按目标）": "Gate rejections (by target)",
    " · 最近 ": " · latest "
  };

  // src-client/i18n-dict-index.generated.js
  var EN6 = Object.assign({}, EN, EN2, EN3, EN4, EN5);

  // src-client/i18n-ctrl.js
  function switchKeys() {
    return [
      ["injection.hot_memory", tr("注入热记忆总闸 hot_memory"), tr("关=不注入 agent/用户画像与知识索引任何指针行")]
      // 2026-09-10 审查收敛：archive/lifecycle/merge/scheduler 组开关是 v15 单库化前旧 Python 链路的
      // 遗留控件，其消费端（_meta/*.py）已不随包分发——保留只会误导用户"改了有效"。已移除。
      // 2026-09-11 同类遗漏：boards.memory 是「只写不读」死开关（parseView 解析进 out.boards 后全仓零读取点，
      // 注入总闸只读 level/hot_memory/persona），且旧文案宣称其「注入总闸的父开关」= 假依赖。同批移除。
    ];
  }
  var CTRL_META = {
    "injection.hot_memory": { scope: "global", effect: "live" },
    "injection.level": { scope: "global", effect: "live" },
    "injection.persona": { scope: "global", effect: "live" },
    "injection.cap_agent": { scope: "writeGate", effect: "live" },
    "injection.cap_user": { scope: "writeGate", effect: "live" },
    "injection.cap_memory": { scope: "writeGate", effect: "live" },
    recallColdFactorPercent: { scope: "recallFusion", effect: "live" },
    enableDeepSleep: { scope: "scheduling", effect: "reload" },
    // U3（B5 能力对齐）：新增控件的作用域与生效态
    injectRelevance: { scope: "injectionRows", effect: "live" },
    injectFreshSlots: { scope: "injectionRows", effect: "live" },
    recallFusion: { scope: "recallFusion", effect: "reload" },
    bankGit: { scope: "bankGit", effect: "reload" },
    mclEnabled: { scope: "cognitionLoop", effect: "reload" },
    mclFamiliarThreshold: { scope: "cognitionLoop", effect: "reload" },
    mclMaxNudges: { scope: "cognitionLoop", effect: "reload" },
    mclBudgetChars: { scope: "cognitionLoop", effect: "reload" },
    mclTopK: { scope: "cognitionLoop", effect: "reload" },
    mclAudit: { scope: "cognitionLoop", effect: "reload" }
  };
  function ctrlEffectText(effect) {
    if (effect === "reload") return tr("需重载");
    return tr("即时");
  }
  function ctrlScopeText(scope) {
    if (scope === "global") return tr("全局注入");
    if (scope === "writeGate") return tr("写门容量");
    if (scope === "recallFusion") return tr("召回融合");
    if (scope === "scheduling") return tr("调度");
    if (scope === "injectionRows") return tr("注入选行");
    if (scope === "bankGit") return tr("库版本化");
    if (scope === "cognitionLoop") return tr("认知环");
    return scope;
  }

  // src-client/body.js
  (function() {
    "use strict";
    window.__ModuleLoader__.load({
      id: "dsh-shoucang-memory",
      factory: function(require2) {
        var module = { exports: {} };
        var exports = module.exports;
        setRequire(require2);
        var BASE = "/api/shoucang-panel";
        var inject = ["slots"];
        function contract() {
          return typeof window !== "undefined" && window.__SC_CONTRACT__ || null;
        }
        function contractOf(path) {
          var _a;
          if (!contract()) return null;
          if (!appState.contractByPath) {
            appState.contractByPath = {};
            (((_a = contract()) == null ? void 0 : _a.routes) || []).forEach(function(r) {
              appState.contractByPath[r.path] = r;
            });
          }
          return appState.contractByPath[path] || null;
        }
        function preflight(path, body) {
          var c = contractOf(path);
          if (!c || !Derive.has(c.required)) return null;
          if (!body || typeof body !== "object") return { error: "preflight_missing_body", detail: path + tr(" 需要请求体（必填：") + c.required.join(", ") + "）" };
          var miss = c.required.filter(function(k) {
            var v = body[k];
            return v === void 0 || v === null || v === "";
          });
          return miss.length ? { error: "preflight_missing_field", detail: tr("缺少必填字段：") + miss.join(", ") } : null;
        }
        function api(path, opts) {
          var o = opts || {};
          var t0 = Date.now();
          var ctx = { method: o.method || "GET", path, params: o.body || null };
          var pre = preflight(path, o.body);
          if (pre) {
            var pe = new Error(pre.detail);
            pe.__ctx = ctx;
            pe.preflight = pre.error;
            Log.warn(tr("契约预检未通过：") + pre.detail + tr("（本地拦截，未发出请求）"), ctx);
            return Promise.reject(pe);
          }
          var busyShown = false;
          var busyTimer = setTimeout(function() {
            busyShown = true;
            setStatusText(tr("执行中… ") + path, "info");
          }, 1500);
          function endBusy() {
            clearTimeout(busyTimer);
            if (busyShown) {
              busyShown = false;
              setStatusText("", "info");
            }
          }
          return fetch(BASE + path, Object.assign({ headers: { "content-type": "application/json" } }, o)).then(function(r) {
            return r.json().then(function(j) {
              if (!r.ok) {
                var err = new Error(j && (j.detail || j.error) || "HTTP " + r.status);
                err.__ctx = ctx;
                err.httpStatus = r.status;
                if (j && j.detail) err.detail = j.detail;
                throw err;
              }
              endBusy();
              ctx.ms = Date.now() - t0;
              ctx.status = r.status;
              Log.info(ctx.method + " " + path + " ✓ " + ctx.ms + "ms", ctx);
              return j;
            });
          }).catch(function(e) {
            if (!e.__ctx) e.__ctx = ctx;
            endBusy();
            Log.error(ctx.method + " " + path + " ✗ " + (e && e.message ? e.message : String(e)), ctx);
            throw e;
          });
        }
        var SC_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAD90lEQVR4Aeybv65NQRTGL52CB6CRkNAIlUKpoPEIGkoFL6D1ACRaCs+gIFErFBQSJBQKHoBE666v2Mnsndmz98yeNd+cc76bWXfP/7XW9ztz/mafPNIfVQEBoMp/dCQAAkBWgOxeJ0AAyAqQ3esECABZAbJ7nQABICtAdn+YJ4AseuheAEI1CHUBIIgeuhSAUA1CXQAIoocuBSBUg1DvEcB/0yE0a2aVcC3qWYtbT+4RQGsNqP4EgCq/fpAhyy8AhwSAnmuXAeg1gIxFAA4QwDvLGe/P58yGR2Vu3lz/aLE15uah/6uNU0urE3DWskTCsJtW76VcskAQE+ya1ZuXFgBeWVa/zHovHy3A5ifCGwAeWXctsV0pOBHfWwbrCWDp0XTHEj1BMvg219FywXr/mTUpngDwaJom8c06BtFfW51V4HuI43ckiFPWh9ctu/gWLwB46plGft86Lpv1Vs5ZQI/NpqXJ65YXgGkyaL/Ev07ticWFU2GXumVpNw8AsUc/jvtSLOzx2OvCH++gPAB4x9xy/9PezloA2IVH/6DzjaHS6toCQKtcavh5X2OTnD0EIEcth7kC4CBqzpYCkKOWw9zaAPAx3iHM/d2yBADe589ZjS+y5vYu7d9Kb8nvpv1LAGxyqMVjBfYTwDjHrlsCQMZTAgCfbOfstkM+2HPOX6y/dggxH2HfJn8lAFIO36YGC8c89iwMpf6y2gDqR7jnOwoAGbAACABZAbJ7nQABICtAdq8TsD8AyJnsqHudADK42gAeOOTzMGPPnfs9ogRA6vvx5xlirZ361CamfIZjNX6PMHejEu4fq48m5zZKAOT60PyEAgKQEKfFkAC0UDnhowRA+F14rJ5wt2ootueWvlVOE5OWfCeWLg+VAFjeVTNWKyAAq6XymSgAG3XdulwAtiq4cb0AjAW8NW76t1oAwKdH/0zqeHhTZ5v1u7QAsD6a/mb+9Q7JAwDeN0/jdr/XauqwoP0isuZMpK9qlweAWIC41+pqbKCTPtw+e48RixeA2Cn4ZAn2+HqAmL5YbNNyftrh0fYCgFhjd6CjHwnDUGcaYoDFYkDsP2MDtfs8AeAO9FS8SJ5pqdiWYk+tzRrzBIBA8FT0AZUdsc8WJ2K2S5viDQBZXLd/dZOyDR0KYrzisG9yyxYAhgCQIGxo93JFTDBKPC0BDAki2ZQN84brI6uk5odjF23utCzdXzCd37TNAJCb4LOMBT8ic7u+v2AXAEQ03Z8uASCzFAABICtAdq8TIABkBcjuezwB4ft61HMlwprQctc3nZ8BoGlcB+NMAMioBUAAyAqQ3esECABZAbJ7nQABICtAdq8TIABkBcjudQIWAHgPHwMAAP//8UoJFgAAAAZJREFUAwBhOrPBP4+UEwAAAABJRU5ErkJggg==";
        function make2(k, v) {
          var o = {};
          o[k] = v;
          return o;
        }
        function setStatusText(msg, level) {
          var n = document.getElementById("sc-statusbar");
          if (!n) return;
          n.textContent = (msg || "") + "";
          n.className = "sc-statusbar sc-status-" + (level || "info");
        }
        setLogStatusSink(setStatusText);
        function status(msg, level) {
          var lv = level || "info";
          setStatusText(msg, lv);
          if (msg) Log.add(lv, msg);
        }
        function fail(e, ctx) {
          var err = e instanceof Error ? e : new Error(String(e && e.message ? e.message : e));
          var c = ctx || e && e.__ctx || null;
          var where = c ? " [" + (c.method || "") + " " + (c.path || "") + (c.params ? " " + JSON.stringify(c.params) : "") + "]" : "";
          var msg = "⚠ " + err.message + where;
          status(msg, "error");
          var rec = { t: Date.now(), message: err.message, ctx: c, stack: (err.stack || "").split("\n").slice(0, 4).join(" | ") };
          var a = (Store.get("errors") || []).concat([rec]);
          Store.set("errors", a.slice(-100));
          if (!c) Log.error(err.message, { where: null, stack: rec.stack });
          return rec;
        }
        function apiCtx(path, opts, label) {
          var o = opts || {};
          var t0 = Date.now();
          var ctx = { method: o.method || "GET", path, params: o.body || null };
          if (label) Prog.start(path, label);
          return api(path, o).then(function(r) {
            if (label) Prog.done(path, true, tr("完成 ") + Math.round((Date.now() - t0) / 100) / 10 + "s");
            Log.info((o.method || "GET") + " " + path + " ✓ " + (Date.now() - t0) + "ms", ctx);
            return r;
          }).catch(function(e) {
            if (label) Prog.done(path, false, tr("失败"));
            throw Object.assign(new Error(e && e.message ? e.message : String(e)), { __ctx: ctx });
          });
        }
        function metaBadges(key) {
          var m = CTRL_META[key] || { scope: "global", effect: "live" };
          var box = el("div", "sc-ctrl-meta");
          var sc = ctrlScopeText(m.scope);
          var eff = ctrlEffectText(m.effect) || String(m.effect || "");
          box.title = sc && eff ? sc + " · " + eff : sc || eff;
          if (eff) box.appendChild(el("span", "sc-chip" + (m.effect === "reload" ? " warn" : ""), eff));
          return box;
        }
        function scheduleFold(host, mark, label, openDefault, key) {
          var nodes = [];
          var n = mark.nextSibling;
          while (n) {
            nodes.push(n);
            n = n.nextSibling;
          }
          if (!Derive.has(nodes)) {
            if (mark.parentNode) mark.parentNode.removeChild(mark);
            return null;
          }
          var f = UI.fold({ key: key || "more:" + label, variant: "more", label, open: !!openDefault });
          nodes.forEach(function(x) {
            f.body.appendChild(x);
          });
          f.appendTo(host);
          if (mark.parentNode) mark.parentNode.removeChild(mark);
          return f;
        }
        function deferFold(host, mark, label, openDefault, key) {
          appState.foldQueue.push({ host, mark, label, open: !!openDefault, key });
        }
        function flushFolds() {
          var q = appState.foldQueue;
          appState.foldQueue = [];
          q.forEach(function(t) {
            try {
              scheduleFold(t.host, t.mark, t.label, t.open, t.key);
            } catch (e) {
              if (t.mark && t.mark.parentNode) t.mark.parentNode.removeChild(t.mark);
              Log.warn(tr("折叠收口失败：") + (e && e.message ? e.message : e));
            }
          });
          return q.length;
        }
        function opCard(title, desc, ep, btn, run, opts) {
          var o = opts || {};
          var c = el("div", "sc-opcard");
          var head = el("div", "sc-opcard-head");
          if (o.icon) {
            var ic = el("span", "sc-opcard-ic");
            ic.appendChild(svg(o.icon));
            head.appendChild(ic);
          }
          head.appendChild(el("span", "sc-opcard-t", title));
          c.appendChild(head);
          c.appendChild(el("div", "sc-opcard-d", desc));
          var f = el("div", "sc-opcard-f");
          f.appendChild(el("span", "sc-src", ep));
          f.appendChild(el("span", "sc-spacer"));
          f.appendChild(UI.button(btn, run, {
            primary: true,
            async: true,
            busyText: o.busyText || tr("执行中…"),
            confirm: o.confirm,
            okText: o.okText || title + tr(" 已发起")
          }));
          c.appendChild(f);
          return c;
        }
        var refs = {};
        var state = { parsed: null };
        function filterViewRows(q) {
          var host = refs.view;
          if (!host) return 0;
          var rows = host.querySelectorAll(".sc-idx-row,.sc-row,.sc-recent-row");
          var n = 0;
          for (var i = 0; i < rows.length; i++) {
            var hit = !q || String(rows[i].textContent || "").toLowerCase().indexOf(q.toLowerCase()) >= 0;
            rows[i].classList.toggle("sc-filtered", !hit);
            if (hit) n++;
          }
          return q ? n : rows.length;
        }
        appState.currentView = Cfg.get("startView", "overview");
        function refreshCurrentView() {
          show(appState.currentView);
        }
        function show(name) {
          if (appState.currentView !== name) Fold.clear();
          appState.currentView = name;
          try {
            Cfg.set("lastView", name);
          } catch (e) {
          }
          if (refs.view) {
            var vv = null;
            for (var i = 0; i < VIEWS.length; i++) {
              if (VIEWS[i][0] === name) {
                vv = VIEWS[i];
                break;
              }
            }
            refs.view.setAttribute("role", "region");
            if (vv) refs.view.setAttribute("aria-label", navLabelById(vv[0]) + "（" + navGroupByKey(vv[3]) + "）");
          }
          refs.navItems.forEach(function(it) {
            it.el.classList.toggle("active", it.name === name);
          });
          refs.view.textContent = "";
          var _hs = document.getElementById("scpanl-headslot");
          if (_hs) _hs.textContent = "";
          UI.bumpHeadEpoch();
          appState.foldQueue.length = 0;
          refs.view.scrollTop = 0;
          if (name === "overview") {
            renderViewOverview(refs.view);
          } else if (name === "persona") {
            api("/memory/overview").then(function(r) {
              renderPersona(refs.view, r);
            }).catch(fail);
          } else if (name === "memory") {
            api("/memory/overview").then(function(r) {
              renderMemoryExpanded(refs.view, r);
            }).catch(fail);
          } else if (name === "suite") {
            api("/suite").then(function(r) {
              renderSuite(refs.view, r);
            }).catch(fail);
          } else if (name === "toggles") {
            api("/config").then(function(r) {
              if (!r.global) {
                status(r.error === "no-active-root" ? tr("未激活根目录——请到「配置原文」页根目录区添加。") : r.error || "");
                return;
              }
              if (!r.parsed) status(tr("注入参数已全局可用（scheduler.json）；root 未登记——「记忆板块显示」开关待登记后可用。"));
              else status(tr("已加载 ") + (r.file || ""));
              renderViewToggles(refs.view, r.parsed || {}, r.global);
            }).catch(fail);
          } else if (name === "deepsleep") {
            renderDeepSleep(refs.view);
          } else if (name === "observe") {
            renderViewObserve(refs.view);
            collectMetrics();
          } else if (name === "arch") {
            renderViewArch(refs.view);
          } else if (name === "settings") {
            renderViewSettings(refs.view);
          }
        }
        function installShortcuts() {
          if (installShortcuts._done) return;
          installShortcuts._done = true;
          document.addEventListener("keydown", function(e) {
            var mod = e.ctrlKey || e.metaKey;
            if (mod && e.shiftKey && (e.key === "S" || e.key === "s")) {
              e.preventDefault();
              togglePanel();
              return;
            }
            if (mod && e.shiftKey && (e.key === "L" || e.key === "l")) {
              e.preventDefault();
              Cfg.set("showLogs", !Cfg.get("showLogs", true));
              applyLogPanel();
              status(tr("日志面板已") + (Cfg.get("showLogs") ? tr("显示") : tr("隐藏")), "info");
              return;
            }
            if (e.key === "Escape") {
              var mask = document.getElementById("scpanl-mask");
              if (mask && mask.classList.contains("open")) {
                e.preventDefault();
                closePanel();
              }
            }
          });
        }
        function togglePanel() {
          var mask = document.getElementById("scpanl-mask");
          if (!mask) return;
          if (mask.classList.contains("open")) closePanel();
          else openPanel();
        }
        function closePanel() {
          var mask = document.getElementById("scpanl-mask");
          if (mask) mask.classList.remove("open");
        }
        function buildModal(mask) {
          var modal = el("div");
          modal.id = "scpanl-modal";
          modal.setAttribute("role", "dialog");
          modal.setAttribute("aria-modal", "true");
          modal.setAttribute("aria-label", tr("守藏记忆面板"));
          var nav = el("div", "sc-nav");
          nav.appendChild(el("div", "sc-nav-title", tr("守藏 SHOUCANG")));
          refs.navItems = [];
          var lastGroup = null;
          VIEWS.forEach(function(v) {
            if (v[3] && v[3] !== lastGroup) {
              nav.appendChild(el("div", "sc-nav-group", navGroupByKey(v[3])));
              lastGroup = v[3];
            }
            var item = el("div", "sc-nav-item");
            item.setAttribute("data-view", v[0]);
            item.appendChild(svg(ICONS[v[2]]));
            var label = navLabelById(v[0]);
            item.appendChild(el("span", null, label));
            item.setAttribute("role", "button");
            item.setAttribute("tabindex", "0");
            item.setAttribute("aria-label", label);
            item.onclick = function() {
              show(v[0]);
            };
            item.onkeydown = function(e) {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                show(v[0]);
              }
            };
            refs.navItems.push({ name: v[0], el: item });
            nav.appendChild(item);
          });
          nav.appendChild(el("div", "sc-nav-spacer"));
          var foot = el("div", "sc-nav-foot");
          var health = el("div", "sc-nav-health");
          var fdot = el("span", "sc-dot ok");
          health.appendChild(fdot);
          health.appendChild(el("b", null, tr("记忆库")));
          var fstate = el("span", null, "—");
          health.appendChild(fstate);
          foot.appendChild(health);
          var fsub = el("div", "sc-nav-foot-sub", "storage = obsidian vault");
          foot.appendChild(fsub);
          nav.appendChild(foot);
          refs.navHealth = function(stateText, kind, subText) {
            if (stateText !== void 0 && stateText !== null) fstate.textContent = stateText;
            if (kind) fdot.className = "sc-dot " + (kind === "ended" ? "ok" : kind === "stalled" ? "err" : kind === "suspect" ? "warn" : kind);
            if (subText) fsub.textContent = subText;
          };
          var navClose = el("button", "sc-nav-close", "✕");
          navClose.type = "button";
          navClose.title = tr("关闭面板");
          navClose.setAttribute("aria-label", tr("关闭面板"));
          navClose.onclick = function() {
            closePanel();
          };
          nav.appendChild(navClose);
          modal.appendChild(nav);
          var main = el("div", "sc-main");
          var headSlot = el("div", "sc-headslot");
          headSlot.id = "scpanl-headslot";
          main.appendChild(headSlot);
          refs.view = el("div", "sc-view");
          main.appendChild(refs.view);
          var bar = el("div", "sc-statusbar");
          bar.id = "sc-statusbar";
          bar.setAttribute("role", "status");
          bar.setAttribute("aria-live", "polite");
          main.appendChild(bar);
          modal.appendChild(main);
          mask.appendChild(modal);
          applyDensity();
          applyNavWidth();
          applyNavGroups();
          applyFootBar();
          applyLogPanel();
          installShortcuts();
          restartPolling();
          var startView = "file";
          try {
            var hm = String(location.hash || "").match(/[#&]sc=([a-z0-9_-]+)/i);
            if (hm && VIEWS.some(function(v) {
              return v[0] === hm[1];
            })) startView = hm[1];
            else if (Cfg.get("lastView")) {
              var lv = String(Cfg.get("lastView"));
              if (VIEWS.some(function(v) {
                return v[0] === lv;
              })) startView = lv;
            }
          } catch (e) {
          }
          show(startView);
        }
        function openPanel() {
          var mask = document.getElementById("scpanl-mask");
          if (!mask) return;
          if (!mask.querySelector("#scpanl-modal")) buildModal(mask);
          mask.classList.add("open");
          syncTheme();
          refreshCurrentView();
        }
        function mount() {
          if (document.getElementById("scpanl-mask")) {
            syncTheme();
            return true;
          }
          var rootEl = el("div");
          rootEl.id = "scpanl-root";
          document.body.appendChild(rootEl);
          syncTheme();
          var styleHost = el("style");
          styleHost.textContent = CSS;
          rootEl.appendChild(styleHost);
          var mask = el("div");
          mask.id = "scpanl-mask";
          mask.onclick = function(ev) {
            if (ev.target === mask) mask.classList.remove("open");
          };
          rootEl.appendChild(mask);
          return false;
        }
        function mountFallbackEntry() {
          if (document.getElementById("scpanl-btn")) return;
          var btn = el("button");
          btn.id = "scpanl-btn";
          btn.title = tr("守藏面板");
          var ic = el("img", "sc-ic-lg");
          ic.src = SC_ICON;
          ic.alt = tr("守");
          btn.appendChild(ic);
          btn.dataset.fallback = "1";
          btn.classList.add("sc-fab");
          btn.onclick = openPanel;
          document.body.appendChild(btn);
        }
        function mountSidebarEntry() {
          if (document.getElementById("scpanl-btn")) return true;
          var foot = null;
          var mneme = document.querySelector(".mneme-trigger");
          if (mneme) foot = mneme.closest('[class*="footArea"]') || mneme.closest('[class*="foot-area"]');
          if (!foot) foot = document.querySelector('[class*="footArea"]') || document.querySelector('[class*="foot-area"]');
          if (!foot) {
            if (appState.sidebarTries++ < 40) {
              setTimeout(mountSidebarEntry, 500);
              return false;
            }
            mountFallbackEntry();
            return false;
          }
          var btn = null;
          var settingsBtn = null;
          try {
            settingsBtn = document.querySelector('[class*="triggerRow"] button');
          } catch (e) {
            settingsBtn = null;
          }
          if (settingsBtn && settingsBtn.cloneNode) {
            try {
              btn = settingsBtn.cloneNode(true);
              btn.id = "scpanl-btn";
              btn.removeAttribute("aria-haspopup");
              btn.removeAttribute("aria-expanded");
              btn.title = tr("守藏面板");
              var lab = btn.querySelector("span, [data-slot] span");
              if (lab) lab.textContent = tr("守藏");
              btn.onclick = openPanel;
            } catch (e) {
              btn = null;
            }
          }
          if (!btn) {
            btn = el("button");
            btn.id = "scpanl-btn";
            btn.type = "button";
            btn.title = tr("守藏面板");
            btn.className = "sc-trigger";
            var icF = el("img", "sc-ic-sm");
            icF.src = SC_ICON;
            icF.alt = tr("守");
            btn.appendChild(icF);
            btn.appendChild(el("span", "sc-trigger-label", tr("守藏")));
            btn.onclick = openPanel;
          }
          var settingsRow = settingsBtn ? settingsBtn.closest('[class*="triggerRow"]') : null;
          if (settingsBtn && settingsRow && btn.getAttribute("class") && String(btn.className).indexOf("sc-trigger") < 0) {
            var ownRow = el("div");
            ownRow.className = settingsRow.className;
            ownRow.appendChild(btn);
            settingsRow.parentElement.insertBefore(ownRow, settingsRow);
          } else if (settingsBtn && settingsBtn.parentElement) {
            settingsBtn.parentElement.insertBefore(btn, settingsBtn);
          } else {
            foot.insertBefore(btn, foot.firstChild);
          }
          var root = foot.parentElement;
          var isClone = !!settingsBtn && !!btn.dataset && btn.getAttribute("class") !== null && String(btn.className).indexOf("sc-trigger") < 0;
          var sync = function() {
            if (!btn.isConnected) {
              var wr = btn.parentElement;
              btn.remove();
              if (wr && wr !== foot && wr.children.length === 0) wr.remove();
              appState.sidebarTries = 0;
              mountSidebarEntry();
              return;
            }
            if (isClone) return;
            var collapsed = root && (root.classList.contains("hHd-Xa_collapsed") || root.clientWidth < 200);
            btn.className = collapsed ? "sc-trigger sc-rail" : "sc-trigger";
          };
          sync();
          if (root && typeof MutationObserver !== "undefined") {
            appState.sidebarObserver = new MutationObserver(sync);
            appState.sidebarObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
            appState.sidebarObserver.observe(foot, { childList: true });
          }
          return true;
        }
        function applyCfgSideEffect(key) {
          try {
            if (key === "density") applyDensity();
            else if (key === "navWidth") applyNavWidth();
            else if (key === "navGroups") applyNavGroups();
            else if (key === "footBar") applyFootBar();
            else if (key === "showLogs") applyLogPanel();
            else if (key === "refreshMs") restartPolling();
            else if (key === "skin") {
              syncTheme();
              refreshCurrentView();
            } else if (key === "startView" || key === "logLevel" || key === "overviewMode" || key === "maxRows") {
            }
          } catch (e) {
            Log.warn(tr("设置生效失败（") + key + "）：" + (e && e.message));
          }
        }
        function ShoucangSettingsSection() {
          var h = appState.slotReact.createElement;
          function row(key, title, desc, control) {
            return h(
              "div",
              { className: "setting-item", key },
              h(
                "div",
                { className: "setting-item-info" },
                h("div", { className: "setting-item-name" }, title),
                h("div", { className: "setting-item-desc" }, desc)
              ),
              h("div", { className: "setting-item-control" }, control)
            );
          }
          function sel(key, opts, fallback) {
            return h("select", {
              value: String(Cfg.get(key, fallback)),
              onChange: function(ev) {
                Cfg.set(key, ev.target.value);
                applyCfgSideEffect(key);
              }
            }, (opts || []).map(function(o) {
              return h("option", { value: String(o.value), key: String(o.value) }, o.label);
            }));
          }
          function num(key, fallback, min, max, step) {
            return h("input", {
              type: "number",
              value: String(Cfg.get(key, fallback)),
              step: step || 1,
              onChange: function(ev) {
                var n = parseInt(ev.target.value, 10);
                if (isNaN(n)) return;
                Cfg.set(key, Math.max(min, Math.min(max, n)));
                applyCfgSideEffect(key);
              }
            });
          }
          function tgl(key, fallback) {
            return h("input", {
              type: "checkbox",
              checked: !!Cfg.get(key, fallback),
              onChange: function(ev) {
                Cfg.set(key, ev.target.checked);
                applyCfgSideEffect(key);
              }
            });
          }
          return h(
            "div",
            { className: "sc-host-settings" },
            h("div", { className: "setting-item-desc" }, tr("守藏面板的界面偏好（与面板内「设置」页同源，改后立即生效；保存在浏览器 localStorage）。")),
            row(
              "density",
              tr("显示密度"),
              tr("紧凑模式隐藏描述、压缩行高"),
              sel("density", [{ value: "comfortable", label: tr("舒适") }, { value: "compact", label: tr("紧凑") }], "comfortable")
            ),
            row("navWidth", tr("导航宽度"), tr("面板左导航像素宽度（140–320）"), num("navWidth", 216, 140, 320)),
            row("refreshMs", tr("轮询间隔"), tr("毫秒；0 = 关闭轮询"), num("refreshMs", 6e4, 0, 36e5, 1e3)),
            row("showLogs", tr("显示日志面板"), tr("状态栏上方常驻日志（关闭即折叠成一行）"), tgl("showLogs", false)),
            row(
              "skin",
              tr("界面皮肤"),
              tr("v9 = 方案调色板（默认）；宿生 = 跟随 DSH 主题令牌"),
              sel("skin", [{ value: "v9", label: tr("v9 方案皮肤") }, { value: "host", label: tr("宿主原生皮肤") }], "v9")
            ),
            row(
              "startView",
              tr("启动时视图"),
              tr("打开面板默认落地页（深链 > 上次视图 > 此项）"),
              sel("startView", VIEWS.map(function(v) {
                return { value: v[0], label: navLabelById(v[0]) };
              }), "overview")
            ),
            row(
              "openPanel",
              tr("打开面板"),
              tr("宿主设置里也能直接唤起守藏面板"),
              h("button", { type: "button", className: "sc-btn sc-btn-primary", onClick: function() {
                openPanel();
              } }, tr("打开守藏面板"))
            )
          );
        }
        function apply(ctx) {
          mount();
          attachLocale(ctx, {
            /* 词表由 `i18n-dict-index.generated.js` 合并（按目录生成）—— 新增词表文件无须改本行。 */
            en: EN6
          }, {
            effect: function(fn) {
              if (ctx && typeof ctx.effect === "function") ctx.effect(fn, "shoucang: locale");
            },
            onChange: function() {
              var ready = !!(appState && appState.refreshView && appState.switchKeys);
              if (!ready) return;
              try {
                relabelChrome();
                appState.refreshView();
              } catch (e) {
              }
            }
          });
          if (!window.__scFocusBound) {
            window.__scFocusBound = true;
            var lastFocusRefresh = 0;
            var focusRefresh = function() {
              try {
                var mk = document.getElementById("scpanl-mask");
                if (!mk || !mk.classList.contains("open")) return;
                if (document.hidden) return;
                var now = Date.now();
                if (now - lastFocusRefresh < 1500) return;
                lastFocusRefresh = now;
                refreshCurrentView();
              } catch (e) {
              }
            };
            window.addEventListener("focus", focusRefresh);
            document.addEventListener("visibilitychange", function() {
              if (!document.hidden) focusRefresh();
            });
          }
          var reactEl2 = null;
          try {
            reactEl2 = require2("react");
          } catch (e) {
            reactEl2 = null;
          }
          appState.slotReact = reactEl2;
          var SLOT_OK = !!(reactEl2 && typeof reactEl2.createElement === "function" && ctx && typeof ctx.effect === "function" && ctx.slots && typeof ctx.slots.inject === "function" && typeof ctx.slots.register === "function");
          var SLOT_OK = registerHostSlots({
            ctx,
            reactEl: reactEl2,
            openPanel,
            iconSrc: SC_ICON,
            Tr: tr,
            SettingsSection: ShoucangSettingsSection
          });
          if (SLOT_OK) {
            Log.info(tr("侧栏入口：已注册宿主插槽 sidebar.footer.action（不挂 DOM 直插入口）"));
          } else {
            Log.info(tr("侧栏入口：宿主插槽不可用（") + (reactEl2 ? tr("slots 服务缺失") : tr("require('react') 不可用")) + tr("），回退 DOM 直插"));
            if (!document.getElementById("scpanl-btn")) mountSidebarEntry();
          }
          return function() {
            if (appState.sidebarObserver) {
              try {
                appState.sidebarObserver.disconnect();
              } catch (e) {
              }
            }
            var n = document.getElementById("scpanl-root");
            if (n) n.remove();
            var b = document.getElementById("scpanl-btn");
            if (b) b.remove();
          };
        }
        exports.inject = inject;
        exports.apply = apply;
        appState.api = api;
        appState.statusFn = status;
        appState.failFn = fail;
        appState.refreshView = refreshCurrentView;
        appState.refs = refs;
        appState.flushFolds = flushFolds;
        appState.switchKeys = switchKeys;
        appState.metaBadges = metaBadges;
        appState.renderNoteSections = renderNoteSections;
        appState.makeToggle = makeToggle;
        appState.show = show;
        appState.apiCtx = apiCtx;
        appState.opCard = opCard;
        appState.renderRunExtras = renderRunExtras;
        appState.applyLogPanel = applyLogPanel;
        appState.views = VIEWS;
        appState.dsNumber = dsNumber;
        appState.deferFold = deferFold;
        appState.filterViewRows = filterViewRows;
        return module.exports;
      }
    });
  })();
})();
