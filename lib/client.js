"use strict";
(() => {
  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.R7QX4M6R.js
  var MirrorValidator = () => {
    return {
      checkValidity(element) {
        const formControl = element.input;
        const validity = {
          message: "",
          isValid: true,
          invalidKeys: []
        };
        if (!formControl) {
          return validity;
        }
        let isValid = true;
        if ("checkValidity" in formControl) {
          isValid = formControl.checkValidity();
        }
        if (isValid) {
          return validity;
        }
        validity.isValid = false;
        if ("validationMessage" in formControl) {
          validity.message = formControl.validationMessage;
        }
        if (!("validity" in formControl)) {
          validity.invalidKeys.push("customError");
          return validity;
        }
        for (const key in formControl.validity) {
          if (key === "valid") {
            continue;
          }
          const checkedKey = key;
          if (formControl.validity[checkedKey]) {
            validity.invalidKeys.push(checkedKey);
          }
        }
        return validity;
      }
    };
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.VC3BPUZJ.js
  var WaInvalidEvent = class extends Event {
    constructor() {
      super("wa-invalid", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.7VGCIHDG.js
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
      if (decorator = decorators[i7])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result) __defProp(target, key, result);
    return result;
  };
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // node_modules/@lit/reactive-element/css-tag.js
  var t = globalThis;
  var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
  var s = /* @__PURE__ */ Symbol();
  var o = /* @__PURE__ */ new WeakMap();
  var n = class {
    constructor(t6, e8, o9) {
      if (this._$cssResult$ = true, o9 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
      this.cssText = t6, this.t = e8;
    }
    get styleSheet() {
      let t6 = this.o;
      const s4 = this.t;
      if (e && void 0 === t6) {
        const e8 = void 0 !== s4 && 1 === s4.length;
        e8 && (t6 = o.get(s4)), void 0 === t6 && ((this.o = t6 = new CSSStyleSheet()).replaceSync(this.cssText), e8 && o.set(s4, t6));
      }
      return t6;
    }
    toString() {
      return this.cssText;
    }
  };
  var r = (t6) => new n("string" == typeof t6 ? t6 : t6 + "", void 0, s);
  var i = (t6, ...e8) => {
    const o9 = 1 === t6.length ? t6[0] : e8.reduce((e9, s4, o10) => e9 + ((t7) => {
      if (true === t7._$cssResult$) return t7.cssText;
      if ("number" == typeof t7) return t7;
      throw Error("Value passed to 'css' function must be a 'css' function result: " + t7 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
    })(s4) + t6[o10 + 1], t6[0]);
    return new n(o9, t6, s);
  };
  var S = (s4, o9) => {
    if (e) s4.adoptedStyleSheets = o9.map((t6) => t6 instanceof CSSStyleSheet ? t6 : t6.styleSheet);
    else for (const e8 of o9) {
      const o10 = document.createElement("style"), n6 = t.litNonce;
      void 0 !== n6 && o10.setAttribute("nonce", n6), o10.textContent = e8.cssText, s4.appendChild(o10);
    }
  };
  var c = e ? (t6) => t6 : (t6) => t6 instanceof CSSStyleSheet ? ((t7) => {
    let e8 = "";
    for (const s4 of t7.cssRules) e8 += s4.cssText;
    return r(e8);
  })(t6) : t6;

  // node_modules/@lit/reactive-element/reactive-element.js
  var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
  var a = globalThis;
  var c2 = a.trustedTypes;
  var l = c2 ? c2.emptyScript : "";
  var p = a.reactiveElementPolyfillSupport;
  var d = (t6, s4) => t6;
  var u = { toAttribute(t6, s4) {
    switch (s4) {
      case Boolean:
        t6 = t6 ? l : null;
        break;
      case Object:
      case Array:
        t6 = null == t6 ? t6 : JSON.stringify(t6);
    }
    return t6;
  }, fromAttribute(t6, s4) {
    let i7 = t6;
    switch (s4) {
      case Boolean:
        i7 = null !== t6;
        break;
      case Number:
        i7 = null === t6 ? null : Number(t6);
        break;
      case Object:
      case Array:
        try {
          i7 = JSON.parse(t6);
        } catch (t7) {
          i7 = null;
        }
    }
    return i7;
  } };
  var f = (t6, s4) => !i2(t6, s4);
  var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
  var _a, _b;
  (_a = Symbol.metadata) != null ? _a : Symbol.metadata = /* @__PURE__ */ Symbol("metadata"), (_b = a.litPropertyMetadata) != null ? _b : a.litPropertyMetadata = /* @__PURE__ */ new WeakMap();
  var y = class extends HTMLElement {
    static addInitializer(t6) {
      var _a8;
      this._$Ei(), ((_a8 = this.l) != null ? _a8 : this.l = []).push(t6);
    }
    static get observedAttributes() {
      return this.finalize(), this._$Eh && [...this._$Eh.keys()];
    }
    static createProperty(t6, s4 = b) {
      if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t6) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t6, s4), !s4.noAccessor) {
        const i7 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t6, i7, s4);
        void 0 !== h3 && e2(this.prototype, t6, h3);
      }
    }
    static getPropertyDescriptor(t6, s4, i7) {
      var _a8;
      const { get: e8, set: r7 } = (_a8 = h(this.prototype, t6)) != null ? _a8 : { get() {
        return this[s4];
      }, set(t7) {
        this[s4] = t7;
      } };
      return { get: e8, set(s5) {
        const h3 = e8 == null ? void 0 : e8.call(this);
        r7 == null ? void 0 : r7.call(this, s5), this.requestUpdate(t6, h3, i7);
      }, configurable: true, enumerable: true };
    }
    static getPropertyOptions(t6) {
      var _a8;
      return (_a8 = this.elementProperties.get(t6)) != null ? _a8 : b;
    }
    static _$Ei() {
      if (this.hasOwnProperty(d("elementProperties"))) return;
      const t6 = n2(this);
      t6.finalize(), void 0 !== t6.l && (this.l = [...t6.l]), this.elementProperties = new Map(t6.elementProperties);
    }
    static finalize() {
      if (this.hasOwnProperty(d("finalized"))) return;
      if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
        const t7 = this.properties, s4 = [...r2(t7), ...o2(t7)];
        for (const i7 of s4) this.createProperty(i7, t7[i7]);
      }
      const t6 = this[Symbol.metadata];
      if (null !== t6) {
        const s4 = litPropertyMetadata.get(t6);
        if (void 0 !== s4) for (const [t7, i7] of s4) this.elementProperties.set(t7, i7);
      }
      this._$Eh = /* @__PURE__ */ new Map();
      for (const [t7, s4] of this.elementProperties) {
        const i7 = this._$Eu(t7, s4);
        void 0 !== i7 && this._$Eh.set(i7, t7);
      }
      this.elementStyles = this.finalizeStyles(this.styles);
    }
    static finalizeStyles(s4) {
      const i7 = [];
      if (Array.isArray(s4)) {
        const e8 = new Set(s4.flat(1 / 0).reverse());
        for (const s5 of e8) i7.unshift(c(s5));
      } else void 0 !== s4 && i7.push(c(s4));
      return i7;
    }
    static _$Eu(t6, s4) {
      const i7 = s4.attribute;
      return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t6 ? t6.toLowerCase() : void 0;
    }
    constructor() {
      super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
    }
    _$Ev() {
      var _a8;
      this._$ES = new Promise((t6) => this.enableUpdating = t6), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), (_a8 = this.constructor.l) == null ? void 0 : _a8.forEach((t6) => t6(this));
    }
    addController(t6) {
      var _a8, _b2;
      ((_a8 = this._$EO) != null ? _a8 : this._$EO = /* @__PURE__ */ new Set()).add(t6), void 0 !== this.renderRoot && this.isConnected && ((_b2 = t6.hostConnected) == null ? void 0 : _b2.call(t6));
    }
    removeController(t6) {
      var _a8;
      (_a8 = this._$EO) == null ? void 0 : _a8.delete(t6);
    }
    _$E_() {
      const t6 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
      for (const i7 of s4.keys()) this.hasOwnProperty(i7) && (t6.set(i7, this[i7]), delete this[i7]);
      t6.size > 0 && (this._$Ep = t6);
    }
    createRenderRoot() {
      var _a8;
      const t6 = (_a8 = this.shadowRoot) != null ? _a8 : this.attachShadow(this.constructor.shadowRootOptions);
      return S(t6, this.constructor.elementStyles), t6;
    }
    connectedCallback() {
      var _a8, _b2;
      (_a8 = this.renderRoot) != null ? _a8 : this.renderRoot = this.createRenderRoot(), this.enableUpdating(true), (_b2 = this._$EO) == null ? void 0 : _b2.forEach((t6) => {
        var _a9;
        return (_a9 = t6.hostConnected) == null ? void 0 : _a9.call(t6);
      });
    }
    enableUpdating(t6) {
    }
    disconnectedCallback() {
      var _a8;
      (_a8 = this._$EO) == null ? void 0 : _a8.forEach((t6) => {
        var _a9;
        return (_a9 = t6.hostDisconnected) == null ? void 0 : _a9.call(t6);
      });
    }
    attributeChangedCallback(t6, s4, i7) {
      this._$AK(t6, i7);
    }
    _$ET(t6, s4) {
      var _a8;
      const i7 = this.constructor.elementProperties.get(t6), e8 = this.constructor._$Eu(t6, i7);
      if (void 0 !== e8 && true === i7.reflect) {
        const h3 = (void 0 !== ((_a8 = i7.converter) == null ? void 0 : _a8.toAttribute) ? i7.converter : u).toAttribute(s4, i7.type);
        this._$Em = t6, null == h3 ? this.removeAttribute(e8) : this.setAttribute(e8, h3), this._$Em = null;
      }
    }
    _$AK(t6, s4) {
      var _a8, _b2, _c;
      const i7 = this.constructor, e8 = i7._$Eh.get(t6);
      if (void 0 !== e8 && this._$Em !== e8) {
        const t7 = i7.getPropertyOptions(e8), h3 = "function" == typeof t7.converter ? { fromAttribute: t7.converter } : void 0 !== ((_a8 = t7.converter) == null ? void 0 : _a8.fromAttribute) ? t7.converter : u;
        this._$Em = e8;
        const r7 = h3.fromAttribute(s4, t7.type);
        this[e8] = (_c = r7 != null ? r7 : (_b2 = this._$Ej) == null ? void 0 : _b2.get(e8)) != null ? _c : r7, this._$Em = null;
      }
    }
    requestUpdate(t6, s4, i7, e8 = false, h3) {
      var _a8, _b2;
      if (void 0 !== t6) {
        const r7 = this.constructor;
        if (false === e8 && (h3 = this[t6]), i7 != null ? i7 : i7 = r7.getPropertyOptions(t6), !(((_a8 = i7.hasChanged) != null ? _a8 : f)(h3, s4) || i7.useDefault && i7.reflect && h3 === ((_b2 = this._$Ej) == null ? void 0 : _b2.get(t6)) && !this.hasAttribute(r7._$Eu(t6, i7)))) return;
        this.C(t6, s4, i7);
      }
      false === this.isUpdatePending && (this._$ES = this._$EP());
    }
    C(t6, s4, { useDefault: i7, reflect: e8, wrapped: h3 }, r7) {
      var _a8, _b2, _c;
      i7 && !((_a8 = this._$Ej) != null ? _a8 : this._$Ej = /* @__PURE__ */ new Map()).has(t6) && (this._$Ej.set(t6, (_b2 = r7 != null ? r7 : s4) != null ? _b2 : this[t6]), true !== h3 || void 0 !== r7) || (this._$AL.has(t6) || (this.hasUpdated || i7 || (s4 = void 0), this._$AL.set(t6, s4)), true === e8 && this._$Em !== t6 && ((_c = this._$Eq) != null ? _c : this._$Eq = /* @__PURE__ */ new Set()).add(t6));
    }
    async _$EP() {
      this.isUpdatePending = true;
      try {
        await this._$ES;
      } catch (t7) {
        Promise.reject(t7);
      }
      const t6 = this.scheduleUpdate();
      return null != t6 && await t6, !this.isUpdatePending;
    }
    scheduleUpdate() {
      return this.performUpdate();
    }
    performUpdate() {
      var _a8, _b2;
      if (!this.isUpdatePending) return;
      if (!this.hasUpdated) {
        if ((_a8 = this.renderRoot) != null ? _a8 : this.renderRoot = this.createRenderRoot(), this._$Ep) {
          for (const [t8, s5] of this._$Ep) this[t8] = s5;
          this._$Ep = void 0;
        }
        const t7 = this.constructor.elementProperties;
        if (t7.size > 0) for (const [s5, i7] of t7) {
          const { wrapped: t8 } = i7, e8 = this[s5];
          true !== t8 || this._$AL.has(s5) || void 0 === e8 || this.C(s5, void 0, i7, e8);
        }
      }
      let t6 = false;
      const s4 = this._$AL;
      try {
        t6 = this.shouldUpdate(s4), t6 ? (this.willUpdate(s4), (_b2 = this._$EO) == null ? void 0 : _b2.forEach((t7) => {
          var _a9;
          return (_a9 = t7.hostUpdate) == null ? void 0 : _a9.call(t7);
        }), this.update(s4)) : this._$EM();
      } catch (s5) {
        throw t6 = false, this._$EM(), s5;
      }
      t6 && this._$AE(s4);
    }
    willUpdate(t6) {
    }
    _$AE(t6) {
      var _a8;
      (_a8 = this._$EO) == null ? void 0 : _a8.forEach((t7) => {
        var _a9;
        return (_a9 = t7.hostUpdated) == null ? void 0 : _a9.call(t7);
      }), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t6)), this.updated(t6);
    }
    _$EM() {
      this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
    }
    get updateComplete() {
      return this.getUpdateComplete();
    }
    getUpdateComplete() {
      return this._$ES;
    }
    shouldUpdate(t6) {
      return true;
    }
    update(t6) {
      this._$Eq && (this._$Eq = this._$Eq.forEach((t7) => this._$ET(t7, this[t7]))), this._$EM();
    }
    updated(t6) {
    }
    firstUpdated(t6) {
    }
  };
  var _a2;
  y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p == null ? void 0 : p({ ReactiveElement: y }), ((_a2 = a.reactiveElementVersions) != null ? _a2 : a.reactiveElementVersions = []).push("2.1.2");

  // node_modules/lit-html/lit-html.js
  var t2 = globalThis;
  var i3 = (t6) => t6;
  var s2 = t2.trustedTypes;
  var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t6) => t6 }) : void 0;
  var h2 = "$lit$";
  var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
  var n3 = "?" + o3;
  var r3 = `<${n3}>`;
  var l2 = document;
  var c3 = () => l2.createComment("");
  var a2 = (t6) => null === t6 || "object" != typeof t6 && "function" != typeof t6;
  var u2 = Array.isArray;
  var d2 = (t6) => u2(t6) || "function" == typeof (t6 == null ? void 0 : t6[Symbol.iterator]);
  var f2 = "[ 	\n\f\r]";
  var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
  var _ = /-->/g;
  var m = />/g;
  var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
  var g = /'/g;
  var $ = /"/g;
  var y2 = /^(?:script|style|textarea|title)$/i;
  var x = (t6) => (i7, ...s4) => ({ _$litType$: t6, strings: i7, values: s4 });
  var b2 = x(1);
  var w = x(2);
  var T = x(3);
  var E = /* @__PURE__ */ Symbol.for("lit-noChange");
  var A = /* @__PURE__ */ Symbol.for("lit-nothing");
  var C = /* @__PURE__ */ new WeakMap();
  var P = l2.createTreeWalker(l2, 129);
  function V(t6, i7) {
    if (!u2(t6) || !t6.hasOwnProperty("raw")) throw Error("invalid template strings array");
    return void 0 !== e3 ? e3.createHTML(i7) : i7;
  }
  var N = (t6, i7) => {
    const s4 = t6.length - 1, e8 = [];
    let n6, l6 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c5 = v;
    for (let i8 = 0; i8 < s4; i8++) {
      const s5 = t6[i8];
      let a4, u4, d3 = -1, f3 = 0;
      for (; f3 < s5.length && (c5.lastIndex = f3, u4 = c5.exec(s5), null !== u4); ) f3 = c5.lastIndex, c5 === v ? "!--" === u4[1] ? c5 = _ : void 0 !== u4[1] ? c5 = m : void 0 !== u4[2] ? (y2.test(u4[2]) && (n6 = RegExp("</" + u4[2], "g")), c5 = p2) : void 0 !== u4[3] && (c5 = p2) : c5 === p2 ? ">" === u4[0] ? (c5 = n6 != null ? n6 : v, d3 = -1) : void 0 === u4[1] ? d3 = -2 : (d3 = c5.lastIndex - u4[2].length, a4 = u4[1], c5 = void 0 === u4[3] ? p2 : '"' === u4[3] ? $ : g) : c5 === $ || c5 === g ? c5 = p2 : c5 === _ || c5 === m ? c5 = v : (c5 = p2, n6 = void 0);
      const x2 = c5 === p2 && t6[i8 + 1].startsWith("/>") ? " " : "";
      l6 += c5 === v ? s5 + r3 : d3 >= 0 ? (e8.push(a4), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i8 : x2);
    }
    return [V(t6, l6 + (t6[s4] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e8];
  };
  var S2 = class _S {
    constructor({ strings: t6, _$litType$: i7 }, e8) {
      let r7;
      this.parts = [];
      let l6 = 0, a4 = 0;
      const u4 = t6.length - 1, d3 = this.parts, [f3, v2] = N(t6, i7);
      if (this.el = _S.createElement(f3, e8), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
        const t7 = this.el.content.firstChild;
        t7.replaceWith(...t7.childNodes);
      }
      for (; null !== (r7 = P.nextNode()) && d3.length < u4; ) {
        if (1 === r7.nodeType) {
          if (r7.hasAttributes()) for (const t7 of r7.getAttributeNames()) if (t7.endsWith(h2)) {
            const i8 = v2[a4++], s4 = r7.getAttribute(t7).split(o3), e9 = /([.?@])?(.*)/.exec(i8);
            d3.push({ type: 1, index: l6, name: e9[2], strings: s4, ctor: "." === e9[1] ? I : "?" === e9[1] ? L : "@" === e9[1] ? z : H }), r7.removeAttribute(t7);
          } else t7.startsWith(o3) && (d3.push({ type: 6, index: l6 }), r7.removeAttribute(t7));
          if (y2.test(r7.tagName)) {
            const t7 = r7.textContent.split(o3), i8 = t7.length - 1;
            if (i8 > 0) {
              r7.textContent = s2 ? s2.emptyScript : "";
              for (let s4 = 0; s4 < i8; s4++) r7.append(t7[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l6 });
              r7.append(t7[i8], c3());
            }
          }
        } else if (8 === r7.nodeType) if (r7.data === n3) d3.push({ type: 2, index: l6 });
        else {
          let t7 = -1;
          for (; -1 !== (t7 = r7.data.indexOf(o3, t7 + 1)); ) d3.push({ type: 7, index: l6 }), t7 += o3.length - 1;
        }
        l6++;
      }
    }
    static createElement(t6, i7) {
      const s4 = l2.createElement("template");
      return s4.innerHTML = t6, s4;
    }
  };
  function M(t6, i7, s4 = t6, e8) {
    var _a8, _b2, _c;
    if (i7 === E) return i7;
    let h3 = void 0 !== e8 ? (_a8 = s4._$Co) == null ? void 0 : _a8[e8] : s4._$Cl;
    const o9 = a2(i7) ? void 0 : i7._$litDirective$;
    return (h3 == null ? void 0 : h3.constructor) !== o9 && ((_b2 = h3 == null ? void 0 : h3._$AO) == null ? void 0 : _b2.call(h3, false), void 0 === o9 ? h3 = void 0 : (h3 = new o9(t6), h3._$AT(t6, s4, e8)), void 0 !== e8 ? ((_c = s4._$Co) != null ? _c : s4._$Co = [])[e8] = h3 : s4._$Cl = h3), void 0 !== h3 && (i7 = M(t6, h3._$AS(t6, i7.values), h3, e8)), i7;
  }
  var R = class {
    constructor(t6, i7) {
      this._$AV = [], this._$AN = void 0, this._$AD = t6, this._$AM = i7;
    }
    get parentNode() {
      return this._$AM.parentNode;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    u(t6) {
      var _a8;
      const { el: { content: i7 }, parts: s4 } = this._$AD, e8 = ((_a8 = t6 == null ? void 0 : t6.creationScope) != null ? _a8 : l2).importNode(i7, true);
      P.currentNode = e8;
      let h3 = P.nextNode(), o9 = 0, n6 = 0, r7 = s4[0];
      for (; void 0 !== r7; ) {
        if (o9 === r7.index) {
          let i8;
          2 === r7.type ? i8 = new k(h3, h3.nextSibling, this, t6) : 1 === r7.type ? i8 = new r7.ctor(h3, r7.name, r7.strings, this, t6) : 6 === r7.type && (i8 = new Z(h3, this, t6)), this._$AV.push(i8), r7 = s4[++n6];
        }
        o9 !== (r7 == null ? void 0 : r7.index) && (h3 = P.nextNode(), o9++);
      }
      return P.currentNode = l2, e8;
    }
    p(t6) {
      let i7 = 0;
      for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t6, s4, i7), i7 += s4.strings.length - 2) : s4._$AI(t6[i7])), i7++;
    }
  };
  var k = class _k {
    get _$AU() {
      var _a8, _b2;
      return (_b2 = (_a8 = this._$AM) == null ? void 0 : _a8._$AU) != null ? _b2 : this._$Cv;
    }
    constructor(t6, i7, s4, e8) {
      var _a8;
      this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t6, this._$AB = i7, this._$AM = s4, this.options = e8, this._$Cv = (_a8 = e8 == null ? void 0 : e8.isConnected) != null ? _a8 : true;
    }
    get parentNode() {
      let t6 = this._$AA.parentNode;
      const i7 = this._$AM;
      return void 0 !== i7 && 11 === (t6 == null ? void 0 : t6.nodeType) && (t6 = i7.parentNode), t6;
    }
    get startNode() {
      return this._$AA;
    }
    get endNode() {
      return this._$AB;
    }
    _$AI(t6, i7 = this) {
      t6 = M(this, t6, i7), a2(t6) ? t6 === A || null == t6 || "" === t6 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t6 !== this._$AH && t6 !== E && this._(t6) : void 0 !== t6._$litType$ ? this.$(t6) : void 0 !== t6.nodeType ? this.T(t6) : d2(t6) ? this.k(t6) : this._(t6);
    }
    O(t6) {
      return this._$AA.parentNode.insertBefore(t6, this._$AB);
    }
    T(t6) {
      this._$AH !== t6 && (this._$AR(), this._$AH = this.O(t6));
    }
    _(t6) {
      this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t6 : this.T(l2.createTextNode(t6)), this._$AH = t6;
    }
    $(t6) {
      var _a8;
      const { values: i7, _$litType$: s4 } = t6, e8 = "number" == typeof s4 ? this._$AC(t6) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
      if (((_a8 = this._$AH) == null ? void 0 : _a8._$AD) === e8) this._$AH.p(i7);
      else {
        const t7 = new R(e8, this), s5 = t7.u(this.options);
        t7.p(i7), this.T(s5), this._$AH = t7;
      }
    }
    _$AC(t6) {
      let i7 = C.get(t6.strings);
      return void 0 === i7 && C.set(t6.strings, i7 = new S2(t6)), i7;
    }
    k(t6) {
      u2(this._$AH) || (this._$AH = [], this._$AR());
      const i7 = this._$AH;
      let s4, e8 = 0;
      for (const h3 of t6) e8 === i7.length ? i7.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i7[e8], s4._$AI(h3), e8++;
      e8 < i7.length && (this._$AR(s4 && s4._$AB.nextSibling, e8), i7.length = e8);
    }
    _$AR(t6 = this._$AA.nextSibling, s4) {
      var _a8;
      for ((_a8 = this._$AP) == null ? void 0 : _a8.call(this, false, true, s4); t6 !== this._$AB; ) {
        const s5 = i3(t6).nextSibling;
        i3(t6).remove(), t6 = s5;
      }
    }
    setConnected(t6) {
      var _a8;
      void 0 === this._$AM && (this._$Cv = t6, (_a8 = this._$AP) == null ? void 0 : _a8.call(this, t6));
    }
  };
  var H = class {
    get tagName() {
      return this.element.tagName;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    constructor(t6, i7, s4, e8, h3) {
      this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t6, this.name = i7, this._$AM = e8, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
    }
    _$AI(t6, i7 = this, s4, e8) {
      const h3 = this.strings;
      let o9 = false;
      if (void 0 === h3) t6 = M(this, t6, i7, 0), o9 = !a2(t6) || t6 !== this._$AH && t6 !== E, o9 && (this._$AH = t6);
      else {
        const e9 = t6;
        let n6, r7;
        for (t6 = h3[0], n6 = 0; n6 < h3.length - 1; n6++) r7 = M(this, e9[s4 + n6], i7, n6), r7 === E && (r7 = this._$AH[n6]), o9 || (o9 = !a2(r7) || r7 !== this._$AH[n6]), r7 === A ? t6 = A : t6 !== A && (t6 += (r7 != null ? r7 : "") + h3[n6 + 1]), this._$AH[n6] = r7;
      }
      o9 && !e8 && this.j(t6);
    }
    j(t6) {
      t6 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t6 != null ? t6 : "");
    }
  };
  var I = class extends H {
    constructor() {
      super(...arguments), this.type = 3;
    }
    j(t6) {
      this.element[this.name] = t6 === A ? void 0 : t6;
    }
  };
  var L = class extends H {
    constructor() {
      super(...arguments), this.type = 4;
    }
    j(t6) {
      this.element.toggleAttribute(this.name, !!t6 && t6 !== A);
    }
  };
  var z = class extends H {
    constructor(t6, i7, s4, e8, h3) {
      super(t6, i7, s4, e8, h3), this.type = 5;
    }
    _$AI(t6, i7 = this) {
      var _a8;
      if ((t6 = (_a8 = M(this, t6, i7, 0)) != null ? _a8 : A) === E) return;
      const s4 = this._$AH, e8 = t6 === A && s4 !== A || t6.capture !== s4.capture || t6.once !== s4.once || t6.passive !== s4.passive, h3 = t6 !== A && (s4 === A || e8);
      e8 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t6), this._$AH = t6;
    }
    handleEvent(t6) {
      var _a8, _b2;
      "function" == typeof this._$AH ? this._$AH.call((_b2 = (_a8 = this.options) == null ? void 0 : _a8.host) != null ? _b2 : this.element, t6) : this._$AH.handleEvent(t6);
    }
  };
  var Z = class {
    constructor(t6, i7, s4) {
      this.element = t6, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s4;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AI(t6) {
      M(this, t6);
    }
  };
  var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
  var B = t2.litHtmlPolyfillSupport;
  var _a3;
  B == null ? void 0 : B(S2, k), ((_a3 = t2.litHtmlVersions) != null ? _a3 : t2.litHtmlVersions = []).push("3.3.3");
  var D = (t6, i7, s4) => {
    var _a8, _b2;
    const e8 = (_a8 = s4 == null ? void 0 : s4.renderBefore) != null ? _a8 : i7;
    let h3 = e8._$litPart$;
    if (void 0 === h3) {
      const t7 = (_b2 = s4 == null ? void 0 : s4.renderBefore) != null ? _b2 : null;
      e8._$litPart$ = h3 = new k(i7.insertBefore(c3(), t7), t7, void 0, s4 != null ? s4 : {});
    }
    return h3._$AI(t6), h3;
  };

  // node_modules/lit-element/lit-element.js
  var s3 = globalThis;
  var i4 = class extends y {
    constructor() {
      super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
    }
    createRenderRoot() {
      var _a8, _b2;
      const t6 = super.createRenderRoot();
      return (_b2 = (_a8 = this.renderOptions).renderBefore) != null ? _b2 : _a8.renderBefore = t6.firstChild, t6;
    }
    update(t6) {
      const r7 = this.render();
      this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t6), this._$Do = D(r7, this.renderRoot, this.renderOptions);
    }
    connectedCallback() {
      var _a8;
      super.connectedCallback(), (_a8 = this._$Do) == null ? void 0 : _a8.setConnected(true);
    }
    disconnectedCallback() {
      var _a8;
      super.disconnectedCallback(), (_a8 = this._$Do) == null ? void 0 : _a8.setConnected(false);
    }
    render() {
      return E;
    }
  };
  var _a4;
  i4._$litElement$ = true, i4["finalized"] = true, (_a4 = s3.litElementHydrateSupport) == null ? void 0 : _a4.call(s3, { LitElement: i4 });
  var o4 = s3.litElementPolyfillSupport;
  o4 == null ? void 0 : o4({ LitElement: i4 });
  var _a5;
  ((_a5 = s3.litElementVersions) != null ? _a5 : s3.litElementVersions = []).push("4.2.2");

  // node_modules/lit-html/is-server.js
  var o5 = false;

  // node_modules/@lit/reactive-element/decorators/custom-element.js
  var t3 = (t6) => (e8, o9) => {
    void 0 !== o9 ? o9.addInitializer(() => {
      customElements.define(t6, e8);
    }) : customElements.define(t6, e8);
  };

  // node_modules/@lit/reactive-element/decorators/property.js
  var o6 = { attribute: true, type: String, converter: u, reflect: false, hasChanged: f };
  var r4 = (t6 = o6, e8, r7) => {
    const { kind: n6, metadata: i7 } = r7;
    let s4 = globalThis.litPropertyMetadata.get(i7);
    if (void 0 === s4 && globalThis.litPropertyMetadata.set(i7, s4 = /* @__PURE__ */ new Map()), "setter" === n6 && ((t6 = Object.create(t6)).wrapped = true), s4.set(r7.name, t6), "accessor" === n6) {
      const { name: o9 } = r7;
      return { set(r8) {
        const n7 = e8.get.call(this);
        e8.set.call(this, r8), this.requestUpdate(o9, n7, t6, true, r8);
      }, init(e9) {
        return void 0 !== e9 && this.C(o9, void 0, t6, e9), e9;
      } };
    }
    if ("setter" === n6) {
      const { name: o9 } = r7;
      return function(r8) {
        const n7 = this[o9];
        e8.call(this, r8), this.requestUpdate(o9, n7, t6, true, r8);
      };
    }
    throw Error("Unsupported decorator location: " + n6);
  };
  function n4(t6) {
    return (e8, o9) => "object" == typeof o9 ? r4(t6, e8, o9) : ((t7, e9, o10) => {
      const r7 = e9.hasOwnProperty(o10);
      return e9.constructor.createProperty(o10, t7), r7 ? Object.getOwnPropertyDescriptor(e9, o10) : void 0;
    })(t6, e8, o9);
  }

  // node_modules/@lit/reactive-element/decorators/state.js
  function r5(r7) {
    return n4({ ...r7, state: true, attribute: false });
  }

  // node_modules/@lit/reactive-element/decorators/base.js
  var e4 = (e8, t6, c5) => (c5.configurable = true, c5.enumerable = true, Reflect.decorate && "object" != typeof t6 && Object.defineProperty(e8, t6, c5), c5);

  // node_modules/@lit/reactive-element/decorators/query.js
  function e5(e8, r7) {
    return (n6, s4, i7) => {
      const o9 = (t6) => {
        var _a8, _b2;
        return (_b2 = (_a8 = t6.renderRoot) == null ? void 0 : _a8.querySelector(e8)) != null ? _b2 : null;
      };
      if (r7) {
        const { get: e9, set: r8 } = "object" == typeof s4 ? n6 : i7 != null ? i7 : /* @__PURE__ */ (() => {
          const t6 = /* @__PURE__ */ Symbol();
          return { get() {
            return this[t6];
          }, set(e10) {
            this[t6] = e10;
          } };
        })();
        return e4(n6, s4, { get() {
          let t6 = e9.call(this);
          return void 0 === t6 && (t6 = o9(this), (null !== t6 || this.hasUpdated) && r8.call(this, t6)), t6;
        } });
      }
      return e4(n6, s4, { get() {
        return o9(this);
      } });
    };
  }

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.AOKMSJXD.js
  var host_styles_default = i`
  :host {
    box-sizing: border-box;
  }

  :host *,
  :host *::before,
  :host *::after {
    box-sizing: inherit;
  }

  [hidden],
  :host([hidden]) {
    display: none !important;
  }
`;
  var HAS_ENDING_COLON = /;\s+$/;
  function camelToKebab(str) {
    return str.replace(/[A-Z]/g, (c5) => `-${c5.toLowerCase()}`);
  }
  function buildStyleAttribute(options) {
    const { property: property2, value, element } = options;
    if (value) {
      let style = element.getAttribute("style") || "";
      if (style) {
        if (!style.match(HAS_ENDING_COLON)) {
          style += ";";
        }
        style += " ";
      }
      const str = `${property2}: ${value}`;
      if (style.includes(str)) {
        return;
      }
      return `${style}${str};`;
    }
    return null;
  }
  var _hasRecordedInitialProperties;
  var WebAwesomeElement = class extends i4 {
    constructor() {
      super();
      __privateAdd(this, _hasRecordedInitialProperties, false);
      this.initialReflectedProperties = /* @__PURE__ */ new Map();
      this.didSSR = o5 || Boolean(this.shadowRoot);
      this.customStates = {
        /** Adds or removes the specified custom state. */
        set: (customState, active) => {
          var _a8;
          if (!Boolean((_a8 = this.internals) == null ? void 0 : _a8.states)) return;
          try {
            if (active) {
              this.internals.states.add(customState);
            } else {
              this.internals.states.delete(customState);
            }
          } catch (e8) {
            if (String(e8).includes("must start with '--'")) {
              console.error("Your browser implements an outdated version of CustomStateSet. Consider using a polyfill");
            } else {
              throw e8;
            }
          }
        },
        /** Determines whether or not the element currently has the specified state. */
        has: (customState) => {
          var _a8;
          if (!Boolean((_a8 = this.internals) == null ? void 0 : _a8.states)) return false;
          try {
            return this.internals.states.has(customState);
          } catch {
            return false;
          }
        }
      };
      try {
        this.internals = this.attachInternals();
      } catch {
        console.error("Element internals are not supported in your browser. Consider using a polyfill");
      }
      this.customStates.set("wa-defined", true);
      let Self = this.constructor;
      for (let [property2, spec] of Self.elementProperties) {
        if (spec.default === "inherit" && spec.initial !== void 0 && typeof property2 === "string") {
          this.customStates.set(`initial-${property2}-${spec.initial}`, true);
        }
      }
    }
    /** Prepends host styles to the component's styles. */
    static get styles() {
      const styles = Array.isArray(this.css) ? this.css : this.css ? [this.css] : [];
      return [host_styles_default, ...styles];
    }
    connectedCallback() {
      var _a8;
      super.connectedCallback();
      if (!this.didSSR) {
        (_a8 = this.shadowRoot) == null ? void 0 : _a8.prepend(
          document.createComment(
            ` Web Awesome: https://webawesome.com/docs/components/${this.localName.replace("wa-", "")} `
          )
        );
      }
      if (this.didSSR) {
        this.updateComplete.then(() => {
          var _a9;
          (_a9 = this.shadowRoot) == null ? void 0 : _a9.prepend(
            document.createComment(
              ` Web Awesome: https://webawesome.com/docs/components/${this.localName.replace("wa-", "")} `
            )
          );
        });
      }
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (!__privateGet(this, _hasRecordedInitialProperties)) {
        this.constructor.elementProperties.forEach(
          (obj, prop) => {
            if (obj.reflect && this[prop] != null) {
              this.initialReflectedProperties.set(prop, this[prop]);
            }
          }
        );
        __privateSet(this, _hasRecordedInitialProperties, true);
      }
      super.attributeChangedCallback(name, oldValue, newValue);
    }
    willUpdate(changedProperties) {
      super.willUpdate(changedProperties);
      this.initialReflectedProperties.forEach((value, prop) => {
        if (changedProperties.has(prop) && this[prop] == null) {
          this[prop] = value;
        }
      });
    }
    firstUpdated(changedProperties) {
      var _a8;
      super.firstUpdated(changedProperties);
      if (this.didSSR) {
        (_a8 = this.shadowRoot) == null ? void 0 : _a8.querySelectorAll("slot").forEach((slotElement) => {
          slotElement.dispatchEvent(new Event("slotchange", { bubbles: true, composed: false, cancelable: false }));
        });
      }
    }
    update(changedProperties) {
      try {
        super.update(changedProperties);
      } catch (e8) {
        if (this.didSSR && !this.hasUpdated) {
          const event = new Event("lit-hydration-error", { bubbles: true, composed: true, cancelable: false });
          event.error = e8;
          this.dispatchEvent(event);
        }
        throw e8;
      }
    }
    /**
     * @internal
     * Internal way to set styles across both client and server
     */
    setStyle(property2, value) {
      if (!this.style) {
        const str = buildStyleAttribute({
          // because this is going to be serialized to an HTML style attribute, need to transform the casing.
          property: camelToKebab(property2),
          value,
          element: this
        });
        if (str) {
          this.setAttribute("style", str);
        }
        return;
      }
      this.style[property2] = value;
    }
    /**
     * @internal
     * Internal way to set a CSS custom property across both client and server.
     */
    setStyleProperty(property2, value) {
      if (!this.style) {
        const str = buildStyleAttribute({
          // because this is going to be serialized to an HTML style attribute, need to transform the casing.
          property: property2,
          value,
          element: this
        });
        if (str) {
          this.setAttribute("style", str);
        }
        return;
      }
      this.style.setProperty(property2, value);
    }
    /**
     * @internal Given a native event, this function cancels it and dispatches it again from the host element using the desired
     * event options.
     */
    relayNativeEvent(event, eventOptions) {
      event.stopImmediatePropagation();
      this.dispatchEvent(
        new event.constructor(event.type, {
          ...event,
          ...eventOptions
        })
      );
    }
  };
  _hasRecordedInitialProperties = /* @__PURE__ */ new WeakMap();
  __decorateClass([
    n4()
  ], WebAwesomeElement.prototype, "dir", 2);
  __decorateClass([
    n4()
  ], WebAwesomeElement.prototype, "lang", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true, attribute: "did-ssr" })
  ], WebAwesomeElement.prototype, "didSSR", 2);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.KBXNFZQL.js
  var CustomErrorValidator = () => {
    return {
      observedAttributes: ["custom-error"],
      checkValidity(element) {
        const validity = {
          message: "",
          isValid: true,
          invalidKeys: []
        };
        if (element.customError) {
          validity.message = element.customError;
          validity.isValid = false;
          validity.invalidKeys = ["customError"];
        }
        return validity;
      }
    };
  };
  var WebAwesomeFormAssociatedElement = class extends WebAwesomeElement {
    constructor() {
      super();
      this.name = null;
      this.disabled = false;
      this.required = false;
      this.assumeInteractionOn = ["input"];
      this.validators = [];
      this.valueHasChanged = false;
      this.hasInteracted = false;
      this.customError = null;
      this.emittedEvents = [];
      this.emitInvalid = (e8) => {
        if (e8.target !== this) return;
        this.hasInteracted = true;
        this.dispatchEvent(new WaInvalidEvent());
      };
      this.handleInteraction = (event) => {
        var _a8;
        const emittedEvents = this.emittedEvents;
        if (!emittedEvents.includes(event.type)) {
          emittedEvents.push(event.type);
        }
        if (emittedEvents.length === ((_a8 = this.assumeInteractionOn) == null ? void 0 : _a8.length)) {
          this.hasInteracted = true;
        }
      };
      if ("addEventListener" in this) {
        this.addEventListener("invalid", this.emitInvalid);
      }
    }
    /**
     * Validators are static because they have `observedAttributes`, essentially attributes to "watch"
     * for changes. Whenever these attributes change, we want to be notified and update the validator.
     */
    static get validators() {
      return o5 ? [] : [CustomErrorValidator()];
    }
    // Append all Validator "observedAttributes" into the "observedAttributes" so they can run.
    static get observedAttributes() {
      const parentAttrs = new Set(super.observedAttributes || []);
      for (const validator of this.validators) {
        if (!validator.observedAttributes) {
          continue;
        }
        for (const attr of validator.observedAttributes) {
          parentAttrs.add(attr);
        }
      }
      return [...parentAttrs];
    }
    connectedCallback() {
      super.connectedCallback();
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.updateValidity();
        });
      } else {
        this.updateValidity();
      }
      this.assumeInteractionOn.forEach((event) => {
        var _a8;
        (_a8 = this.addEventListener) == null ? void 0 : _a8.call(this, event, this.handleInteraction);
      });
    }
    firstUpdated(...args) {
      super.firstUpdated(...args);
      this.updateValidity();
    }
    willUpdate(changedProperties) {
      if (!o5 && changedProperties.has("customError")) {
        if (!this.customError) {
          this.customError = null;
        }
        this.setCustomValidity(this.customError || "");
      }
      if (changedProperties.has("value") || changedProperties.has("disabled") || changedProperties.has("defaultValue")) {
        const value = this.value;
        this.updateFormValue(value);
      }
      if (changedProperties.has("disabled")) {
        this.customStates.set("disabled", this.disabled);
        if (this.hasAttribute("disabled") || !o5 && !this.matches(":disabled")) {
          this.toggleAttribute("disabled", this.disabled);
        }
      }
      super.willUpdate(changedProperties);
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => this.updateValidity());
      } else {
        this.updateValidity();
      }
    }
    /**
     * @internal
     */
    updateFormValue(value) {
      if (Array.isArray(value)) {
        if (this.name) {
          const formData = new FormData();
          for (const val of value) {
            formData.append(this.name, val);
          }
          this.setValue(formData, formData);
        }
      } else {
        this.setValue(value, value);
      }
    }
    get labels() {
      return this.internals.labels;
    }
    getForm() {
      return this.internals.form;
    }
    /**
     * By default, form controls are associated with the nearest containing `<form>` element. This attribute allows you
     * to place the form control outside of a form and associate it with the form that has this `id`. The form must be in
     * the same document or shadow root for this to work.
     */
    set form(val) {
      if (val) {
        this.setAttribute("form", val);
      } else {
        this.removeAttribute("form");
      }
    }
    get form() {
      return this.internals.form;
    }
    get validity() {
      return this.internals.validity;
    }
    // Not sure if this supports `novalidate`. Will need to test.
    get willValidate() {
      return this.internals.willValidate;
    }
    get validationMessage() {
      return this.internals.validationMessage;
    }
    checkValidity() {
      this.updateValidity();
      return this.internals.checkValidity();
    }
    reportValidity() {
      this.updateValidity();
      this.hasInteracted = true;
      return this.internals.reportValidity();
    }
    /**
     * Override this to change where constraint validation popups are anchored.
     */
    get validationTarget() {
      return this.input || void 0;
    }
    setValidity(...args) {
      const flags = args[0];
      const message = args[1];
      let anchor = args[2];
      if (!anchor) {
        anchor = this.validationTarget;
      }
      this.internals.setValidity(flags, message, anchor || void 0);
      this.requestUpdate("validity");
      this.setCustomStates();
    }
    setCustomStates() {
      const required = Boolean(this.required);
      const isValid = this.internals.validity.valid;
      const hasInteracted = this.hasInteracted;
      this.customStates.set("required", required);
      this.customStates.set("optional", !required);
      this.customStates.set("invalid", !isValid);
      this.customStates.set("valid", isValid);
      this.customStates.set("user-invalid", !isValid && hasInteracted);
      this.customStates.set("user-valid", isValid && hasInteracted);
    }
    /**
     * Do not use this when creating a "Validator". This is intended for end users of components.
     * We track manually defined custom errors so we don't clear them on accident in our validators.
     *
     */
    setCustomValidity(message) {
      if (!message) {
        this.customError = null;
        this.setValidity({});
        return;
      }
      this.customError = message;
      this.setValidity({ customError: true }, message, this.validationTarget);
    }
    formResetCallback() {
      this.resetValidity();
      this.hasInteracted = false;
      this.valueHasChanged = false;
      this.emittedEvents = [];
      this.updateValidity();
    }
    formDisabledCallback(isDisabled) {
      this.disabled = isDisabled;
      this.updateValidity();
    }
    /**
     * Called when the browser is trying to restore element’s state to state in which case reason is "restore", or when
     * the browser is trying to fulfill autofill on behalf of user in which case reason is "autocomplete". In the case of
     * "restore", state is a string, File, or FormData object previously set as the second argument to setFormValue.
     */
    formStateRestoreCallback(state, reason) {
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.value = state;
          if (reason === "restore") {
            this.resetValidity();
          }
          this.updateValidity();
        });
      } else {
        this.value = state;
        if (reason === "restore") {
          this.resetValidity();
        }
        this.updateValidity();
      }
    }
    setValue(...args) {
      const [value, state] = args;
      this.internals.setFormValue(value, state);
    }
    get allValidators() {
      const staticValidators = this.constructor.validators || [];
      const validators = this.validators || [];
      return [...staticValidators, ...validators];
    }
    /**
     * Reset validity is a way of removing manual custom errors and native validation.
     */
    resetValidity() {
      this.setCustomValidity("");
      this.setValidity({});
    }
    updateValidity() {
      if (this.disabled || this.hasAttribute("disabled") || !this.willValidate) {
        this.resetValidity();
        return;
      }
      const validators = this.allValidators;
      if (!(validators == null ? void 0 : validators.length)) {
        return;
      }
      const flags = {
        // Don't trust custom errors from the Browser. Safari breaks the spec.
        customError: Boolean(this.customError)
      };
      const formControl = this.validationTarget || this.input || void 0;
      let finalMessage = "";
      for (const validator of validators) {
        const { isValid, message, invalidKeys } = validator.checkValidity(this);
        if (isValid) {
          continue;
        }
        if (!finalMessage) {
          finalMessage = message;
        }
        if ((invalidKeys == null ? void 0 : invalidKeys.length) >= 0) {
          invalidKeys.forEach((str) => flags[str] = true);
        }
      }
      if (!finalMessage) {
        finalMessage = this.validationMessage;
      }
      this.setValidity(flags, finalMessage, formControl);
    }
  };
  WebAwesomeFormAssociatedElement.formAssociated = true;
  __decorateClass([
    n4({ reflect: true })
  ], WebAwesomeFormAssociatedElement.prototype, "name", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WebAwesomeFormAssociatedElement.prototype, "disabled", 2);
  __decorateClass([
    n4({ state: true, attribute: false })
  ], WebAwesomeFormAssociatedElement.prototype, "valueHasChanged", 2);
  __decorateClass([
    n4({ state: true, attribute: false })
  ], WebAwesomeFormAssociatedElement.prototype, "hasInteracted", 2);
  __decorateClass([
    n4({ attribute: "custom-error", reflect: true })
  ], WebAwesomeFormAssociatedElement.prototype, "customError", 2);
  __decorateClass([
    n4({ attribute: false, state: true, type: Object })
  ], WebAwesomeFormAssociatedElement.prototype, "validity", 1);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.RPQJAXXR.js
  var DEPRECATION_MAP = {
    small: "s",
    medium: "m",
    large: "l"
  };
  var warned = /* @__PURE__ */ new Set();
  function warnDeprecatedSize(tagName, value) {
    if (value in DEPRECATION_MAP && !warned.has(`${tagName}:${value}`)) {
      warned.add(`${tagName}:${value}`);
      console.warn(
        `[${tagName}] size="${value}" is deprecated. Use size="${DEPRECATION_MAP[value]}" instead. The long-form value will be removed in the next major version.`
      );
    }
  }

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.RWNXKUCF.js
  var HasSlotController = class {
    constructor(host, ...slotNames) {
      this.slotNames = [];
      this.handleSlotChange = (event) => {
        const slot = event.target;
        if (this.slotNames.includes("[default]") && !slot.name || slot.name && this.slotNames.includes(slot.name)) {
          this.host.requestUpdate();
        }
      };
      (this.host = host).addController(this);
      this.slotNames = slotNames;
    }
    hasDefaultSlot() {
      if (!this.host.childNodes) {
        return false;
      }
      return [...this.host.childNodes].some((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") {
          return true;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el2 = node;
          const tagName = el2.tagName.toLowerCase();
          if (tagName === "wa-visually-hidden") {
            return false;
          }
          if (!el2.hasAttribute("slot")) {
            return true;
          }
        }
        return false;
      });
    }
    hasNamedSlot(name) {
      var _a8, _b2;
      return ((_b2 = (_a8 = this.host).querySelector) == null ? void 0 : _b2.call(_a8, `:scope > [slot="${name}"]`)) !== null;
    }
    /**
     * @param slotName     - Name of the slot to look for
     * @param propertyName - Generally we infer via `withHeader` property on the host, but in cases where its different, you can specify a manual property name.
     */
    test(slotName, propertyName) {
      if (propertyName && this.host.didSSR && !this.host.hasUpdated) {
        return Boolean(this.host[propertyName]);
      }
      return slotName === "[default]" ? this.hasDefaultSlot() : this.hasNamedSlot(slotName);
    }
    hostConnected() {
      const shadowRoot = this.host.shadowRoot;
      if (shadowRoot && "addEventListener" in shadowRoot) {
        shadowRoot.addEventListener("slotchange", this.handleSlotChange);
      }
    }
    hostDisconnected() {
      const shadowRoot = this.host.shadowRoot;
      if (shadowRoot && "removeEventListener" in shadowRoot) {
        shadowRoot.removeEventListener("slotchange", this.handleSlotChange);
      }
    }
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.G5ZZIGWB.js
  var size_styles_default = i`
  :host([size='xs']) {
    font-size: var(--wa-font-size-xs);
  }

  :host([size='s']),
  :host([size='small']) {
    font-size: var(--wa-font-size-s);
  }

  :host([size='m']),
  :host([size='medium']) {
    font-size: var(--wa-font-size-m);
  }

  :host([size='l']),
  :host([size='large']) {
    font-size: var(--wa-font-size-l);
  }

  :host([size='xl']) {
    font-size: var(--wa-font-size-xl);
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.S35PLDPD.js
  var button_styles_default = i`
  @layer wa-component {
    :host {
      display: inline-block;

      /* Workaround because Chrome doesn't like :host(:has()) below
       * https://issues.chromium.org/issues/40062355
       * Firefox doesn't like this nested rule, so both are needed */
      &:has(wa-badge) {
        position: relative;
      }
    }

    /* Apply relative positioning only when needed to position wa-badge
     * This avoids creating a new stacking context for every button */
    :host(:has(wa-badge)) {
      position: relative;
    }
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
    vertical-align: middle;
    transition-property: background, border, box-shadow, color, opacity, transform;
    transition-duration: var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    transform-origin: center;
    cursor: pointer;
    padding: 0 var(--wa-form-control-padding-inline);
    font-family: inherit;
    font-size: inherit;
    font-weight: var(--wa-font-weight-action);
    height: var(--wa-form-control-height);
    width: 100%;

    background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));

    border-color: transparent;
    color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-form-control-border-radius));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-form-control-border-radius));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-form-control-border-radius));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-form-control-border-radius));
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
  }

  /* Hover and active transforms */
  .button:not(.disabled):not(.loading) {
    @media (hover: hover) {
      &:hover {
        transform: var(--wa-button-transform-hover);
      }
    }
    &:active {
      transform: var(--wa-button-transform-active);
    }

    @media (prefers-reduced-motion: reduce) {
      &:hover,
      &:active {
        transform: none;
      }
    }
  }

  /* Appearance modifiers */
  :host([appearance='plain']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: var(--wa-color-border-loud, var(--wa-color-neutral-border-loud));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled-outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='accent']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
      background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
        var(--wa-color-mix-active)
      );
    }
  }

  /* Focus states */
  .button:focus {
    outline: none;
  }

  .button:focus-visible {
    outline: var(--wa-focus-ring);
    outline-offset: var(--wa-focus-ring-offset);
  }

  /* Disabled state */
  :host([disabled]) {
    opacity: 0.5;
    cursor: not-allowed;

    /* When disabled, prevent mouse events from bubbling up from children */
    .button {
      pointer-events: none;
    }
  }

  /* Keep it last so Safari doesn't stop parsing this block */
  .button::-moz-focus-inner {
    border: 0;
  }

  /* Icon buttons */
  .button.is-icon-button {
    outline-offset: 2px;
    width: var(--wa-form-control-height);
    aspect-ratio: 1;
  }

  /* Icon buttons with a caret need to grow to fit both the icon and the caret */
  .button.is-icon-button.caret {
    width: auto;
    aspect-ratio: auto;
    min-width: var(--wa-form-control-height);
  }

  /* Pill modifier */
  :host([pill]) .button {
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-border-radius-pill));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-border-radius-pill));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-border-radius-pill));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-border-radius-pill));
  }

  /*
   * Label
   */

  .start,
  .end {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .label {
    display: inline-block;
  }

  .is-icon-button .label {
    display: flex;
    justify-content: center;
  }

  .label::slotted(wa-icon) {
    align-self: center;
  }

  /*
   * Caret modifier
   */

  wa-icon[part='caret'] {
    display: flex;
    align-self: center;
    align-items: center;

    &::part(svg) {
      width: 0.875em;
      height: 0.875em;
    }

    .button:has(&) .end {
      display: none;
    }
  }

  /*
   * Loading modifier
   */

  .loading {
    position: relative;
    cursor: wait;

    .start,
    .label,
    .end,
    .caret {
      /* Hidden with opacity, not visibility, so the label stays in the accessibility tree */
      opacity: 0;

      /* Unlike visibility: hidden, opacity leaves the content clickable */
      pointer-events: none;
    }

    wa-spinner {
      --indicator-color: currentColor;
      --track-color: color-mix(in oklab, currentColor, transparent 90%);

      position: absolute;
      font-size: 1em;
      height: 1em;
      width: 1em;
      top: calc(50% - 0.5em);
      left: calc(50% - 0.5em);
    }
  }

  /*
   * Badges
   */

  .button ::slotted(wa-badge) {
    border-color: var(--wa-color-surface-default);
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    translate: 50% -50%;
    pointer-events: none;
  }

  :host(:dir(rtl)) ::slotted(wa-badge) {
    translate: -50% -50%;
  }

  /*
  * Button spacing
  */

  slot[name='start']::slotted(*) {
    margin-inline-end: 0.75em;
  }

  slot[name='end']::slotted(*),
  .button:not(.visually-hidden-label) [part='caret'] {
    margin-inline-start: 0.75em;
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.XNTP7DEQ.js
  var variants_styles_default = i`
  :where(:root),
  .wa-neutral,
  :host([variant='neutral']) {
    --wa-color-fill-loud: var(--wa-color-neutral-fill-loud);
    --wa-color-fill-normal: var(--wa-color-neutral-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-neutral-fill-quiet);
    --wa-color-border-loud: var(--wa-color-neutral-border-loud);
    --wa-color-border-normal: var(--wa-color-neutral-border-normal);
    --wa-color-border-quiet: var(--wa-color-neutral-border-quiet);
    --wa-color-on-loud: var(--wa-color-neutral-on-loud);
    --wa-color-on-normal: var(--wa-color-neutral-on-normal);
    --wa-color-on-quiet: var(--wa-color-neutral-on-quiet);
  }

  .wa-brand,
  :host([variant='brand']) {
    --wa-color-fill-loud: var(--wa-color-brand-fill-loud);
    --wa-color-fill-normal: var(--wa-color-brand-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-brand-fill-quiet);
    --wa-color-border-loud: var(--wa-color-brand-border-loud);
    --wa-color-border-normal: var(--wa-color-brand-border-normal);
    --wa-color-border-quiet: var(--wa-color-brand-border-quiet);
    --wa-color-on-loud: var(--wa-color-brand-on-loud);
    --wa-color-on-normal: var(--wa-color-brand-on-normal);
    --wa-color-on-quiet: var(--wa-color-brand-on-quiet);
  }

  .wa-success,
  :host([variant='success']) {
    --wa-color-fill-loud: var(--wa-color-success-fill-loud);
    --wa-color-fill-normal: var(--wa-color-success-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-success-fill-quiet);
    --wa-color-border-loud: var(--wa-color-success-border-loud);
    --wa-color-border-normal: var(--wa-color-success-border-normal);
    --wa-color-border-quiet: var(--wa-color-success-border-quiet);
    --wa-color-on-loud: var(--wa-color-success-on-loud);
    --wa-color-on-normal: var(--wa-color-success-on-normal);
    --wa-color-on-quiet: var(--wa-color-success-on-quiet);
  }

  .wa-warning,
  :host([variant='warning']) {
    --wa-color-fill-loud: var(--wa-color-warning-fill-loud);
    --wa-color-fill-normal: var(--wa-color-warning-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-warning-fill-quiet);
    --wa-color-border-loud: var(--wa-color-warning-border-loud);
    --wa-color-border-normal: var(--wa-color-warning-border-normal);
    --wa-color-border-quiet: var(--wa-color-warning-border-quiet);
    --wa-color-on-loud: var(--wa-color-warning-on-loud);
    --wa-color-on-normal: var(--wa-color-warning-on-normal);
    --wa-color-on-quiet: var(--wa-color-warning-on-quiet);
  }

  .wa-danger,
  :host([variant='danger']) {
    --wa-color-fill-loud: var(--wa-color-danger-fill-loud);
    --wa-color-fill-normal: var(--wa-color-danger-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-danger-fill-quiet);
    --wa-color-border-loud: var(--wa-color-danger-border-loud);
    --wa-color-border-normal: var(--wa-color-danger-border-normal);
    --wa-color-border-quiet: var(--wa-color-danger-border-quiet);
    --wa-color-on-loud: var(--wa-color-danger-on-loud);
    --wa-color-on-normal: var(--wa-color-danger-on-normal);
    --wa-color-on-quiet: var(--wa-color-danger-on-quiet);
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.PZAN6FPN.js
  function watch(propertyName, options) {
    const resolvedOptions = {
      waitUntilFirstUpdate: false,
      ...options
    };
    return (proto, decoratedFnName) => {
      const { update: update2 } = proto;
      const watchedProperties = Array.isArray(propertyName) ? propertyName : [propertyName];
      proto.update = function(changedProps) {
        watchedProperties.forEach((property) => {
          const key = property;
          if (changedProps.has(key)) {
            const oldValue = changedProps.get(key);
            const newValue = this[key];
            if (oldValue !== newValue) {
              if (!resolvedOptions.waitUntilFirstUpdate || this.hasUpdated) {
                this[decoratedFnName](oldValue, newValue);
              }
            }
          }
        });
        update2.call(this, changedProps);
      };
    };
  }

  // node_modules/@shoelace-style/localize/dist/index.js
  var connectedElements = /* @__PURE__ */ new Set();
  var translations = /* @__PURE__ */ new Map();
  var fallback;
  var documentDirection = "ltr";
  var documentLanguage = "en";
  var isClient = typeof MutationObserver !== "undefined" && typeof document !== "undefined" && typeof document.documentElement !== "undefined";
  if (isClient) {
    const documentElementObserver = new MutationObserver(update);
    documentDirection = document.documentElement.dir || "ltr";
    documentLanguage = document.documentElement.lang || navigator.language;
    documentElementObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dir", "lang"]
    });
  }
  function registerTranslation(...translation2) {
    translation2.map((t6) => {
      const code = t6.$code.toLowerCase();
      if (translations.has(code)) {
        translations.set(code, Object.assign(Object.assign({}, translations.get(code)), t6));
      } else {
        translations.set(code, t6);
      }
      if (!fallback) {
        fallback = t6;
      }
    });
    update();
  }
  function update() {
    if (isClient) {
      documentDirection = document.documentElement.dir || "ltr";
      documentLanguage = document.documentElement.lang || navigator.language;
    }
    [...connectedElements.keys()].map((el2) => {
      if (typeof el2.requestUpdate === "function") {
        el2.requestUpdate();
      }
    });
  }
  var LocalizeController = class {
    constructor(host) {
      this.host = host;
      this.host.addController(this);
    }
    hostConnected() {
      connectedElements.add(this.host);
    }
    hostDisconnected() {
      connectedElements.delete(this.host);
    }
    dir() {
      return `${this.host.dir || documentDirection}`.toLowerCase();
    }
    lang() {
      const lang = `${this.host.lang || documentLanguage}`.toLowerCase().replace(/_/g, "-");
      try {
        new Intl.Locale(lang);
        return lang;
      } catch (_a8) {
        return fallback ? fallback.$code.toLowerCase() : "en";
      }
    }
    getTranslationData(lang) {
      var _a8, _b2;
      let locale;
      try {
        locale = new Intl.Locale(lang.replace(/_/g, "-"));
      } catch (_c) {
        return { locale: void 0, language: "", region: "", primary: void 0, secondary: void 0 };
      }
      const language = locale.language.toLowerCase();
      const region = (_b2 = (_a8 = locale.region) === null || _a8 === void 0 ? void 0 : _a8.toLowerCase()) !== null && _b2 !== void 0 ? _b2 : "";
      const primary = translations.get(`${language}-${region}`);
      const secondary = translations.get(language);
      return { locale, language, region, primary, secondary };
    }
    exists(key, options) {
      var _a8;
      const { primary, secondary } = this.getTranslationData((_a8 = options.lang) !== null && _a8 !== void 0 ? _a8 : this.lang());
      options = Object.assign({ includeFallback: false }, options);
      if (primary && primary[key] || secondary && secondary[key] || options.includeFallback && fallback && fallback[key]) {
        return true;
      }
      return false;
    }
    term(key, ...args) {
      const { primary, secondary } = this.getTranslationData(this.lang());
      let term;
      if (primary && primary[key]) {
        term = primary[key];
      } else if (secondary && secondary[key]) {
        term = secondary[key];
      } else if (fallback && fallback[key]) {
        term = fallback[key];
      } else {
        console.error(`No translation found for: ${String(key)}`);
        return String(key);
      }
      if (typeof term === "function") {
        return term(...args);
      }
      return term;
    }
    date(dateToFormat, options) {
      dateToFormat = new Date(dateToFormat);
      return new Intl.DateTimeFormat(this.lang(), options).format(dateToFormat);
    }
    number(numberToFormat, options) {
      numberToFormat = Number(numberToFormat);
      return isNaN(numberToFormat) ? "" : new Intl.NumberFormat(this.lang(), options).format(numberToFormat);
    }
    relativeTime(value, unit, options) {
      return new Intl.RelativeTimeFormat(this.lang(), options).format(value, unit);
    }
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.KQHZRDPB.js
  var translation = {
    $code: "en",
    $name: "English",
    $dir: "ltr",
    am: "AM",
    autosizeColumn: "Autosize column",
    captions: "Captions",
    carousel: "Carousel",
    chooseDate: "Choose date",
    chooseDecade: "Choose decade",
    chooseMonth: "Choose month",
    chooseTime: "Choose time",
    chooseYear: "Choose year",
    clearEntry: "Clear entry",
    clearFilter: "Clear filter",
    clearSort: "Clear sort",
    close: "Close",
    closeCalendar: "Close calendar",
    closeTimeInput: "Close time picker",
    collapseRow: "Collapse row",
    columnMenu: "Column options",
    columnMovedToPosition: (label, position, total) => `${label} moved to position ${position} of ${total}`,
    columns: "Columns",
    compactPageXOfY: (page, total) => `${page} of ${total}`,
    copied: "Copied",
    copy: "Copy",
    createOption: (value) => `Create "${value}"`,
    currentlyPlaying: "currently playing",
    currentValue: "Current value",
    date: "Date",
    datePickerKeyboardHelp: "Use arrow keys to change values; press Alt+Down Arrow to open the calendar.",
    day: "Day",
    dayPeriod: "AM/PM",
    decrement: "Decrement",
    deselectAllRows: "Deselect all rows",
    dropFileHere: "Drop file here or click to browse",
    dropFilesHere: "Drop files here or click to browse",
    empty: "Empty",
    endDate: "End date",
    enterFullscreen: "Enter fullscreen",
    error: "Error",
    exitFullscreen: "Exit fullscreen",
    expandRow: "Expand row",
    filterByColumn: (label) => `Filter by ${label}`,
    filterFrom: "From",
    filterMax: "Max",
    filterMin: "Min",
    filterTo: "To",
    firstPage: "First page",
    goToSlide: (slide, count) => `Go to slide ${slide} of ${count}`,
    hideColumn: "Hide column",
    hidePassword: "Hide password",
    hour: "Hour",
    incompleteDate: "Enter a valid date.",
    increment: "Increment",
    jumpBackwardX: (count) => `Jump back ${count} pages`,
    jumpForwardX: (count) => `Jump forward ${count} pages`,
    lastPage: "Last page",
    loading: "Loading",
    minute: "Minute",
    month: "Month",
    moreOptions: "More Options",
    mute: "Mute",
    nextDecade: "Next decade",
    nextMonth: "Next month",
    nextPage: "Next page",
    nextSlide: "Next slide",
    nextVideo: "Next Video",
    nextYear: "Next year",
    noData: "No data",
    noResults: "No matching results",
    now: "Now",
    numCharacters: (num) => {
      if (num === 1) return "1 character";
      return `${num} characters`;
    },
    numCharactersRemaining: (num) => {
      if (num === 1) return "1 character remaining";
      return `${num} characters remaining`;
    },
    numOptionsSelected: (num) => {
      if (num === 0) return "No options selected";
      if (num === 1) return "1 option selected";
      return `${num} options selected`;
    },
    numRowsCopied: (num) => num === 1 ? "1 row copied" : `${num} rows copied`,
    numRowsSelected: (num) => num === 1 ? "1 row selected" : `${num} rows selected`,
    pageXOfY: (page, total) => `Page ${page} of ${total}`,
    pagination: "Pagination",
    pause: "Pause",
    pauseAnimation: "Pause animation",
    pictureInPicture: "Picture in picture",
    pinLeft: "Pin left",
    pinRight: "Pin right",
    play: "Play",
    playAnimation: "Play animation",
    playbackSpeed: "Playback speed",
    playlist: "Playlist",
    pm: "PM",
    previousDecade: "Previous decade",
    previousMonth: "Previous month",
    previousPage: "Previous page",
    previousSlide: "Previous slide",
    previousVideo: "Previous video",
    previousYear: "Previous year",
    progress: "Progress",
    rangeTooLong: (max) => {
      if (max === 1) return "Select a range no longer than 1 day";
      return `Select a range no longer than ${max} days`;
    },
    rangeTooShort: (min) => {
      if (min === 1) return "Select a range at least 1 day long";
      return `Select a range at least ${min} days long`;
    },
    readonly: "Read-only",
    remove: "Remove",
    resetColumns: "Reset columns",
    resize: "Resize",
    resizeColumn: "Resize column",
    rowsPerPage: "Rows per page",
    scrollableRegion: "Scrollable region",
    scrollToEnd: "Scroll to end",
    scrollToStart: "Scroll to start",
    search: "Search",
    second: "Second",
    seek: "Seek",
    seekProgress: (current, duration) => `${current} of ${duration}`,
    selectAColorFromTheScreen: "Select a color from the screen",
    selectAllRows: "Select all rows",
    selected: "Selected",
    selectedDateLabel: (date) => `Selected: ${date}`,
    selectedRangeLabel: (range) => `Selected range: ${range}`,
    selectGroup: "Select group",
    selectionCleared: "Selection cleared",
    selectRow: "Select row",
    showingNofMRows: (shown, total) => `Showing ${shown} of ${total} rows`,
    showingXtoYofZ: (start, end, total) => `${start}\u2013${end} of ${total}`,
    showPassword: "Show password",
    slideNum: (slide) => `Slide ${slide}`,
    sortAscending: "Sort ascending",
    sortColumn: "Sort column",
    sortDescending: "Sort descending",
    startDate: "Start date",
    time: "Time",
    timeInputKeyboardHelp: "Use arrow keys to change values; press Alt+Down Arrow to open the time picker.",
    today: "Today",
    toggleColorFormat: "Toggle color format",
    unmute: "Unmute",
    unpin: "Unpin",
    unpinColumn: "Unpin column",
    videoPlayer: "Video player",
    volume: "Volume",
    year: "Year",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out"
  };
  registerTranslation(translation);
  var en_default = translation;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.56IHH3HP.js
  var LocalizeController2 = class extends LocalizeController {
    lang() {
      if (this.host.didSSR && !this.host.hasUpdated) {
        return this.host.lang || "en";
      }
      return super.lang();
    }
  };
  registerTranslation(en_default);

  // node_modules/lit-html/directive.js
  var t4 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
  var e6 = (t6) => (...e8) => ({ _$litDirective$: t6, values: e8 });
  var i5 = class {
    constructor(t6) {
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AT(t6, e8, i7) {
      this._$Ct = t6, this._$AM = e8, this._$Ci = i7;
    }
    _$AS(t6, e8) {
      return this.update(t6, e8);
    }
    update(t6, e8) {
      return this.render(...e8);
    }
  };

  // node_modules/lit-html/directives/class-map.js
  var e7 = e6(class extends i5 {
    constructor(t6) {
      var _a8;
      if (super(t6), t6.type !== t4.ATTRIBUTE || "class" !== t6.name || ((_a8 = t6.strings) == null ? void 0 : _a8.length) > 2) throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.");
    }
    render(t6) {
      return " " + Object.keys(t6).filter((s4) => t6[s4]).join(" ") + " ";
    }
    update(s4, [i7]) {
      var _a8, _b2;
      if (void 0 === this.st) {
        this.st = /* @__PURE__ */ new Set(), void 0 !== s4.strings && (this.nt = new Set(s4.strings.join(" ").split(/\s/).filter((t6) => "" !== t6)));
        for (const t6 in i7) i7[t6] && !((_a8 = this.nt) == null ? void 0 : _a8.has(t6)) && this.st.add(t6);
        return this.render(i7);
      }
      const r7 = s4.element.classList;
      for (const t6 of this.st) t6 in i7 || (r7.remove(t6), this.st.delete(t6));
      for (const t6 in i7) {
        const s5 = !!i7[t6];
        s5 === this.st.has(t6) || ((_b2 = this.nt) == null ? void 0 : _b2.has(t6)) || (s5 ? (r7.add(t6), this.st.add(t6)) : (r7.remove(t6), this.st.delete(t6)));
      }
      return E;
    }
  });

  // node_modules/lit-html/directives/if-defined.js
  var o7 = (o9) => o9 != null ? o9 : A;

  // node_modules/lit-html/static.js
  var a3 = /* @__PURE__ */ Symbol.for("");
  var o8 = (t6) => {
    if ((t6 == null ? void 0 : t6.r) === a3) return t6 == null ? void 0 : t6._$litStatic$;
  };
  var i6 = (t6, ...r7) => ({ _$litStatic$: r7.reduce((r8, e8, a4) => r8 + ((t7) => {
    if (void 0 !== t7._$litStatic$) return t7._$litStatic$;
    throw Error(`Value passed to 'literal' function must be a 'literal' result: ${t7}. Use 'unsafeStatic' to pass non-literal values, but
            take care to ensure page security.`);
  })(e8) + t6[a4 + 1], t6[0]), r: a3 });
  var l3 = /* @__PURE__ */ new Map();
  var n5 = (t6) => (r7, ...e8) => {
    const a4 = e8.length;
    let s4, i7;
    const n6 = [], u4 = [];
    let c5, $3 = 0, f3 = false;
    for (; $3 < a4; ) {
      for (c5 = r7[$3]; $3 < a4 && void 0 !== (i7 = e8[$3], s4 = o8(i7)); ) c5 += s4 + r7[++$3], f3 = true;
      $3 !== a4 && u4.push(i7), n6.push(c5), $3++;
    }
    if ($3 === a4 && n6.push(r7[a4]), f3) {
      const t7 = n6.join("$$lit$$");
      void 0 === (r7 = l3.get(t7)) && (n6.raw = n6, l3.set(t7, r7 = n6)), e8 = u4;
    }
    return t6(r7, ...e8);
  };
  var u3 = n5(b2);
  var c4 = n5(w);
  var $2 = n5(T);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.5PQVPZTW.js
  var WaButton = class extends WebAwesomeFormAssociatedElement {
    constructor() {
      super(...arguments);
      this.assumeInteractionOn = ["click"];
      this.hasSlotController = new HasSlotController(this, "[default]", "start", "end");
      this.localize = new LocalizeController2(this);
      this.invalid = false;
      this.isIconButton = false;
      this.title = "";
      this.variant = "neutral";
      this.appearance = "accent";
      this.size = "m";
      this.withCaret = false;
      this.withStart = false;
      this.withEnd = false;
      this.disabled = false;
      this.loading = false;
      this.pill = false;
      this.type = "button";
    }
    static get validators() {
      return [...super.validators, MirrorValidator()];
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    constructLightDOMButton() {
      const button = document.createElement("button");
      for (const attribute of this.attributes) {
        if (attribute.name === "style") {
          continue;
        }
        button.setAttribute(attribute.name, attribute.value);
      }
      button.type = this.type;
      button.style.position = "absolute !important";
      button.style.width = "0 !important";
      button.style.height = "0 !important";
      button.style.clipPath = "inset(50%) !important";
      button.style.overflow = "hidden !important";
      button.style.whiteSpace = "nowrap !important";
      if (this.name) {
        button.name = this.name;
      }
      button.value = this.value || "";
      return button;
    }
    handleClick(event) {
      var _a8;
      if (this.disabled || this.loading) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (this.type !== "submit" && this.type !== "reset") {
        return;
      }
      const form = this.getForm();
      if (!form) return;
      const lightDOMButton = this.constructLightDOMButton();
      (_a8 = this.parentElement) == null ? void 0 : _a8.append(lightDOMButton);
      lightDOMButton.click();
      lightDOMButton.remove();
    }
    handleInvalid() {
      this.dispatchEvent(new WaInvalidEvent());
    }
    handleLabelSlotChange() {
      const nodes = this.labelSlot.assignedNodes({ flatten: true });
      let hasIconLabel = false;
      let hasIcon = false;
      let hasText = false;
      let hasOtherElements = false;
      [...nodes].forEach((node) => {
        var _a8;
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;
          if (element.localName === "wa-icon") {
            hasIcon = true;
            if (!hasIconLabel) hasIconLabel = element.label !== void 0;
          } else {
            hasOtherElements = true;
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = ((_a8 = node.textContent) == null ? void 0 : _a8.trim()) || "";
          if (text.length > 0) {
            hasText = true;
          }
        }
      });
      this.isIconButton = hasIcon && !hasText && !hasOtherElements;
      this.customStates.set("icon-button", this.isIconButton);
      if (this.isIconButton && !hasIconLabel) {
        console.warn(
          'Icon buttons must have a label for screen readers. Add <wa-icon label="..."> to remove this warning.',
          this
        );
      }
    }
    isButton() {
      return this.href ? false : true;
    }
    isLink() {
      return this.href ? true : false;
    }
    handleDisabledChange() {
      this.customStates.set("disabled", this.disabled);
      this.updateValidity();
    }
    handleHrefChange() {
      this.customStates.set("link", this.isLink());
    }
    handleLoadingChange() {
      this.customStates.set("loading", this.loading);
    }
    // eslint-disable-next-line
    setValue(..._args) {
    }
    /** Simulates a click on the button. */
    click() {
      this.button.click();
    }
    /** Sets focus on the button. */
    focus(options) {
      this.button.focus(options);
    }
    /** Removes focus from the button. */
    blur() {
      this.button.blur();
    }
    render() {
      const isLink = this.isLink();
      const tag = isLink ? i6`a` : i6`button`;
      return u3`
      <${tag}
        part="base button"
        class=${e7({
        button: true,
        caret: this.withCaret,
        disabled: this.disabled,
        loading: this.loading,
        rtl: this.localize.dir() === "rtl",
        "has-label": this.hasSlotController.test("[default]"),
        "has-start": this.hasSlotController.test("start", "withStart"),
        "has-end": this.hasSlotController.test("end", "withEnd"),
        "is-icon-button": this.isIconButton
      })}
        ?disabled=${o7(isLink ? void 0 : this.disabled)}
        type=${o7(isLink ? void 0 : this.type)}
        title=${this.title}
        name=${o7(isLink ? void 0 : this.name)}
        value=${o7(isLink ? void 0 : this.value)}
        href=${o7(isLink ? this.href : void 0)}
        target=${o7(isLink ? this.target : void 0)}
        download=${o7(isLink ? this.download : void 0)}
        rel=${o7(isLink && this.rel ? this.rel : void 0)}
        role=${o7(isLink ? void 0 : "button")}
        aria-disabled=${o7(isLink && this.disabled ? "true" : void 0)}
        aria-busy=${this.loading ? "true" : "false"}
        tabindex=${this.disabled ? "-1" : "0"}
        @invalid=${this.isButton() ? this.handleInvalid : null}
        @click=${this.handleClick}
      >
        <slot name="start" part="start" class="start"></slot>
        <slot part="label" class="label" @slotchange=${this.handleLabelSlotChange}></slot>
        <slot name="end" part="end" class="end"></slot>
        ${this.withCaret ? u3`
                <wa-icon part="caret" class="caret" library="system" name="chevron-down" variant="solid"></wa-icon>
              ` : ""}
        ${this.loading ? u3`<wa-spinner part="spinner"></wa-spinner>` : ""}
      </${tag}>
    `;
    }
  };
  WaButton.shadowRootOptions = { ...WebAwesomeFormAssociatedElement.shadowRootOptions, delegatesFocus: true };
  WaButton.css = [button_styles_default, variants_styles_default, size_styles_default];
  __decorateClass([
    e5(".button")
  ], WaButton.prototype, "button", 2);
  __decorateClass([
    e5("slot:not([name])")
  ], WaButton.prototype, "labelSlot", 2);
  __decorateClass([
    r5()
  ], WaButton.prototype, "invalid", 2);
  __decorateClass([
    r5()
  ], WaButton.prototype, "isIconButton", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "title", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "variant", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "appearance", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaButton.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4({ attribute: "with-caret", type: Boolean, reflect: true })
  ], WaButton.prototype, "withCaret", 2);
  __decorateClass([
    n4({ attribute: "with-start", type: Boolean })
  ], WaButton.prototype, "withStart", 2);
  __decorateClass([
    n4({ attribute: "with-end", type: Boolean })
  ], WaButton.prototype, "withEnd", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaButton.prototype, "disabled", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaButton.prototype, "loading", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaButton.prototype, "pill", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "type", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "name", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "value", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "href", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "target", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "rel", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "download", 2);
  __decorateClass([
    n4({ attribute: "formaction" })
  ], WaButton.prototype, "formAction", 2);
  __decorateClass([
    n4({ attribute: "formenctype" })
  ], WaButton.prototype, "formEnctype", 2);
  __decorateClass([
    n4({ attribute: "formmethod" })
  ], WaButton.prototype, "formMethod", 2);
  __decorateClass([
    n4({ attribute: "formnovalidate", type: Boolean })
  ], WaButton.prototype, "formNoValidate", 2);
  __decorateClass([
    n4({ attribute: "formtarget" })
  ], WaButton.prototype, "formTarget", 2);
  __decorateClass([
    watch("disabled", { waitUntilFirstUpdate: true })
  ], WaButton.prototype, "handleDisabledChange", 1);
  __decorateClass([
    watch("href")
  ], WaButton.prototype, "handleHrefChange", 1);
  __decorateClass([
    watch("loading", { waitUntilFirstUpdate: true })
  ], WaButton.prototype, "handleLoadingChange", 1);
  WaButton = __decorateClass([
    t3("wa-button")
  ], WaButton);
  var _a6;
  (_a6 = WaButton.disableWarning) == null ? void 0 : _a6.call(WaButton, "change-in-update");

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.W7A2VLCT.js
  var spinner_styles_default = i`
  :host {
    --track-width: 2px;
    --track-color: var(--wa-color-neutral-fill-normal);
    --indicator-color: var(--wa-color-brand-fill-loud);
    --speed: 2s;
    --size: 1em;

    /*
      Resizing a spinner element using anything but font-size will break the animation because the animation uses em
      units. Therefore, if a spinner is used in a flex container without \`flex: none\` applied, the spinner can
      grow/shrink and break the animation. The use of \`flex: none\` on the host element prevents this by always having
      the spinner sized according to its actual dimensions.
    */
    flex: none;
    display: inline-flex;
    width: var(--size);
    height: var(--size);
  }

  svg {
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    animation: spin var(--speed) linear infinite;
  }

  .track,
  .indicator {
    --radius: calc(var(--size) / 2 - var(--track-width) / 2);
    --circumference: calc(var(--radius) * 2 * 3.141592654);

    cx: calc(var(--size) / 2);
    cy: calc(var(--size) / 2);
    r: var(--radius);
    fill: none;
    stroke-width: var(--track-width);
  }

  .track {
    stroke: var(--track-color);
  }

  .indicator {
    stroke: var(--indicator-color);
    stroke-linecap: round;
    stroke-dasharray: calc(0.597 * var(--circumference)), calc(0.796 * var(--circumference));
    stroke-dashoffset: calc(-0.04 * var(--circumference));
    animation: dash 1.5s ease-in-out infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: calc(0.008 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.278 * var(--circumference));
    }
    100% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.987 * var(--circumference));
    }
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.DVA7QY5T.js
  var WaSpinner = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.localize = new LocalizeController2(this);
    }
    render() {
      return b2`
      <svg
        part="base spinner"
        role="progressbar"
        aria-label=${this.localize.term("loading")}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle class="track" />
        <circle class="indicator" />
      </svg>
    `;
    }
  };
  WaSpinner.css = spinner_styles_default;
  WaSpinner = __decorateClass([
    t3("wa-spinner")
  ], WaSpinner);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.YDQCS2HK.js
  var WaErrorEvent = class extends Event {
    constructor() {
      super("wa-error", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.WDIIGUNP.js
  var WaLoadEvent = class extends Event {
    constructor() {
      super("wa-load", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.O74G5RVH.js
  var icon_styles_default = i`
  :host {
    --primary-color: currentColor;
    --primary-opacity: 1;
    --secondary-color: currentColor;
    --secondary-opacity: 0.4;
    --rotate-angle: 0deg;

    box-sizing: content-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: -0.125em;
  }

  /* #region Canvas — the box the icon is centered within (mirrors Font Awesome's icon canvas). Orthogonal to font-size. */

  /* Fixed width (default): 1.25em × 1em (20 × 16px) */
  :host(:not([canvas])),
  :host([canvas='fixed']) {
    width: 1.25em;
    height: 1em;
    min-width: 1.25em; /* <-- this is what Safari respects for intrinsic */
    min-height: 1em;
  }

  /* Auto: hug the icon's width. \`auto-width\` is the deprecated alias for canvas="auto". */
  :host([canvas='auto']),
  :host([auto-width]:not([canvas])) {
    width: auto;
    height: 1em;
  }

  /* Square: 1.25em × 1.25em (20 × 20px) */
  :host([canvas='square']) {
    width: 1.25em;
    height: 1.25em;
    min-width: 1.25em;
    min-height: 1.25em;
  }

  /* Roomy: 1.5em × 1.5em (24 × 24px) */
  :host([canvas='roomy']) {
    width: 1.5em;
    height: 1.5em;
    min-width: 1.5em;
    min-height: 1.5em;
  }

  /* #endregion */

  svg {
    /* NOTE: Avoid setting fill here. A stylesheet rule beats SVG presentation attributes, breaking stroke-based
       libraries like Lucide (fill="none" stroke="currentColor") and attribute-based mutators (issue #1733). The default
       library applies fill="currentColor" in its mutator instead. */
    height: 1em;
    overflow: visible;
    width: auto;

    /* Duotone colors with path-specific opacity fallback */
    path[data-duotone-primary] {
      color: var(--primary-color);
      opacity: var(--path-opacity, var(--primary-opacity));
    }

    path[data-duotone-secondary] {
      color: var(--secondary-color);
      opacity: var(--path-opacity, var(--secondary-opacity));
    }
  }

  /* Rotation */
  :host([rotate]) {
    transform: rotate(var(--rotate-angle, 0deg));
  }

  /* Flipping */
  :host([flip='x']) {
    transform: scaleX(-1);
  }
  :host([flip='y']) {
    transform: scaleY(-1);
  }
  :host([flip='both']) {
    transform: scale(-1, -1);
  }

  /* Rotation and Flipping combined */
  :host([rotate][flip='x']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleX(-1);
  }
  :host([rotate][flip='y']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleY(-1);
  }
  :host([rotate][flip='both']) {
    transform: rotate(var(--rotate-angle, 0deg)) scale(-1, -1);
  }

  /* #region Animations — ported from Font Awesome 7.3 (--fa-* props mapped to wa-icon's --* names) */

  :host([animation='beat']) {
    animation-name: beat;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='bounce']) {
    animation-name: bounce;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));
  }

  :host([animation='fade']) {
    animation-name: fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='beat-fade']) {
    animation-name: beat-fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='flip']) {
    animation-name: flip;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1.5s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='flip-360']) {
    animation-name: flip-360;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='shake']) {
    animation-name: shake;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.75s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='spin']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-pulse']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, steps(8));
  }

  /* spin-reverse is FA's reverse modifier expressed as a standalone value; reverse any spin via --animation-direction: reverse */
  :host([animation='spin-reverse']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, reverse);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap']) {
    animation-name: spin-snap;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 3s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap-4']) {
    animation-name: spin-snap-4;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 2.4s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap-8']) {
    animation-name: spin-snap-8;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 4s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='buzz']) {
    animation-name: buzz;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.6s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='wag']) {
    animation-name: wag;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.9s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
    transform-origin: bottom center;
  }

  :host([animation='float']) {
    animation-name: float;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 3s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
    will-change: transform;
  }

  :host([animation='swing']) {
    animation-name: swing;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1.2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
    transform-origin: top center;
  }

  :host([animation='jello']) {
    animation-name: jello;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.9s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    :host([animation='beat']),
    :host([animation='bounce']),
    :host([animation='fade']),
    :host([animation='beat-fade']),
    :host([animation='flip']),
    :host([animation='flip-360']),
    :host([animation='shake']),
    :host([animation='spin']),
    :host([animation='spin-pulse']),
    :host([animation='spin-reverse']),
    :host([animation='spin-snap']),
    :host([animation='spin-snap-4']),
    :host([animation='spin-snap-8']),
    :host([animation='buzz']),
    :host([animation='wag']),
    :host([animation='float']),
    :host([animation='swing']),
    :host([animation='jello']) {
      animation: none !important;
      transition: none !important;
    }
  }

  /* #endregion */

  /* #region Keyframes — ported verbatim from Font Awesome 7.3 */

  @keyframes beat {
    0% {
      transform: scale(1);
    }
    25% {
      transform: scale(calc(1.25 * var(--beat-scale, 1.25)));
    }
    45% {
      transform: scale(calc(1.22 * var(--beat-scale, 1.22)));
    }
    65% {
      transform: scale(calc(1.25 * var(--beat-scale, 1.25)));
    }
    90% {
      transform: scale(1);
    }
  }

  @keyframes bounce {
    0% {
      transform: scale(1, 1) translateY(0);
      /* No fallback by design (ported from FA 7.3): the first segment uses the user's --animation-timing or the CSS
         initial ease, while the explicit cubic-beziers on later stops drive the bounce physics. */
      animation-timing-function: var(--animation-timing);
    }
    14% {
      transform: scale(var(--bounce-start-scale-x, 1.06), var(--bounce-start-scale-y, 0.94))
        translateY(var(--bounce-anticipation, 3px));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    32% {
      transform: scale(var(--bounce-jump-scale-x, 0.94), var(--bounce-jump-scale-y, 1.12))
        translateY(calc(-1 * var(--bounce-height, 0.5em)));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    52% {
      transform: scale(1, 1) translateY(calc(-1 * var(--bounce-height, 0.5em) * 1.1));
      animation-timing-function: cubic-bezier(0.5, 0, 1, 0.5);
    }
    70% {
      transform: scale(var(--bounce-land-scale-x, 1.06), var(--bounce-land-scale-y, 0.92)) translateY(0);
      animation-timing-function: cubic-bezier(0.33, 0.33, 0.66, 1);
    }
    85% {
      transform: scale(0.98, 1.04) translateY(calc(-2px * var(--bounce-rebound, 1)));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: scale(1, 1) translateY(0);
    }
  }

  @keyframes fade {
    0% {
      opacity: 1;
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    40% {
      opacity: var(--fade-opacity, 0.4);
      transform: scale(0.98);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes beat-fade {
    0% {
      opacity: var(--beat-fade-opacity, 0.4);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    25% {
      opacity: calc(var(--beat-fade-opacity, 0.4) + 0.4);
      transform: scale(var(--beat-fade-scale, 1.28));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    45% {
      opacity: 1;
      transform: scale(var(--beat-fade-scale, 1.25));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    65% {
      opacity: calc(var(--beat-fade-opacity, 0.4) + 0.4);
      transform: scale(var(--beat-fade-scale, 1.28));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    100% {
      opacity: var(--beat-fade-opacity, 0.4);
      transform: scale(1);
    }
  }

  @keyframes flip {
    0% {
      transform: perspective(2em) scale(1) rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    8% {
      transform: perspective(2em) scale(var(--flip-anticipation-scale, 0.95))
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    35% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.6));
      animation-timing-function: linear;
    }
    65% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.5));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    92% {
      transform: perspective(2em) scale(1)
        rotate3d(
          var(--flip-x, 0),
          var(--flip-y, 1),
          var(--flip-z, 0),
          calc(var(--flip-angle, -360deg) * var(--flip-overshoot, 1.04))
        );
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), var(--flip-angle, -360deg));
    }
  }

  @keyframes flip-360 {
    0% {
      transform: perspective(2em) scale(1) rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    8% {
      transform: perspective(2em) scale(var(--flip-anticipation-scale, 0.95))
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    50% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.6));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    80% {
      transform: perspective(2em) scale(1)
        rotate3d(
          var(--flip-x, 0),
          var(--flip-y, 1),
          var(--flip-z, 0),
          calc(var(--flip-angle, -360deg) * var(--flip-overshoot, 1.04))
        );
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), var(--flip-angle, -360deg));
    }
  }

  @keyframes shake {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    8% {
      transform: rotate(35deg) translateX(1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    20% {
      transform: rotate(-22deg) translateX(-1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    35% {
      transform: rotate(15deg) translateX(1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    50% {
      transform: rotate(-9deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    65% {
      transform: rotate(5deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    78% {
      transform: rotate(-3deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    90% {
      transform: rotate(1deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    12% {
      transform: rotate(60deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    16.67% {
      transform: rotate(60deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    28.67% {
      transform: rotate(120deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    33.33% {
      transform: rotate(120deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    45.33% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    62% {
      transform: rotate(240deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    66.67% {
      transform: rotate(240deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    78.67% {
      transform: rotate(300deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    83.33% {
      transform: rotate(300deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    95.33% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap-4 {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    15% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    25% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    40% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    65% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    75% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    90% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap-8 {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    9% {
      transform: rotate(45deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    12.5% {
      transform: rotate(45deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    21.5% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    25% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    34% {
      transform: rotate(135deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    37.5% {
      transform: rotate(135deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    46.5% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    59% {
      transform: rotate(225deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    62.5% {
      transform: rotate(225deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    71.5% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    75% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    84% {
      transform: rotate(315deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    87.5% {
      transform: rotate(315deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    96.5% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes buzz {
    0% {
      transform: translateX(0) rotate(0deg);
      animation-timing-function: cubic-bezier(0.1, 0, 0.9, 1);
    }
    5% {
      transform: translateX(var(--buzz-distance, 4px)) rotate(0.5deg);
    }
    10% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px))) rotate(-0.5deg);
    }
    15% {
      transform: translateX(var(--buzz-distance, 4px)) rotate(0.3deg);
    }
    20% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px))) rotate(-0.3deg);
    }
    25% {
      transform: translateX(calc(var(--buzz-distance, 4px) * 0.7)) rotate(0.2deg);
    }
    30% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px) * 0.7)) rotate(-0.2deg);
    }
    35% {
      transform: translateX(calc(var(--buzz-distance, 4px) * 0.4)) rotate(0.1deg);
    }
    40% {
      transform: translateX(0) rotate(0deg);
    }
    100% {
      transform: translateX(0) rotate(0deg);
    }
  }

  @keyframes wag {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    12% {
      transform: rotate(var(--wag-angle, 12deg));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    24% {
      transform: rotate(2deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    36% {
      transform: rotate(calc(var(--wag-angle, 12deg) * 0.85));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    48% {
      transform: rotate(1deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    58% {
      transform: rotate(calc(var(--wag-angle, 12deg) * 0.6));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    68% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes float {
    0% {
      transform: translateY(0) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    15% {
      transform: translateY(calc(-0.4 * var(--float-height, 6px))) translateX(var(--float-drift, 1px))
        rotate(var(--float-tilt, 1deg)) scale(1, 1);
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    35% {
      transform: translateY(calc(-1 * var(--float-height, 6px))) translateX(0) rotate(0deg)
        scale(var(--float-stretch-x, 0.98), var(--float-stretch-y, 1.03));
      animation-timing-function: cubic-bezier(0.5, 0, 0.5, 0);
    }
    50% {
      transform: translateY(calc(-0.92 * var(--float-height, 6px))) translateX(calc(-0.5 * var(--float-drift, 1px)))
        rotate(calc(-0.5 * var(--float-tilt, 1deg))) scale(0.995, 1.01);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    70% {
      transform: translateY(calc(-0.3 * var(--float-height, 6px))) translateX(calc(-1 * var(--float-drift, 1px)))
        rotate(calc(-1 * var(--float-tilt, 1deg))) scale(1, 1);
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    90% {
      transform: translateY(calc(0.05 * var(--float-height, 6px))) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: translateY(0) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
    }
  }

  @keyframes swing {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    8% {
      transform: rotate(var(--swing-angle, 22deg));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    18% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.85));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    28% {
      transform: rotate(calc(var(--swing-angle, 22deg) * 0.65));
      animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1);
    }
    38% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.45));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    48% {
      transform: rotate(calc(var(--swing-angle, 22deg) * 0.25));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    56% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.1));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    64% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes jello {
    0% {
      transform: scale(1, 1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    12% {
      transform: scale(var(--jello-scale-x, 1.15), calc(2 - var(--jello-scale-x, 1.15)));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    24% {
      transform: scale(calc(2 - var(--jello-scale-y, 1.12)), var(--jello-scale-y, 1.12));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    36% {
      transform: scale(
        calc(1 + (var(--jello-scale-x, 1.15) - 1) * 0.5),
        calc(2 - (1 + (var(--jello-scale-x, 1.15) - 1) * 0.5))
      );
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    48% {
      transform: scale(
        calc(2 - (1 + (var(--jello-scale-y, 1.12) - 1) * 0.3)),
        calc(1 + (var(--jello-scale-y, 1.12) - 1) * 0.3)
      );
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    58% {
      transform: scale(1.02, 0.98);
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    68% {
      transform: scale(1, 1);
    }
    100% {
      transform: scale(1, 1);
    }
  }

  /* #endregion */
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.HGBRCPUS.js
  var iconPath = "";
  var kitCode = "";
  function getIconPath() {
    return iconPath.replace(/\/$/, "");
  }
  function setKitCode(code) {
    kitCode = code;
  }
  function getKitCode() {
    if (!kitCode) {
      const el2 = document.querySelector("[data-fa-kit-code]");
      if (el2) {
        setKitCode(el2.getAttribute("data-fa-kit-code") || "");
      }
    }
    return kitCode;
  }

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.KKI7M5DP.js
  var FA_VERSION = "7.3.0";
  function getIconFolder(_name, family, variant) {
    let folder = "solid";
    if (family === "chisel") {
      folder = "chisel-regular";
    }
    if (family === "etch") {
      folder = "etch-solid";
    }
    if (family === "graphite") {
      folder = "graphite-thin";
    }
    if (family === "jelly") {
      folder = "jelly-regular";
      if (variant === "duo-regular") folder = "jelly-duo-regular";
      if (variant === "fill-regular") folder = "jelly-fill-regular";
    }
    if (family === "jelly-duo") {
      folder = "jelly-duo-regular";
    }
    if (family === "jelly-fill") {
      folder = "jelly-fill-regular";
    }
    if (family === "notdog") {
      if (variant === "solid") folder = "notdog-solid";
      if (variant === "duo-solid") folder = "notdog-duo-solid";
    }
    if (family === "notdog-duo") {
      folder = "notdog-duo-solid";
    }
    if (family === "slab") {
      if (variant === "solid" || variant === "regular") folder = "slab-regular";
      if (variant === "press-regular") folder = "slab-press-regular";
    }
    if (family === "slab-press") {
      folder = "slab-press-regular";
    }
    if (family === "slab-duo") {
      folder = "slab-duo-regular";
    }
    if (family === "slab-press-duo") {
      folder = "slab-press-duo-regular";
    }
    if (family === "thumbprint") {
      folder = "thumbprint-light";
    }
    if (family === "utility") {
      folder = "utility-semibold";
    }
    if (family === "utility-duo") {
      folder = "utility-duo-semibold";
    }
    if (family === "utility-fill") {
      folder = "utility-fill-semibold";
    }
    if (family === "whiteboard") {
      folder = "whiteboard-semibold";
    }
    if (family === "mosaic") {
      folder = "mosaic-solid";
    }
    if (family === "pixel") {
      folder = "pixel-regular";
    }
    if (family === "vellum") {
      folder = "vellum-solid";
    }
    if (family === "classic") {
      if (variant === "thin") folder = "thin";
      if (variant === "light") folder = "light";
      if (variant === "regular") folder = "regular";
      if (variant === "solid") folder = "solid";
    }
    if (family === "duotone") {
      if (variant === "thin") folder = "duotone-thin";
      if (variant === "light") folder = "duotone-light";
      if (variant === "regular") folder = "duotone-regular";
      if (variant === "solid") folder = "duotone";
    }
    if (family === "sharp") {
      if (variant === "thin") folder = "sharp-thin";
      if (variant === "light") folder = "sharp-light";
      if (variant === "regular") folder = "sharp-regular";
      if (variant === "solid") folder = "sharp-solid";
    }
    if (family === "sharp-duotone") {
      if (variant === "thin") folder = "sharp-duotone-thin";
      if (variant === "light") folder = "sharp-duotone-light";
      if (variant === "regular") folder = "sharp-duotone-regular";
      if (variant === "solid") folder = "sharp-duotone-solid";
    }
    if (family === "brands") {
      folder = "brands";
    }
    return folder;
  }
  function getIconUrl(name, family, variant) {
    const folder = getIconFolder(name, family, variant);
    const iconBase = getIconPath();
    if (iconBase) {
      return `${iconBase}/${folder}/${name}.svg`;
    }
    const kitCode2 = getKitCode();
    const isPro = kitCode2.length > 0;
    return isPro ? `https://ka-p.fontawesome.com/releases/v${FA_VERSION}/svgs/${folder}/${name}.svg?token=${encodeURIComponent(kitCode2)}` : `https://ka-f.fontawesome.com/releases/v${FA_VERSION}/svgs/${folder}/${name}.svg`;
  }
  var library = {
    name: "default",
    resolver: (name, family = "classic", variant = "solid") => {
      return getIconUrl(name, family, variant);
    },
    mutator: (svg2, hostEl) => {
      if (!svg2.hasAttribute("fill")) {
        svg2.setAttribute("fill", "currentColor");
      }
      if ((hostEl == null ? void 0 : hostEl.family) && !svg2.hasAttribute("data-duotone-initialized")) {
        const { family, variant } = hostEl;
        if (
          // Duotone
          family === "duotone" || // Sharp duotone
          family === "sharp-duotone" || // Notdog duo (correct usage: family="notdog-duo")
          family === "notdog-duo" || // NOTE: family="notdog" variant="duo-solid" is deprecated
          family === "notdog" && variant === "duo-solid" || // Jelly duo (correct usage: family="jelly-duo")
          family === "jelly-duo" || // NOTE: family="jelly" variant="duo-regular" is deprecated
          family === "jelly" && variant === "duo-regular" || // Utility duo (correct usage: family="utility-duo")
          family === "utility-duo" || // Slab duo (new in 7.3)
          family === "slab-duo" || family === "slab-press-duo" || // Thumbprint
          family === "thumbprint"
        ) {
          const paths = [...svg2.querySelectorAll("path")];
          const primaryPath = paths.find((p4) => !p4.hasAttribute("opacity"));
          const secondaryPath = paths.find((p4) => p4.hasAttribute("opacity"));
          if (!primaryPath || !secondaryPath) return;
          primaryPath.setAttribute("data-duotone-primary", "");
          secondaryPath.setAttribute("data-duotone-secondary", "");
          if (hostEl.swapOpacity && primaryPath && secondaryPath) {
            const originalOpacity = secondaryPath.getAttribute("opacity") || "0.4";
            primaryPath.style.setProperty("--path-opacity", originalOpacity);
            secondaryPath.style.setProperty("--path-opacity", "1");
          }
          svg2.setAttribute("data-duotone-initialized", "");
        }
      }
    }
  };
  var library_default_default = library;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.44TPNLVU.js
  function dataUri(svg2) {
    return `data:image/svg+xml,${encodeURIComponent(svg2)}`;
  }
  var icons = {
    //
    // Solid variant
    //
    solid: {
      backward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M236.3 107.1C247.9 96 265 92.9 279.7 99.2C294.4 105.5 304 120 304 136L304 272.3L476.3 107.2C487.9 96 505 92.9 519.7 99.2C534.4 105.5 544 120 544 136L544 504C544 520 534.4 534.5 519.7 540.8C505 547.1 487.9 544 476.3 532.9L304 367.7L304 504C304 520 294.4 534.5 279.7 540.8C265 547.1 247.9 544 236.3 532.9L44.3 348.9C36.5 341.3 32 330.9 32 320C32 309.1 36.5 298.7 44.3 291.1L236.3 107.1z"/></svg>`,
      "backward-step": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M491 100.8C478.1 93.8 462.3 94.5 450 102.6L192 272.1L192 128C192 110.3 177.7 96 160 96C142.3 96 128 110.3 128 128L128 512C128 529.7 142.3 544 160 544C177.7 544 192 529.7 192 512L192 367.9L450 537.5C462.3 545.6 478 546.3 491 539.3C504 532.3 512 518.8 512 504.1L512 136.1C512 121.4 503.9 107.9 491 100.9z"/></svg>`,
      "angles-left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M77.3 256 214.7 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256zm192 0L406.7 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L269.3 256z"/></svg>`,
      "angles-right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M434.7 256 297.3 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L434.7 256zm-192 0L105.3 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256z"/></svg>`,
      check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z"/></svg>`,
      "chevron-down": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M201.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 338.7 54.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>`,
      "chevron-left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"/></svg>`,
      "chevron-right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M311.1 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L243.2 256 73.9 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg>`,
      circle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z"/></svg>`,
      "closed-captioning": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M64 192C64 156.7 92.7 128 128 128L512 128C547.3 128 576 156.7 576 192L576 448C576 483.3 547.3 512 512 512L128 512C92.7 512 64 483.3 64 448L64 192zM216 272L248 272C252.4 272 256 275.6 256 280C256 293.3 266.7 304 280 304C293.3 304 304 293.3 304 280C304 249.1 278.9 224 248 224L216 224C185.1 224 160 249.1 160 280L160 360C160 390.9 185.1 416 216 416L248 416C278.9 416 304 390.9 304 360C304 346.7 293.3 336 280 336C266.7 336 256 346.7 256 360C256 364.4 252.4 368 248 368L216 368C211.6 368 208 364.4 208 360L208 280C208 275.6 211.6 272 216 272zM384 280C384 275.6 387.6 272 392 272L424 272C428.4 272 432 275.6 432 280C432 293.3 442.7 304 456 304C469.3 304 480 293.3 480 280C480 249.1 454.9 224 424 224L392 224C361.1 224 336 249.1 336 280L336 360C336 390.9 361.1 416 392 416L424 416C454.9 416 480 390.9 480 360C480 346.7 469.3 336 456 336C442.7 336 432 346.7 432 360C432 364.4 428.4 368 424 368L392 368C387.6 368 384 364.4 384 360L384 280z"/></svg>`,
      "closed-captioning-slash": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M39 39.1C48.4 29.7 63.6 29.7 72.9 39.1L161.8 128L512 128C547.3 128 576 156.7 576 192L576 448C576 473.5 561.1 495.4 539.6 505.8L601 567.1C610.4 576.5 610.4 591.7 601 601C591.6 610.3 576.4 610.4 567.1 601L39 73.1C29.7 63.7 29.7 48.5 39 39.1zM384 350.1L384 279.9C384 275.5 387.6 271.9 392 271.9L424 271.9C428.4 271.9 432 275.5 432 279.9C432 293.2 442.7 303.9 456 303.9C469.3 303.9 480 293.2 480 279.9C480 249 454.9 223.9 424 223.9L392 223.9C361.1 223.9 336 249 336 279.9L336 302.1L384 350.1zM445.5 411.6C465.7 403.2 480 383.2 480 359.9C480 346.6 469.3 335.9 456 335.9C442.7 335.9 432 346.6 432 359.9C432 364.3 428.4 367.9 424 367.9L401.8 367.9L445.5 411.6zM162.3 264.1C160.8 269.1 160 274.5 160 280L160 360C160 390.9 185.1 416 216 416L248 416C266.1 416 282.1 407.5 292.4 394.2L410.2 512L128 512C92.7 512 64 483.3 64 448L64 192C64 184.2 65.4 176.7 68 169.8L162.3 264.1zM256.1 357.9C256 358.6 256 359.3 256 360C256 364.4 252.4 368 248 368L216 368C211.6 368 208 364.4 208 360L208 309.8L256.1 357.9z"/></svg>`,
      compress: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M160 64c0-17.7-14.3-32-32-32S96 46.3 96 64l0 64-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-96zM32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0 0 64c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96c0-17.7-14.3-32-32-32l-96 0zM352 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-64 0 0-64zM320 320c-17.7 0-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-64 64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0z"/></svg>`,
      ellipsis: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M96 320C96 289.1 121.1 264 152 264C182.9 264 208 289.1 208 320C208 350.9 182.9 376 152 376C121.1 376 96 350.9 96 320zM264 320C264 289.1 289.1 264 320 264C350.9 264 376 289.1 376 320C376 350.9 350.9 376 320 376C289.1 376 264 350.9 264 320zM488 264C518.9 264 544 289.1 544 320C544 350.9 518.9 376 488 376C457.1 376 432 350.9 432 320C432 289.1 457.1 264 488 264z"/></svg>`,
      "ellipsis-vertical": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M320 208C289.1 208 264 182.9 264 152C264 121.1 289.1 96 320 96C350.9 96 376 121.1 376 152C376 182.9 350.9 208 320 208zM320 432C350.9 432 376 457.1 376 488C376 518.9 350.9 544 320 544C289.1 544 264 518.9 264 488C264 457.1 289.1 432 320 432zM376 320C376 350.9 350.9 376 320 376C289.1 376 264 350.9 264 320C264 289.1 289.1 264 320 264C350.9 264 376 289.1 376 320z"/></svg>`,
      expand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z"/></svg>`,
      eyedropper: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M341.6 29.2l-101.6 101.6-9.4-9.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-9.4-9.4 101.6-101.6c39-39 39-102.2 0-141.1s-102.2-39-141.1 0zM55.4 323.3c-15 15-23.4 35.4-23.4 56.6l0 42.4-26.6 39.9c-8.5 12.7-6.8 29.6 4 40.4s27.7 12.5 40.4 4l39.9-26.6 42.4 0c21.2 0 41.6-8.4 56.6-23.4l109.4-109.4-45.3-45.3-109.4 109.4c-3 3-7.1 4.7-11.3 4.7l-36.1 0 0-36.1c0-4.2 1.7-8.3 4.7-11.3l109.4-109.4-45.3-45.3-109.4 109.4z"/></svg>`,
      forward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M403.7 107.1C392.1 96 375 92.9 360.3 99.2C345.6 105.5 336 120 336 136L336 272.3L163.7 107.2C152.1 96 135 92.9 120.3 99.2C105.6 105.5 96 120 96 136L96 504C96 520 105.6 534.5 120.3 540.8C135 547.1 152.1 544 163.7 532.9L336 367.7L336 504C336 520 345.6 534.5 360.3 540.8C375 547.1 392.1 544 403.7 532.9L595.7 348.9C603.6 341.4 608 330.9 608 320C608 309.1 603.5 298.7 595.7 291.1L403.7 107.1z"/></svg>`,
      file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M192 64C156.7 64 128 92.7 128 128L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 234.5C512 217.5 505.3 201.2 493.3 189.2L386.7 82.7C374.7 70.7 358.5 64 341.5 64L192 64zM453.5 240L360 240C346.7 240 336 229.3 336 216L336 122.5L453.5 240z"/></svg>`,
      "file-audio": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM389.8 307.7C380.7 301.4 368.3 303.6 362 312.7C355.7 321.8 357.9 334.2 367 340.5C390.9 357.2 406.4 384.8 406.4 416C406.4 447.2 390.8 474.9 367 491.5C357.9 497.8 355.7 510.3 362 519.3C368.3 528.3 380.8 530.6 389.8 524.3C423.9 500.5 446.4 460.8 446.4 416C446.4 371.2 424 331.5 389.8 307.7zM208 376C199.2 376 192 383.2 192 392L192 440C192 448.8 199.2 456 208 456L232 456L259.2 490C262.2 493.8 266.8 496 271.7 496L272 496C280.8 496 288 488.8 288 480L288 352C288 343.2 280.8 336 272 336L271.7 336C266.8 336 262.2 338.2 259.2 342L232 376L208 376zM336 448.2C336 458.9 346.5 466.4 354.9 459.8C367.8 449.5 376 433.7 376 416C376 398.3 367.8 382.5 354.9 372.2C346.5 365.5 336 373.1 336 383.8L336 448.3z"/></svg>`,
      "file-code": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM282.2 359.6C290.8 349.5 289.7 334.4 279.6 325.8C269.5 317.2 254.4 318.3 245.8 328.4L197.8 384.4C190.1 393.4 190.1 406.6 197.8 415.6L245.8 471.6C254.4 481.7 269.6 482.8 279.6 474.2C289.6 465.6 290.8 450.4 282.2 440.4L247.6 400L282.2 359.6zM394.2 328.4C385.6 318.3 370.4 317.2 360.4 325.8C350.4 334.4 349.2 349.6 357.8 359.6L392.4 400L357.8 440.4C349.2 450.5 350.3 465.6 360.4 474.2C370.5 482.8 385.6 481.7 394.2 471.6L442.2 415.6C449.9 406.6 449.9 393.4 442.2 384.4L394.2 328.4z"/></svg>`,
      "file-excel": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM292 330.7C284.6 319.7 269.7 316.7 258.7 324C247.7 331.3 244.7 346.3 252 357.3L291.2 416L252 474.7C244.6 485.7 247.6 500.6 258.7 508C269.8 515.4 284.6 512.4 292 501.3L320 459.3L348 501.3C355.4 512.3 370.3 515.3 381.3 508C392.3 500.7 395.3 485.7 388 474.7L348.8 416L388 357.3C395.4 346.3 392.4 331.4 381.3 324C370.2 316.6 355.4 319.6 348 330.7L320 372.7L292 330.7z"/></svg>`,
      "file-image": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM256 320C256 302.3 241.7 288 224 288C206.3 288 192 302.3 192 320C192 337.7 206.3 352 224 352C241.7 352 256 337.7 256 320zM220.6 512L419.4 512C435.2 512 448 499.2 448 483.4C448 476.1 445.2 469 440.1 463.7L343.3 361.9C337.3 355.6 328.9 352 320.1 352L319.8 352C311 352 302.7 355.6 296.6 361.9L199.9 463.7C194.8 469 192 476.1 192 483.4C192 499.2 204.8 512 220.6 512z"/></svg>`,
      "file-pdf": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 64C92.7 64 64 92.7 64 128L64 512C64 547.3 92.7 576 128 576L208 576L208 464C208 428.7 236.7 400 272 400L448 400L448 234.5C448 217.5 441.3 201.2 429.3 189.2L322.7 82.7C310.7 70.7 294.5 64 277.5 64L128 64zM389.5 240L296 240C282.7 240 272 229.3 272 216L272 122.5L389.5 240zM272 444C261 444 252 453 252 464L252 592C252 603 261 612 272 612C283 612 292 603 292 592L292 564L304 564C337.1 564 364 537.1 364 504C364 470.9 337.1 444 304 444L272 444zM304 524L292 524L292 484L304 484C315 484 324 493 324 504C324 515 315 524 304 524zM400 444C389 444 380 453 380 464L380 592C380 603 389 612 400 612L432 612C460.7 612 484 588.7 484 560L484 496C484 467.3 460.7 444 432 444L400 444zM420 572L420 484L432 484C438.6 484 444 489.4 444 496L444 560C444 566.6 438.6 572 432 572L420 572zM508 464L508 592C508 603 517 612 528 612C539 612 548 603 548 592L548 548L576 548C587 548 596 539 596 528C596 517 587 508 576 508L548 508L548 484L576 484C587 484 596 475 596 464C596 453 587 444 576 444L528 444C517 444 508 453 508 464z"/></svg>`,
      "file-powerpoint": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM280 320C266.7 320 256 330.7 256 344L256 488C256 501.3 266.7 512 280 512C293.3 512 304 501.3 304 488L304 464L328 464C367.8 464 400 431.8 400 392C400 352.2 367.8 320 328 320L280 320zM328 416L304 416L304 368L328 368C341.3 368 352 378.7 352 392C352 405.3 341.3 416 328 416z"/></svg>`,
      "file-video": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM208 368L208 464C208 481.7 222.3 496 240 496L336 496C353.7 496 368 481.7 368 464L368 440L403 475C406.2 478.2 410.5 480 415 480C424.4 480 432 472.4 432 463L432 368.9C432 359.5 424.4 351.9 415 351.9C410.5 351.9 406.2 353.7 403 356.9L368 391.9L368 367.9C368 350.2 353.7 335.9 336 335.9L240 335.9C222.3 335.9 208 350.2 208 367.9z"/></svg>`,
      "file-word": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM263.4 338.8C260.5 325.9 247.7 317.7 234.8 320.6C221.9 323.5 213.7 336.3 216.6 349.2L248.6 493.2C250.9 503.7 260 511.4 270.8 512C281.6 512.6 291.4 505.9 294.8 495.6L320 419.9L345.2 495.6C348.6 505.8 358.4 512.5 369.2 512C380 511.5 389.1 503.8 391.4 493.2L423.4 349.2C426.3 336.3 418.1 323.4 405.2 320.6C392.3 317.8 379.4 325.9 376.6 338.8L363.4 398.2L342.8 336.4C339.5 326.6 330.4 320 320 320C309.6 320 300.5 326.6 297.2 336.4L276.6 398.2L263.4 338.8z"/></svg>`,
      "file-zipper": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM192 136C192 149.3 202.7 160 216 160L264 160C277.3 160 288 149.3 288 136C288 122.7 277.3 112 264 112L216 112C202.7 112 192 122.7 192 136zM192 232C192 245.3 202.7 256 216 256L264 256C277.3 256 288 245.3 288 232C288 218.7 277.3 208 264 208L216 208C202.7 208 192 218.7 192 232zM256 304L224 304C206.3 304 192 318.3 192 336L192 384C192 410.5 213.5 432 240 432C266.5 432 288 410.5 288 384L288 336C288 318.3 273.7 304 256 304zM240 368C248.8 368 256 375.2 256 384C256 392.8 248.8 400 240 400C231.2 400 224 392.8 224 384C224 375.2 231.2 368 240 368z"/></svg>`,
      "forward-step": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M21 36.8c12.9-7 28.7-6.3 41 1.8L320 208.1 320 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 384c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-144.1-258 169.6c-12.3 8.1-28 8.8-41 1.8S0 454.7 0 440L0 72C0 57.3 8.1 43.8 21 36.8z"/></svg>`,
      gauge: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm320 96c0-26.9-16.5-49.9-40-59.3L280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 172.7c-23.5 9.5-40 32.5-40 59.3 0 35.3 28.7 64 64 64s64-28.7 64-64zM144 176a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm-16 80a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm288 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM400 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>`,
      gear: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M259.1 73.5C262.1 58.7 275.2 48 290.4 48L350.2 48C365.4 48 378.5 58.7 381.5 73.5L396 143.5C410.1 149.5 423.3 157.2 435.3 166.3L503.1 143.8C517.5 139 533.3 145 540.9 158.2L570.8 210C578.4 223.2 575.7 239.8 564.3 249.9L511 297.3C511.9 304.7 512.3 312.3 512.3 320C512.3 327.7 511.8 335.3 511 342.7L564.4 390.2C575.8 400.3 578.4 417 570.9 430.1L541 481.9C533.4 495 517.6 501.1 503.2 496.3L435.4 473.8C423.3 482.9 410.1 490.5 396.1 496.6L381.7 566.5C378.6 581.4 365.5 592 350.4 592L290.6 592C275.4 592 262.3 581.3 259.3 566.5L244.9 496.6C230.8 490.6 217.7 482.9 205.6 473.8L137.5 496.3C123.1 501.1 107.3 495.1 99.7 481.9L69.8 430.1C62.2 416.9 64.9 400.3 76.3 390.2L129.7 342.7C128.8 335.3 128.4 327.7 128.4 320C128.4 312.3 128.9 304.7 129.7 297.3L76.3 249.8C64.9 239.7 62.3 223 69.8 209.9L99.7 158.1C107.3 144.9 123.1 138.9 137.5 143.7L205.3 166.2C217.4 157.1 230.6 149.5 244.6 143.4L259.1 73.5zM320.3 400C364.5 399.8 400.2 363.9 400 319.7C399.8 275.5 363.9 239.8 319.7 240C275.5 240.2 239.8 276.1 240 320.3C240.2 364.5 276.1 400.2 320.3 400z"/></svg>`,
      "grip-vertical": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M128 40c0-22.1-17.9-40-40-40L40 0C17.9 0 0 17.9 0 40L0 88c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zm0 192c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM0 424l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 40c0-22.1-17.9-40-40-40L232 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM192 232l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 424c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48z"/></svg>`,
      indeterminate: `<svg part="indeterminate-icon" class="icon" viewBox="0 0 16 16"><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round"><g stroke="currentColor" stroke-width="2"><g transform="translate(2.285714 6.857143)"><path d="M10.2857143,1.14285714 L1.14285714,1.14285714"/></g></g></g></svg>`,
      minus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"/></svg>`,
      pause: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M48 32C21.5 32 0 53.5 0 80L0 432c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48L48 32zm224 0c-26.5 0-48 21.5-48 48l0 352c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48l-64 0z"/></svg>`,
      "picture-in-picture": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M448 32c35.3 0 64 28.7 64 64l0 112-64 0 0-112-384 0 0 320 144 0 0 64-144 0-6.5-.3c-30.1-3.1-54.1-27-57.1-57.1L0 416 0 96C0 62.9 25.2 35.6 57.5 32.3L64 32 448 32zm16 224c26.5 0 48 21.5 48 48l0 128c0 26.5-21.5 48-48 48l-160 0c-26.5 0-48-21.5-48-48l0-128c0-26.5 21.5-48 48-48l160 0z"/></svg>`,
      play: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M91.2 36.9c-12.4-6.8-27.4-6.5-39.6 .7S32 57.9 32 72l0 368c0 14.1 7.5 27.2 19.6 34.4s27.2 7.5 39.6 .7l336-184c12.8-7 20.8-20.5 20.8-35.1s-8-28.1-20.8-35.1l-336-184z"/></svg>`,
      "play-circle": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zM188.3 147.1c-7.6 4.2-12.3 12.3-12.3 20.9l0 176c0 8.7 4.7 16.7 12.3 20.9s16.8 4.1 24.3-.5l144-88c7.1-4.4 11.5-12.1 11.5-20.5s-4.4-16.1-11.5-20.5l-144-88c-7.4-4.5-16.7-4.7-24.3-.5z"/></svg>`,
      plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M352 128C352 110.3 337.7 96 320 96C302.3 96 288 110.3 288 128L288 288L128 288C110.3 288 96 302.3 96 320C96 337.7 110.3 352 128 352L288 352L288 512C288 529.7 302.3 544 320 544C337.7 544 352 529.7 352 512L352 352L512 352C529.7 352 544 337.7 544 320C544 302.3 529.7 288 512 288L352 288L352 128z"/></svg>`,
      star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M309.5-18.9c-4.1-8-12.4-13.1-21.4-13.1s-17.3 5.1-21.4 13.1L193.1 125.3 33.2 150.7c-8.9 1.4-16.3 7.7-19.1 16.3s-.5 18 5.8 24.4l114.4 114.5-25.2 159.9c-1.4 8.9 2.3 17.9 9.6 23.2s16.9 6.1 25 2L288.1 417.6 432.4 491c8 4.1 17.7 3.3 25-2s11-14.2 9.6-23.2L441.7 305.9 556.1 191.4c6.4-6.4 8.6-15.8 5.8-24.4s-10.1-14.9-19.1-16.3L383 125.3 309.5-18.9z"/></svg>`,
      upload: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M352 173.3L352 384C352 401.7 337.7 416 320 416C302.3 416 288 401.7 288 384L288 173.3L246.6 214.7C234.1 227.2 213.8 227.2 201.3 214.7C188.8 202.2 188.8 181.9 201.3 169.4L297.3 73.4C309.8 60.9 330.1 60.9 342.6 73.4L438.6 169.4C451.1 181.9 451.1 202.2 438.6 214.7C426.1 227.2 405.8 227.2 393.3 214.7L352 173.3zM320 464C364.2 464 400 428.2 400 384L480 384C515.3 384 544 412.7 544 448L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 448C96 412.7 124.7 384 160 384L240 384C240 428.2 275.8 464 320 464zM464 488C477.3 488 488 477.3 488 464C488 450.7 477.3 440 464 440C450.7 440 440 450.7 440 464C440 477.3 450.7 488 464 488z"/></svg>`,
      user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z"/></svg>`,
      volume: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM441.1 107c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C443.3 170.7 464 210.9 464 256s-20.7 85.3-53.2 111.8c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5c43.2-35.2 70.9-88.9 70.9-149s-27.7-113.8-70.9-149zm-60.5 74.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"/></svg>`,
      "volume-low": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM380.6 181.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"/></svg>`,
      "volume-xmark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM367 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z"/></svg>`,
      xmark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"/></svg>`
    },
    //
    // Regular variant
    //
    regular: {
      calendar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M216 64C229.3 64 240 74.7 240 88L240 128L400 128L400 88C400 74.7 410.7 64 424 64C437.3 64 448 74.7 448 88L448 128L480 128C515.3 128 544 156.7 544 192L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 192C96 156.7 124.7 128 160 128L192 128L192 88C192 74.7 202.7 64 216 64zM216 176L160 176C151.2 176 144 183.2 144 192L144 240L496 240L496 192C496 183.2 488.8 176 480 176L216 176zM144 288L144 480C144 488.8 151.2 496 160 496L480 496C488.8 496 496 488.8 496 480L496 288L144 288z"/></svg>`,
      "circle-question": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm256-80c-17.7 0-32 14.3-32 32 0 13.3-10.7 24-24 24s-24-10.7-24-24c0-44.2 35.8-80 80-80s80 35.8 80 80c0 47.2-36 67.2-56 74.5l0 3.8c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-8.1c0-20.5 14.8-35.2 30.1-40.2 6.4-2.1 13.2-5.5 18.2-10.3 4.3-4.2 7.7-10 7.7-19.6 0-17.7-14.3-32-32-32zM224 368a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>`,
      "circle-xmark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM167 167c-9.4 9.4-9.4 24.6 0 33.9l55 55-55 55c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l55-55 55 55c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-55-55 55-55c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-55 55-55-55c-9.4-9.4-24.6-9.4-33.9 0z"/></svg>`,
      clock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z"/></svg>`,
      copy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M384 336l-192 0c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l133.5 0c4.2 0 8.3 1.7 11.3 4.7l58.5 58.5c3 3 4.7 7.1 4.7 11.3L400 320c0 8.8-7.2 16-16 16zM192 384l192 0c35.3 0 64-28.7 64-64l0-197.5c0-17-6.7-33.3-18.7-45.3L370.7 18.7C358.7 6.7 342.5 0 325.5 0L192 0c-35.3 0-64 28.7-64 64l0 256c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-16-48 0 0 16c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l16 0 0-48-16 0z"/></svg>`,
      eye: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M288 80C222.8 80 169.2 109.6 128.1 147.7 89.6 183.5 63 226 49.4 256 63 286 89.6 328.5 128.1 364.3 169.2 402.4 222.8 432 288 432s118.8-29.6 159.9-67.7C486.4 328.5 513 286 526.6 256 513 226 486.4 183.5 447.9 147.7 406.8 109.6 353.2 80 288 80zM95.4 112.6C142.5 68.8 207.2 32 288 32s145.5 36.8 192.6 80.6c46.8 43.5 78.1 95.4 93 131.1 3.3 7.9 3.3 16.7 0 24.6-14.9 35.7-46.2 87.7-93 131.1-47.1 43.7-111.8 80.6-192.6 80.6S142.5 443.2 95.4 399.4c-46.8-43.5-78.1-95.4-93-131.1-3.3-7.9-3.3-16.7 0-24.6 14.9-35.7 46.2-87.7 93-131.1zM288 336c44.2 0 80-35.8 80-80 0-29.6-16.1-55.5-40-69.3-1.4 59.7-49.6 107.9-109.3 109.3 13.8 23.9 39.7 40 69.3 40zm-79.6-88.4c2.5 .3 5 .4 7.6 .4 35.3 0 64-28.7 64-64 0-2.6-.2-5.1-.4-7.6-37.4 3.9-67.2 33.7-71.1 71.1zm45.6-115c10.8-3 22.2-4.5 33.9-4.5 8.8 0 17.5 .9 25.8 2.6 .3 .1 .5 .1 .8 .2 57.9 12.2 101.4 63.7 101.4 125.2 0 70.7-57.3 128-128 128-61.6 0-113-43.5-125.2-101.4-1.8-8.6-2.8-17.5-2.8-26.6 0-11 1.4-21.8 4-32 .2-.7 .3-1.3 .5-1.9 11.9-43.4 46.1-77.6 89.5-89.5z"/></svg>`,
      "eye-slash": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M41-24.9c-9.4-9.4-24.6-9.4-33.9 0S-2.3-.3 7 9.1l528 528c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-96.4-96.4c2.7-2.4 5.4-4.8 8-7.2 46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6-56.8 0-105.6 18.2-146 44.2L41-24.9zM176.9 111.1c32.1-18.9 69.2-31.1 111.1-31.1 65.2 0 118.8 29.6 159.9 67.7 38.5 35.7 65.1 78.3 78.6 108.3-13.6 30-40.2 72.5-78.6 108.3-3.1 2.8-6.2 5.6-9.4 8.4L393.8 328c14-20.5 22.2-45.3 22.2-72 0-70.7-57.3-128-128-128-26.7 0-51.5 8.2-72 22.2l-39.1-39.1zm182 182l-108-108c11.1-5.8 23.7-9.1 37.1-9.1 44.2 0 80 35.8 80 80 0 13.4-3.3 26-9.1 37.1zM103.4 173.2l-34-34c-32.6 36.8-55 75.8-66.9 104.5-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6 37.3 0 71.2-7.9 101.5-20.6L352.2 422c-20 6.4-41.4 10-64.2 10-65.2 0-118.8-29.6-159.9-67.7-38.5-35.7-65.1-78.3-78.6-108.3 10.4-23.1 28.6-53.6 54-82.8z"/></svg>`,
      star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M288.1-32c9 0 17.3 5.1 21.4 13.1L383 125.3 542.9 150.7c8.9 1.4 16.3 7.7 19.1 16.3s.5 18-5.8 24.4L441.7 305.9 467 465.8c1.4 8.9-2.3 17.9-9.6 23.2s-17 6.1-25 2L288.1 417.6 143.8 491c-8 4.1-17.7 3.3-25-2s-11-14.2-9.6-23.2L134.4 305.9 20 191.4c-6.4-6.4-8.6-15.8-5.8-24.4s10.1-14.9 19.1-16.3l159.9-25.4 73.6-144.2c4.1-8 12.4-13.1 21.4-13.1zm0 76.8L230.3 158c-3.5 6.8-10 11.6-17.6 12.8l-125.5 20 89.8 89.9c5.4 5.4 7.9 13.1 6.7 20.7l-19.8 125.5 113.3-57.6c6.8-3.5 14.9-3.5 21.8 0l113.3 57.6-19.8-125.5c-1.2-7.6 1.3-15.3 6.7-20.7l89.8-89.9-125.5-20c-7.6-1.2-14.1-6-17.6-12.8L288.1 44.8z"/></svg>`
    }
  };
  var systemLibrary = {
    name: "system",
    resolver: (name, _family = "classic", variant = "solid") => {
      var _a8, _b2;
      let collection = icons[variant];
      let svg2 = (_b2 = (_a8 = collection[name]) != null ? _a8 : icons.regular[name]) != null ? _b2 : icons.regular["circle-question"];
      if (svg2) {
        return dataUri(svg2);
      }
      return "";
    },
    mutator: (svg2) => {
      if (!svg2.hasAttribute("fill")) {
        svg2.setAttribute("fill", "currentColor");
      }
    }
  };
  var library_system_default = systemLibrary;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.ZRLTNBWF.js
  var defaultIconFamily = "classic";
  var registry = [library_default_default, library_system_default];
  var watchedIcons = /* @__PURE__ */ new Set();
  function watchIcon(icon) {
    watchedIcons.add(icon);
  }
  function unwatchIcon(icon) {
    watchedIcons.delete(icon);
  }
  function getIconLibrary(name) {
    return registry.find((lib) => lib.name === name);
  }
  function registerIconLibrary(name, options) {
    unregisterIconLibrary(name);
    registry.push({
      name,
      resolver: options.resolver,
      mutator: options.mutator,
      spriteSheet: options.spriteSheet
    });
    watchedIcons.forEach((icon) => {
      if (icon.library === name) {
        icon.setIcon();
      }
    });
  }
  function unregisterIconLibrary(name) {
    registry = registry.filter((lib) => lib.name !== name);
  }
  function getDefaultIconFamily() {
    return defaultIconFamily;
  }

  // node_modules/lit-html/directive-helpers.js
  var { I: t5 } = j;
  var l4 = (o9, t6) => void 0 === t6 ? void 0 !== (o9 == null ? void 0 : o9._$litType$) : (o9 == null ? void 0 : o9._$litType$) === t6;
  var r6 = (o9) => void 0 === o9.strings;
  var m2 = {};
  var p3 = (o9, t6 = m2) => o9._$AH = t6;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.AL6UNYSC.js
  var CACHEABLE_ERROR = /* @__PURE__ */ Symbol();
  var RETRYABLE_ERROR = /* @__PURE__ */ Symbol();
  var parser;
  var iconCache = /* @__PURE__ */ new Map();
  var WaIcon = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.svg = null;
      this.autoWidth = false;
      this.swapOpacity = false;
      this.label = "";
      this.library = "default";
      this.rotate = 0;
      this.resolveIcon = async (url, library2) => {
        var _a8;
        let fileData;
        if (library2 == null ? void 0 : library2.spriteSheet) {
          if (!this.hasUpdated) {
            await this.updateComplete;
          }
          this.svg = b2`<svg part="svg">
        <use part="use" href="${url}"></use>
      </svg>`;
          await this.updateComplete;
          const svg2 = this.shadowRoot.querySelector("[part='svg']");
          if (typeof library2.mutator === "function") {
            library2.mutator(svg2, this);
          }
          return this.svg;
        }
        try {
          fileData = await fetch(url, { mode: "cors" });
          if (!fileData.ok) return fileData.status === 410 ? CACHEABLE_ERROR : RETRYABLE_ERROR;
        } catch {
          return RETRYABLE_ERROR;
        }
        try {
          const div = document.createElement("div");
          div.innerHTML = await fileData.text();
          const svg2 = div.firstElementChild;
          if (((_a8 = svg2 == null ? void 0 : svg2.tagName) == null ? void 0 : _a8.toLowerCase()) !== "svg") return CACHEABLE_ERROR;
          if (!parser) parser = new DOMParser();
          const doc = parser.parseFromString(svg2.outerHTML, "text/html");
          const svgEl = doc.body.querySelector("svg");
          if (!svgEl) return CACHEABLE_ERROR;
          svgEl.part.add("svg");
          return document.adoptNode(svgEl);
        } catch {
          return CACHEABLE_ERROR;
        }
      };
    }
    connectedCallback() {
      super.connectedCallback();
      watchIcon(this);
    }
    firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      if (this.hasAttribute("rotate")) {
        this.style.setProperty("--rotate-angle", `${this.rotate}deg`);
      }
      this.setIcon();
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      unwatchIcon(this);
    }
    async getIconSource() {
      const library2 = getIconLibrary(this.library);
      const family = this.family || getDefaultIconFamily();
      if (this.name && library2) {
        const autoWidth = this.canvas === "auto" || this.autoWidth;
        let url;
        try {
          url = await library2.resolver(this.name, family, this.variant, autoWidth);
        } catch {
          url = void 0;
        }
        return { url, fromLibrary: true };
      }
      return {
        url: this.src,
        fromLibrary: false
      };
    }
    handleLabelChange() {
      const hasLabel = typeof this.label === "string" && this.label.length > 0;
      if (hasLabel) {
        this.setAttribute("role", "img");
        this.setAttribute("aria-label", this.label);
        this.removeAttribute("aria-hidden");
      } else {
        this.removeAttribute("role");
        this.removeAttribute("aria-label");
        this.setAttribute("aria-hidden", "true");
      }
    }
    async setIcon() {
      var _a8;
      const { url, fromLibrary } = await this.getIconSource();
      const library2 = fromLibrary ? getIconLibrary(this.library) : void 0;
      if (!url) {
        this.svg = null;
        return;
      }
      let iconResolver = iconCache.get(url);
      if (!iconResolver) {
        iconResolver = this.resolveIcon(url, library2);
        iconCache.set(url, iconResolver);
      }
      const svg2 = await iconResolver;
      if (svg2 === RETRYABLE_ERROR) {
        iconCache.delete(url);
      }
      const sourceAfterFetch = await this.getIconSource();
      if (url !== sourceAfterFetch.url) {
        return;
      }
      if (l4(svg2)) {
        this.svg = svg2;
        return;
      }
      switch (svg2) {
        case RETRYABLE_ERROR:
        case CACHEABLE_ERROR:
          this.svg = null;
          this.dispatchEvent(new WaErrorEvent());
          break;
        default:
          this.svg = svg2.cloneNode(true);
          (_a8 = library2 == null ? void 0 : library2.mutator) == null ? void 0 : _a8.call(library2, this.svg, this);
          this.dispatchEvent(new WaLoadEvent());
      }
    }
    willUpdate(changedProperties) {
      if (!this.style) {
        this.setStyleProperty("--rotate-angle", `${this.rotate}deg`);
      }
      return super.willUpdate(changedProperties);
    }
    updated(changedProperties) {
      var _a8, _b2;
      super.updated(changedProperties);
      const library2 = getIconLibrary(this.library);
      if (this.hasAttribute("rotate")) {
        this.style.setProperty("--rotate-angle", `${this.rotate}deg`);
      }
      const svg2 = (_a8 = this.shadowRoot) == null ? void 0 : _a8.querySelector("svg");
      if (svg2) {
        (_b2 = library2 == null ? void 0 : library2.mutator) == null ? void 0 : _b2.call(library2, svg2, this);
      }
    }
    render() {
      if (this.hasUpdated) {
        return this.svg;
      }
      return b2`<svg part="svg" width="16" height="16" viewBox="0 0 16 16"></svg>`;
    }
  };
  WaIcon.css = icon_styles_default;
  __decorateClass([
    r5()
  ], WaIcon.prototype, "svg", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "name", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "family", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "variant", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "canvas", 2);
  __decorateClass([
    n4({ attribute: "auto-width", type: Boolean, reflect: true })
  ], WaIcon.prototype, "autoWidth", 2);
  __decorateClass([
    n4({ attribute: "swap-opacity", type: Boolean, reflect: true })
  ], WaIcon.prototype, "swapOpacity", 2);
  __decorateClass([
    n4()
  ], WaIcon.prototype, "src", 2);
  __decorateClass([
    n4()
  ], WaIcon.prototype, "label", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "library", 2);
  __decorateClass([
    n4({ type: Number, reflect: true })
  ], WaIcon.prototype, "rotate", 2);
  __decorateClass([
    n4({ type: String, reflect: true })
  ], WaIcon.prototype, "flip", 2);
  __decorateClass([
    n4({ type: String, reflect: true })
  ], WaIcon.prototype, "animation", 2);
  __decorateClass([
    watch("label")
  ], WaIcon.prototype, "handleLabelChange", 1);
  __decorateClass([
    watch(["family", "name", "library", "variant", "src", "autoWidth", "canvas", "swapOpacity"], {
      waitUntilFirstUpdate: true
    })
  ], WaIcon.prototype, "setIcon", 1);
  WaIcon = __decorateClass([
    t3("wa-icon")
  ], WaIcon);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.VTVNMJUY.js
  var progress_bar_styles_default = i`
  :host {
    --track-height: 1rem;
    --track-color: var(--wa-color-neutral-fill-normal);
    --indicator-color: var(--wa-color-brand-fill-loud);

    display: flex;
  }

  .progress-bar {
    flex: 1 1 auto;
    display: flex;
    position: relative;
    overflow: hidden;
    height: var(--track-height);
    border-radius: var(--wa-border-radius-pill);
    background-color: var(--track-color);
    color: var(--wa-color-brand-on-loud);
    font-size: var(--wa-font-size-s);
  }

  .indicator {
    width: var(--percentage);
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--indicator-color);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    line-height: 1;
    font-weight: var(--wa-font-weight-semibold);
    transition: all var(--wa-transition-slow, 200ms) var(--wa-transition-easing, ease);
    user-select: none;
    -webkit-user-select: none;
  }

  /* Indeterminate */
  :host([indeterminate]) .indicator {
    position: absolute;
    inset-block: 0;
    inline-size: 50%;
    animation: wa-progress-indeterminate 2.5s infinite cubic-bezier(0.37, 0, 0.63, 1);
  }

  @media (forced-colors: active) {
    .progress-bar {
      outline: solid 1px SelectedItem;
      background-color: var(--wa-color-surface-default);
    }

    .indicator {
      outline: solid 1px SelectedItem;
      background-color: SelectedItem;
    }
  }

  @keyframes wa-progress-indeterminate {
    0% {
      inset-inline-start: -50%;
    }

    75%,
    100% {
      inset-inline-start: 100%;
    }
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.KNJT7KBU.js
  function clamp(value, min, max) {
    const noNegativeZero = (n6) => Object.is(n6, -0) ? 0 : n6;
    if (value < min) {
      return noNegativeZero(min);
    }
    if (value > max) {
      return noNegativeZero(max);
    }
    return noNegativeZero(value);
  }

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.JXBEIEPH.js
  var WaProgressBar = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.localize = new LocalizeController2(this);
      this.value = 0;
      this.indeterminate = false;
      this.label = "";
    }
    willUpdate(changedProperties) {
      if (this.style == null) {
        this.setStyleProperty("--percentage", `${clamp(this.value, 0, 100)}%`);
      }
      super.willUpdate(changedProperties);
    }
    updated(changedProperties) {
      if (changedProperties.has("value")) {
        requestAnimationFrame(() => {
          this.style.setProperty("--percentage", `${clamp(this.value, 0, 100)}%`);
        });
      }
      super.updated(changedProperties);
    }
    render() {
      return b2`
      <div
        part="base progress-bar"
        class="progress-bar"
        role="progressbar"
        title=${o7(this.title)}
        aria-label=${this.label.length > 0 ? this.label : this.localize.term("progress")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${this.indeterminate ? "0" : this.value}
      >
        <div part="indicator" class="indicator">
          ${!this.indeterminate ? b2` <slot part="label" class="label"></slot> ` : ""}
        </div>
      </div>
    `;
    }
  };
  WaProgressBar.css = progress_bar_styles_default;
  __decorateClass([
    n4({ type: Number, reflect: true })
  ], WaProgressBar.prototype, "value", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaProgressBar.prototype, "indeterminate", 2);
  __decorateClass([
    n4()
  ], WaProgressBar.prototype, "label", 2);
  WaProgressBar = __decorateClass([
    t3("wa-progress-bar")
  ], WaProgressBar);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.YBFCQDTA.js
  var WaTabHideEvent = class extends Event {
    constructor(detail) {
      super("wa-tab-hide", { bubbles: true, cancelable: false, composed: true });
      this.detail = detail;
    }
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.SKLR37OM.js
  var WaTabShowEvent = class extends Event {
    constructor(detail) {
      super("wa-tab-show", { bubbles: true, cancelable: false, composed: true });
      this.detail = detail;
    }
  };

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.NMA53WZH.js
  var tab_group_styles_default = i`
  :host {
    --indicator-color: var(--wa-color-brand-fill-loud);
    --track-color: var(--wa-color-neutral-fill-normal);
    --track-width: 0.125rem;

    /* Private */
    --safe-track-width: max(0.5px, round(var(--track-width), 0.5px));

    display: block;
  }

  .tab-group {
    display: flex;
    border-radius: 0;
  }

  .tabs {
    display: flex;
    position: relative;
  }

  .indicator {
    position: absolute;
  }

  .tab-group-has-scroll-controls .nav-container {
    position: relative;
    padding: 0 1.5em;
  }

  .body {
    display: block;
  }

  .scroll-button {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1.5em;
  }

  .scroll-button-start {
    inset-inline-start: 0;
  }

  .scroll-button-end {
    inset-inline-end: 0;
  }

  /*
    * Top
    */

  .tab-group-top {
    flex-direction: column;
  }

  .tab-group-top .nav-container {
    order: 1;
  }

  .tab-group-top .nav {
    display: flex;
    overflow-x: auto;

    /* Hide scrollbar in Firefox */
    scrollbar-width: none;
  }

  /* Hide scrollbar in Chrome/Safari */
  .tab-group-top .nav::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .tab-group-top .tabs {
    flex: 1 1 auto;
    position: relative;
    flex-direction: row;
    border-bottom: solid var(--safe-track-width) var(--track-color);
  }

  .tab-group-top .indicator {
    bottom: calc(-1 * var(--safe-track-width));
    border-bottom: solid var(--safe-track-width) var(--indicator-color);
  }

  .tab-group-top .body {
    order: 2;
  }

  .tab-group-top ::slotted(wa-tab[active]) {
    border-block-end: solid var(--safe-track-width) var(--indicator-color);
    margin-block-end: calc(-1 * var(--safe-track-width));
  }

  .tab-group-top .body slot::slotted(wa-tab-panel) {
    --padding: var(--wa-space-xl) 0;
  }

  /*
    * Bottom
    */

  .tab-group-bottom {
    flex-direction: column;
  }

  .tab-group-bottom .nav-container {
    order: 2;
  }

  .tab-group-bottom .nav {
    display: flex;
    overflow-x: auto;

    /* Hide scrollbar in Firefox */
    scrollbar-width: none;
  }

  /* Hide scrollbar in Chrome/Safari */
  .tab-group-bottom .nav::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .tab-group-bottom .tabs {
    flex: 1 1 auto;
    position: relative;
    flex-direction: row;
    border-top: solid var(--safe-track-width) var(--track-color);
  }

  .tab-group-bottom .indicator {
    top: calc(-1 * var(--safe-track-width));
    border-top: solid var(--safe-track-width) var(--indicator-color);
  }

  .tab-group-bottom .body {
    order: 1;
  }

  .tab-group-bottom ::slotted(wa-tab[active]) {
    border-block-start: solid var(--safe-track-width) var(--indicator-color);
    margin-block-start: calc(-1 * var(--safe-track-width));
  }

  .tab-group-bottom .body slot::slotted(wa-tab-panel) {
    --padding: var(--wa-space-xl) 0;
  }

  /*
    * Start
    */

  .tab-group-start {
    flex-direction: row;
  }

  .tab-group-start .nav-container {
    order: 1;
  }

  .tab-group-start .tabs {
    flex: 0 0 auto;
    flex-direction: column;
    border-inline-end: solid var(--safe-track-width) var(--track-color);
  }

  .tab-group-start .indicator {
    inset-inline-end: calc(-1 * var(--safe-track-width));
    border-right: solid var(--safe-track-width) var(--indicator-color);
  }

  .tab-group-start .body {
    flex: 1 1 auto;
    order: 2;
  }

  .tab-group-start ::slotted(wa-tab[active]) {
    border-inline-end: solid var(--safe-track-width) var(--indicator-color);
    margin-inline-end: calc(-1 * var(--safe-track-width));
  }

  .tab-group-start .body slot::slotted(wa-tab-panel) {
    --padding: 0 var(--wa-space-xl);
  }

  /*
    * End
    */

  .tab-group-end {
    flex-direction: row;
  }

  .tab-group-end .nav-container {
    order: 2;
  }

  .tab-group-end .tabs {
    flex: 0 0 auto;
    flex-direction: column;
    border-left: solid var(--safe-track-width) var(--track-color);
  }

  .tab-group-end .indicator {
    inset-inline-start: calc(-1 * var(--safe-track-width));
    border-inline-start: solid var(--safe-track-width) var(--indicator-color);
  }

  .tab-group-end .body {
    flex: 1 1 auto;
    order: 1;
  }

  .tab-group-end ::slotted(wa-tab[active]) {
    border-inline-start: solid var(--safe-track-width) var(--indicator-color);
    margin-inline-start: calc(-1 * var(--safe-track-width));
  }

  .tab-group-end .body slot::slotted(wa-tab-panel) {
    --padding: 0 var(--wa-space-xl);
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.VQZ46MYI.js
  function getOffset(element, parent) {
    return {
      top: Math.round(element.getBoundingClientRect().top - parent.getBoundingClientRect().top),
      left: Math.round(element.getBoundingClientRect().left - parent.getBoundingClientRect().left)
    };
  }
  function scrollIntoView(element, container, direction = "vertical", behavior = "smooth") {
    const offset = getOffset(element, container);
    const offsetTop = offset.top + container.scrollTop;
    const offsetLeft = offset.left + container.scrollLeft;
    const minX = container.scrollLeft;
    const maxX = container.scrollLeft + container.offsetWidth;
    const minY = container.scrollTop;
    const maxY = container.scrollTop + container.offsetHeight;
    if (direction === "horizontal" || direction === "both") {
      if (offsetLeft < minX) {
        container.scrollTo({ left: offsetLeft, behavior });
      } else if (offsetLeft + element.clientWidth > maxX) {
        container.scrollTo({ left: offsetLeft - container.offsetWidth + element.clientWidth, behavior });
      }
    }
    if (direction === "vertical" || direction === "both") {
      if (offsetTop < minY) {
        container.scrollTo({ top: offsetTop, behavior });
      } else if (offsetTop + element.clientHeight > maxY) {
        container.scrollTo({ top: offsetTop - container.offsetHeight + element.clientHeight, behavior });
      }
    }
  }

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.UUZ6T3PP.js
  var WaTabGroup = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.tabs = [];
      this.focusableTabs = [];
      this.panels = [];
      this.localize = new LocalizeController2(this);
      this.hasScrollControls = false;
      this.active = "";
      this.placement = "top";
      this.activation = "auto";
      this.withoutScrollControls = false;
    }
    connectedCallback() {
      super.connectedCallback();
      if (o5) {
        return;
      }
      this.resizeObserver = new ResizeObserver(() => {
        this.updateScrollControls();
      });
      this.mutationObserver = new MutationObserver((mutations) => {
        if (mutations.some((m3) => !["aria-labelledby", "aria-controls"].includes(m3.attributeName))) {
          setTimeout(() => this.setAriaLabels());
        }
        const relevantMutations = mutations.filter((m3) => {
          const target = m3.target;
          return target.closest("wa-tab-group") === this;
        });
        if (relevantMutations.some((m3) => m3.attributeName === "disabled")) {
          this.syncTabsAndPanels();
        } else if (relevantMutations.some((m3) => m3.attributeName === "active")) {
          const tabs = relevantMutations.filter((m3) => m3.attributeName === "active" && m3.target.tagName.toLowerCase() === "wa-tab").map((m3) => m3.target);
          const newActiveTab = tabs.find((tab) => tab.active);
          if (newActiveTab && newActiveTab.closest("wa-tab-group") === this) {
            this.setActiveTab(newActiveTab);
          }
        }
      });
      this.updateComplete.then(() => {
        this.syncTabsAndPanels();
        this.mutationObserver.observe(this, { attributes: true, childList: true, subtree: true });
        this.resizeObserver.observe(this.nav);
        const intersectionObserver = new IntersectionObserver((entries, observer) => {
          var _a8;
          if (entries[0].intersectionRatio > 0) {
            this.setAriaLabels();
            if (this.active) {
              const tab = this.tabs.find((t6) => t6.panel === this.active);
              if (tab) {
                this.setActiveTab(tab);
              }
            } else {
              this.setActiveTab((_a8 = this.getActiveTab()) != null ? _a8 : this.tabs[0], { emitEvents: false });
            }
            observer.unobserve(entries[0].target);
          }
        });
        intersectionObserver.observe(this.tabGroup);
      });
    }
    disconnectedCallback() {
      var _a8, _b2;
      super.disconnectedCallback();
      (_a8 = this.mutationObserver) == null ? void 0 : _a8.disconnect();
      if (this.nav) {
        (_b2 = this.resizeObserver) == null ? void 0 : _b2.unobserve(this.nav);
      }
    }
    getAllTabs() {
      const slot = this.shadowRoot.querySelector('slot[name="nav"]');
      return [...slot.assignedElements()].filter((el2) => {
        return el2.tagName.toLowerCase() === "wa-tab";
      });
    }
    getAllPanels() {
      return [...this.defaultSlot.assignedElements()].filter((el2) => el2.tagName.toLowerCase() === "wa-tab-panel");
    }
    getActiveTab() {
      return this.tabs.find((el2) => el2.active);
    }
    handleClick(event) {
      const target = event.target;
      const tab = target.closest("wa-tab");
      const tabGroup = tab == null ? void 0 : tab.closest("wa-tab-group");
      if (tabGroup !== this) {
        return;
      }
      if (tab !== null) {
        this.setActiveTab(tab, { scrollBehavior: "smooth" });
      }
    }
    handleKeyDown(event) {
      const target = event.target;
      const tab = target.closest("wa-tab");
      const tabGroup = tab == null ? void 0 : tab.closest("wa-tab-group");
      if (tabGroup !== this) {
        return;
      }
      if (["Enter", " "].includes(event.key)) {
        if (tab !== null) {
          this.setActiveTab(tab, { scrollBehavior: "smooth" });
          event.preventDefault();
        }
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        const activeEl = this.tabs.find((t6) => t6.matches(":focus"));
        const isRtl = this.localize.dir() === "rtl";
        let nextTab = null;
        if ((activeEl == null ? void 0 : activeEl.tagName.toLowerCase()) === "wa-tab") {
          if (event.key === "Home") {
            nextTab = this.focusableTabs[0];
          } else if (event.key === "End") {
            nextTab = this.focusableTabs[this.focusableTabs.length - 1];
          } else if (["top", "bottom"].includes(this.placement) && event.key === (isRtl ? "ArrowRight" : "ArrowLeft") || ["start", "end"].includes(this.placement) && event.key === "ArrowUp") {
            const currentIndex = this.tabs.findIndex((el2) => el2 === activeEl);
            nextTab = this.findNextFocusableTab(currentIndex, "backward");
          } else if (["top", "bottom"].includes(this.placement) && event.key === (isRtl ? "ArrowLeft" : "ArrowRight") || ["start", "end"].includes(this.placement) && event.key === "ArrowDown") {
            const currentIndex = this.tabs.findIndex((el2) => el2 === activeEl);
            nextTab = this.findNextFocusableTab(currentIndex, "forward");
          }
          if (!nextTab) {
            return;
          }
          nextTab.tabIndex = 0;
          nextTab.focus({ preventScroll: true });
          if (this.activation === "auto") {
            this.setActiveTab(nextTab, { scrollBehavior: "smooth" });
          } else {
            this.tabs.forEach((tabEl) => {
              tabEl.tabIndex = tabEl === nextTab ? 0 : -1;
            });
          }
          if (["top", "bottom"].includes(this.placement)) {
            scrollIntoView(nextTab, this.nav, "horizontal");
          }
          event.preventDefault();
        }
      }
    }
    findNextFocusableTab(currentIndex, direction) {
      let nextTab = null;
      const iterator = direction === "forward" ? 1 : -1;
      let nextIndex = currentIndex + iterator;
      while (currentIndex < this.tabs.length) {
        nextTab = this.tabs[nextIndex] || null;
        if (nextTab === null) {
          if (direction === "forward") {
            nextTab = this.focusableTabs[0];
          } else {
            nextTab = this.focusableTabs[this.focusableTabs.length - 1];
          }
          break;
        }
        if (!nextTab.disabled) {
          break;
        }
        nextIndex += iterator;
      }
      return nextTab;
    }
    handleScrollToStart() {
      this.nav.scroll({
        left: this.localize.dir() === "rtl" ? this.nav.scrollLeft + this.nav.clientWidth : this.nav.scrollLeft - this.nav.clientWidth,
        behavior: "smooth"
      });
    }
    handleScrollToEnd() {
      this.nav.scroll({
        left: this.localize.dir() === "rtl" ? this.nav.scrollLeft - this.nav.clientWidth : this.nav.scrollLeft + this.nav.clientWidth,
        behavior: "smooth"
      });
    }
    setActiveTab(tab, options) {
      options = {
        emitEvents: true,
        scrollBehavior: "auto",
        ...options
      };
      if (tab.closest("wa-tab-group") !== this) {
        return;
      }
      if (tab !== this.activeTab && !tab.disabled) {
        const previousTab = this.activeTab;
        this.active = tab.panel;
        this.activeTab = tab;
        this.tabs.forEach((el2) => {
          el2.active = el2 === this.activeTab;
          el2.tabIndex = el2 === this.activeTab ? 0 : -1;
        });
        this.panels.forEach((el2) => {
          var _a8;
          return el2.active = el2.name === ((_a8 = this.activeTab) == null ? void 0 : _a8.panel);
        });
        if (["top", "bottom"].includes(this.placement)) {
          scrollIntoView(this.activeTab, this.nav, "horizontal", options.scrollBehavior);
        }
        if (options.emitEvents) {
          if (previousTab) {
            this.dispatchEvent(new WaTabHideEvent({ name: previousTab.panel }));
          }
          this.dispatchEvent(new WaTabShowEvent({ name: this.activeTab.panel }));
        }
      }
    }
    setAriaLabels() {
      this.tabs.forEach((tab) => {
        const panel = this.panels.find((el2) => el2.name === tab.panel);
        if (panel) {
          tab.setAttribute("aria-controls", panel.getAttribute("id"));
          panel.setAttribute("aria-labelledby", tab.getAttribute("id"));
        }
      });
    }
    // This stores tabs and panels so we can refer to a cache instead of calling querySelectorAll() multiple times.
    syncTabsAndPanels() {
      this.tabs = this.getAllTabs();
      this.focusableTabs = this.tabs.filter((el2) => !el2.disabled);
      this.panels = this.getAllPanels();
      this.updateComplete.then(() => this.updateScrollControls());
    }
    updateActiveTab() {
      const tab = this.tabs.find((el2) => el2.panel === this.active);
      if (tab) {
        this.setActiveTab(tab, { scrollBehavior: "smooth" });
      }
    }
    updateScrollControls() {
      if (this.withoutScrollControls) {
        this.hasScrollControls = false;
      } else {
        this.hasScrollControls = ["top", "bottom"].includes(this.placement) && this.nav.scrollWidth > this.nav.clientWidth + 1;
      }
    }
    render() {
      const isRtl = this.hasUpdated ? this.localize.dir() === "rtl" : this.dir === "rtl";
      return b2`
      <div
        part="base tab-group"
        class=${e7({
        "tab-group": true,
        "tab-group-top": this.placement === "top",
        "tab-group-bottom": this.placement === "bottom",
        "tab-group-start": this.placement === "start",
        "tab-group-end": this.placement === "end",
        "tab-group-has-scroll-controls": this.hasScrollControls
      })}
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
      >
        <div class="nav-container" part="nav">
          ${this.hasScrollControls ? b2`
                <wa-button
                  part="scroll-button scroll-button-start"
                  exportparts="base:scroll-button__base"
                  class="scroll-button scroll-button-start"
                  appearance="plain"
                  @click=${this.handleScrollToStart}
                >
                  <wa-icon
                    name=${isRtl ? "chevron-right" : "chevron-left"}
                    library="system"
                    variant="solid"
                    label=${this.localize.term("scrollToStart")}
                  ></wa-icon>
                </wa-button>
              ` : ""}

          <!-- We have a focus listener because in Firefox (and soon to be Chrome) overflow containers are focusable. -->
          <div class="nav" @focus=${() => {
        var _a8;
        return (_a8 = this.activeTab) == null ? void 0 : _a8.focus({ preventScroll: true });
      }}>
            <div part="tabs" class="tabs" role="tablist">
              <slot name="nav" @slotchange=${this.syncTabsAndPanels}></slot>
            </div>
          </div>

          ${this.hasScrollControls ? b2`
                <wa-button
                  part="scroll-button scroll-button-end"
                  class="scroll-button scroll-button-end"
                  exportparts="base:scroll-button__base"
                  appearance="plain"
                  @click=${this.handleScrollToEnd}
                >
                  <wa-icon
                    name=${isRtl ? "chevron-left" : "chevron-right"}
                    library="system"
                    variant="solid"
                    label=${this.localize.term("scrollToEnd")}
                  ></wa-icon>
                </wa-button>
              ` : ""}
        </div>

        <div part="body" class="body"><slot @slotchange=${this.syncTabsAndPanels}></slot></div>
      </div>
    `;
    }
  };
  WaTabGroup.css = tab_group_styles_default;
  __decorateClass([
    e5(".tab-group")
  ], WaTabGroup.prototype, "tabGroup", 2);
  __decorateClass([
    e5(".body slot")
  ], WaTabGroup.prototype, "defaultSlot", 2);
  __decorateClass([
    e5(".nav")
  ], WaTabGroup.prototype, "nav", 2);
  __decorateClass([
    r5()
  ], WaTabGroup.prototype, "hasScrollControls", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTabGroup.prototype, "active", 2);
  __decorateClass([
    n4()
  ], WaTabGroup.prototype, "placement", 2);
  __decorateClass([
    n4()
  ], WaTabGroup.prototype, "activation", 2);
  __decorateClass([
    n4({ attribute: "without-scroll-controls", type: Boolean })
  ], WaTabGroup.prototype, "withoutScrollControls", 2);
  __decorateClass([
    watch("active")
  ], WaTabGroup.prototype, "updateActiveTab", 1);
  __decorateClass([
    watch("withoutScrollControls", { waitUntilFirstUpdate: true })
  ], WaTabGroup.prototype, "updateScrollControls", 1);
  WaTabGroup = __decorateClass([
    t3("wa-tab-group")
  ], WaTabGroup);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.WRIHAZWX.js
  var tab_panel_styles_default = i`
  :host {
    --padding: 0;

    display: none;
  }

  :host([active]) {
    display: block;
  }

  .tab-panel {
    display: block;
    padding: var(--padding);
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.KQ3Z6T2I.js
  var id = 0;
  var WaTabPanel = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.attrId = ++id;
      this.componentId = `wa-tab-panel-${this.attrId}`;
      this.name = "";
      this.active = false;
      this.role = "tabpanel";
    }
    connectedCallback() {
      super.connectedCallback();
      this.id = (this.id || "").length > 0 ? this.id : this.componentId;
    }
    handleActiveChange() {
      this.setAttribute("aria-hidden", this.active ? "false" : "true");
    }
    render() {
      return b2`
      <slot
        part="base"
        class=${e7({
        "tab-panel": true,
        "tab-panel-active": this.active
      })}
      ></slot>
    `;
    }
  };
  WaTabPanel.css = tab_panel_styles_default;
  __decorateClass([
    n4({ reflect: true })
  ], WaTabPanel.prototype, "name", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaTabPanel.prototype, "active", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTabPanel.prototype, "role", 2);
  __decorateClass([
    watch("active")
  ], WaTabPanel.prototype, "handleActiveChange", 1);
  WaTabPanel = __decorateClass([
    t3("wa-tab-panel")
  ], WaTabPanel);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.R2GHHEHL.js
  var tab_styles_default = i`
  :host {
    display: inline-block;
    color: var(--wa-color-neutral-on-quiet);
    font-weight: var(--wa-font-weight-action);
  }

  .tab {
    display: inline-flex;
    align-items: center;
    font: inherit;
    padding: 1em 1.5em;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
    transition: color var(--wa-transition-fast) var(--wa-transition-easing);

    ::slotted(wa-icon:first-child) {
      margin-inline-end: 0.5em;
    }

    ::slotted(wa-icon:last-child) {
      margin-inline-start: 0.5em;
    }
  }

  @media (hover: hover) {
    :host(:hover:not([disabled])) .tab {
      color: currentColor;
    }
  }

  :host(:focus) {
    outline: transparent;
  }

  :host(:focus-visible) .tab {
    outline: var(--wa-focus-ring);
    outline-offset: calc(-1 * var(--wa-border-width-l) - var(--wa-focus-ring-offset));
  }

  :host([active]:not([disabled])) {
    color: var(--wa-color-brand-on-quiet);
  }

  :host([disabled]) .tab {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (forced-colors: active) {
    :host([active]:not([disabled])) {
      outline: solid 1px transparent;
      outline-offset: -3px;
    }
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.4FOSDR4V.js
  var id2 = 0;
  var WaTab = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.attrId = ++id2;
      this.componentId = `wa-tab-${this.attrId}`;
      this.panel = "";
      this.active = false;
      this.disabled = false;
      this.tabIndex = 0;
      this.slot = "nav";
      this.role = "tab";
    }
    handleActiveChange() {
      this.setAttribute("aria-selected", this.active ? "true" : "false");
    }
    handleDisabledChange() {
      this.setAttribute("aria-disabled", this.disabled ? "true" : "false");
      if (this.disabled && !this.active) {
        this.tabIndex = -1;
      } else {
        this.tabIndex = 0;
      }
    }
    render() {
      var _a8;
      this.id = ((_a8 = this.id) == null ? void 0 : _a8.length) > 0 ? this.id : this.componentId;
      return b2`
      <div
        part="base tab"
        class=${e7({
        tab: true,
        "tab-active": this.active
      })}
      >
        <slot></slot>
      </div>
    `;
    }
  };
  WaTab.css = tab_styles_default;
  __decorateClass([
    e5(".tab")
  ], WaTab.prototype, "tab", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTab.prototype, "panel", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaTab.prototype, "active", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaTab.prototype, "disabled", 2);
  __decorateClass([
    n4({ type: Number, reflect: true })
  ], WaTab.prototype, "tabIndex", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTab.prototype, "slot", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTab.prototype, "role", 2);
  __decorateClass([
    watch("active")
  ], WaTab.prototype, "handleActiveChange", 1);
  __decorateClass([
    watch("disabled")
  ], WaTab.prototype, "handleDisabledChange", 1);
  WaTab = __decorateClass([
    t3("wa-tab")
  ], WaTab);

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.DWWFIQKG.js
  var switch_styles_default = i`
  :host {
    --height: var(--wa-form-control-toggle-size);
    --width: calc(var(--height) * 1.75);
    --thumb-size: 0.75em;

    display: inline-flex;
    line-height: var(--wa-form-control-value-line-height);
  }

  label {
    position: relative;
    display: flex;
    align-items: center;
    font: inherit;
    color: var(--wa-form-control-value-color);
    vertical-align: middle;
    cursor: pointer;
  }

  .switch {
    flex: 0 0 auto;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--width);
    height: var(--height);
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
    border-radius: var(--height);
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
    transition-property: translate, background, border-color, box-shadow;
    transition-duration: var(--wa-transition-normal);
    transition-timing-function: var(--wa-transition-easing);
  }

  :host([did-ssr]:not(:defined)) .switch {
    transition-property: unset;
    transition-duration: unset;
    transition-timing-function: unset;
  }

  .switch .thumb {
    aspect-ratio: 1 / 1;
    width: var(--thumb-size);
    height: var(--thumb-size);
    background-color: var(--wa-form-control-border-color);
    border-radius: 50%;
    translate: calc((var(--width) - var(--height)) / -2);
    transition: inherit;
  }
  .switch .thumb:dir(rtl) {
    translate: calc((var(--width) - var(--height)) / 2);
  }

  .input {
    position: absolute;
    opacity: 0;
    padding: 0;
    margin: 0;
    pointer-events: none;
  }

  /* Focus */
  label:not(.disabled) .input:focus-visible ~ [part~='control'] {
    outline: var(--wa-focus-ring);
    outline-offset: var(--wa-focus-ring-offset);
  }

  /* Checked */
  .checked .switch {
    background-color: var(--wa-form-control-activated-color);
    border-color: var(--wa-form-control-activated-color);
  }

  .checked .switch .thumb {
    background-color: var(--wa-color-surface-default);
    translate: calc((var(--width) - var(--height)) / 2);
  }
  .checked .switch .thumb:dir(rtl) {
    translate: calc((var(--width) - var(--height)) / -2);
  }

  /* Disabled */
  label:has(> :disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  [part~='label'] {
    display: inline-block;
    line-height: var(--height);
    margin-inline-start: 0.5em;
    user-select: none;
    -webkit-user-select: none;
  }

  :host([required]) [part~='label']::after {
    content: var(--wa-form-control-required-content);
    color: var(--wa-form-control-required-content-color);
    margin-inline-start: var(--wa-form-control-required-content-offset);
  }

  @media (forced-colors: active) {
    :checked:enabled + .switch:hover .thumb,
    :checked + .switch .thumb {
      background-color: ButtonText;
    }
  }
`;

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.JPBXG7RE.js
  var form_control_styles_default = i`
  :host {
    display: flex;
    flex-direction: column;
  }

  /* Treat wrapped labels, inputs, and hints as direct children of the host element */
  [part~='form-control'] {
    display: contents;
  }

  /* Label */
  :is([part~='form-control-label'], [part~='label']):has(*:not(:empty)),
  :is([part~='form-control-label'], [part~='label']).has-label {
    display: inline-flex;
    color: var(--wa-form-control-label-color);
    font-weight: var(--wa-form-control-label-font-weight);
    line-height: var(--wa-form-control-label-line-height);
    margin-block-end: 0.5em;
  }

  :host([required]) :is([part~='form-control-label'], [part~='label'])::after {
    content: var(--wa-form-control-required-content);
    margin-inline-start: var(--wa-form-control-required-content-offset);
    color: var(--wa-form-control-required-content-color);
  }

  /* Help text */
  [part~='hint'] {
    display: block;
    color: var(--wa-form-control-hint-color);
    font-weight: var(--wa-form-control-hint-font-weight);
    line-height: var(--wa-form-control-hint-line-height);
    margin-block-start: 0.5em;
    font-size: var(--wa-font-size-smaller);

    &:not(.has-slotted, .has-hint, .has-count) {
      display: none;
    }
  }
`;

  // node_modules/lit-html/directives/live.js
  var l5 = e6(class extends i5 {
    constructor(r7) {
      if (super(r7), r7.type !== t4.PROPERTY && r7.type !== t4.ATTRIBUTE && r7.type !== t4.BOOLEAN_ATTRIBUTE) throw Error("The `live` directive is not allowed on child or event bindings");
      if (!r6(r7)) throw Error("`live` bindings can only contain a single expression");
    }
    render(r7) {
      return r7;
    }
    update(i7, [t6]) {
      if (t6 === E || t6 === A) return t6;
      const o9 = i7.element, l6 = i7.name;
      if (i7.type === t4.PROPERTY) {
        if (t6 === o9[l6]) return E;
      } else if (i7.type === t4.BOOLEAN_ATTRIBUTE) {
        if (!!t6 === o9.hasAttribute(l6)) return E;
      } else if (i7.type === t4.ATTRIBUTE && o9.getAttribute(l6) === t6 + "") return E;
      return p3(i7), t6;
    }
  });

  // node_modules/@awesome.me/webawesome/dist/chunks/chunk.XI4IVCQA.js
  var WaSwitch = class extends WebAwesomeFormAssociatedElement {
    constructor() {
      var _a8;
      super(...arguments);
      this.hasSlotController = new HasSlotController(this, "hint");
      this.localize = new LocalizeController2(this);
      this.title = "";
      this.name = null;
      this._value = (_a8 = this.getAttribute("value")) != null ? _a8 : null;
      this.size = "m";
      this.disabled = false;
      this._checked = null;
      this.defaultChecked = this.hasAttribute("checked");
      this.required = false;
      this.hint = "";
      this.withHint = false;
    }
    static get validators() {
      return o5 ? [] : [...super.validators, MirrorValidator()];
    }
    /** The value of the switch, submitted as a name/value pair with form data. */
    get value() {
      var _a8;
      return (_a8 = this._value) != null ? _a8 : "on";
    }
    set value(val) {
      this._value = val;
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    get checked() {
      var _a8;
      if (this.valueHasChanged) {
        return Boolean(this._checked);
      }
      return (_a8 = this._checked) != null ? _a8 : this.defaultChecked;
    }
    set checked(val) {
      this._checked = Boolean(val);
      this.valueHasChanged = true;
    }
    handleClick() {
      this.hasInteracted = true;
      this.checked = !this.checked;
      this.updateComplete.then(() => {
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      });
    }
    handleKeyDown(event) {
      const isRtl = this.localize.dir() === "rtl";
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.checked = isRtl;
        this.updateComplete.then(() => {
          this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
          this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
        });
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.checked = !isRtl;
        this.updateComplete.then(() => {
          this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
          this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
        });
      }
    }
    willUpdate(changedProperties) {
      super.willUpdate(changedProperties);
      if (changedProperties.has("value") || changedProperties.has("checked") || changedProperties.has("defaultChecked") || changedProperties.has("disabled")) {
        this.handleValueOrCheckedChange();
      }
    }
    handleValueOrCheckedChange() {
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.handleValueOrCheckedChange();
        });
        return;
      }
      this.setValue(this.checked ? this.value : null, this._value);
      this.updateValidity();
    }
    handleStateChange() {
      if (this.hasUpdated) {
        this.input.checked = this.checked;
      }
      this.customStates.set("checked", this.checked);
      this.updateValidity();
    }
    handleDisabledChange() {
      this.updateValidity();
    }
    /** Simulates a click on the switch. */
    click() {
      this.input.click();
    }
    /** Sets focus on the switch. */
    focus(options) {
      this.input.focus(options);
    }
    /** Removes focus from the switch. */
    blur() {
      this.input.blur();
    }
    setValue(value, stateValue) {
      if (!this.checked) {
        this.internals.setFormValue(null, null);
        return;
      }
      this.internals.setFormValue(value != null ? value : "on", stateValue);
    }
    formResetCallback() {
      this._checked = null;
      super.formResetCallback();
      this.handleValueOrCheckedChange();
    }
    render() {
      const hasHintSlot = this.hasSlotController.test("hint", "withHint");
      const hasHint = this.hint ? true : !!hasHintSlot;
      const checkedAttribute = this.didSSR && !this.hasUpdated ? this.checked : this.defaultChecked;
      const checkedProperty = this.didSSR && !this.hasUpdated ? null : l5(this.checked);
      return b2`
      <label
        part="base switch"
        class=${e7({
        checked: this.checked,
        disabled: this.disabled
      })}
      >
        <input
          class="input"
          type="checkbox"
          title=${this.title}
          name=${o7(this.name)}
          value=${o7(this.value)}
          .checked=${o7(checkedProperty)}
          ?checked=${checkedAttribute}
          ?disabled=${this.disabled}
          ?required=${this.required}
          role="switch"
          aria-checked=${this.checked ? "true" : "false"}
          aria-describedby="hint"
          @click=${this.handleClick}
          @keydown=${this.handleKeyDown}
        />

        <span part="control" class="switch">
          <span part="thumb" class="thumb"></span>
        </span>

        <slot part="label" class="label"></slot>
      </label>

      <slot
        id="hint"
        name="hint"
        part="hint"
        class=${e7({
        "has-slotted": hasHint
      })}
        aria-hidden=${hasHint ? "false" : "true"}
        >${this.hint}</slot
      >
    `;
    }
  };
  WaSwitch.shadowRootOptions = { ...WebAwesomeFormAssociatedElement.shadowRootOptions, delegatesFocus: true };
  WaSwitch.css = [form_control_styles_default, size_styles_default, switch_styles_default];
  __decorateClass([
    e5('input[type="checkbox"]')
  ], WaSwitch.prototype, "input", 2);
  __decorateClass([
    n4()
  ], WaSwitch.prototype, "title", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaSwitch.prototype, "name", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaSwitch.prototype, "value", 1);
  __decorateClass([
    n4({ reflect: true })
  ], WaSwitch.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaSwitch.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4({ type: Boolean })
  ], WaSwitch.prototype, "disabled", 2);
  __decorateClass([
    n4({ type: Boolean, attribute: false })
  ], WaSwitch.prototype, "checked", 1);
  __decorateClass([
    n4({ type: Boolean, attribute: "checked", reflect: true })
  ], WaSwitch.prototype, "defaultChecked", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaSwitch.prototype, "required", 2);
  __decorateClass([
    n4({ attribute: "hint" })
  ], WaSwitch.prototype, "hint", 2);
  __decorateClass([
    n4({ attribute: "with-hint", type: Boolean })
  ], WaSwitch.prototype, "withHint", 2);
  __decorateClass([
    watch(["checked", "defaultChecked"])
  ], WaSwitch.prototype, "handleStateChange", 1);
  __decorateClass([
    watch("disabled", { waitUntilFirstUpdate: true })
  ], WaSwitch.prototype, "handleDisabledChange", 1);
  WaSwitch = __decorateClass([
    t3("wa-switch")
  ], WaSwitch);
  var _a7;
  (_a7 = WaSwitch.disableWarning) == null ? void 0 : _a7.call(WaSwitch, "change-in-update");

  // src-client/.vendor-css.generated.js
  var VENDOR_CSS = "/* Order of precedence for all cascade layers in Web Awesome */\n@layer wa-native, wa-base, wa-utilities, wa-color-palette, wa-color-variant, wa-theme, wa-theme-dimension, wa-theme-overrides;\n\n@layer wa-base {\n  /**\n    Because headers are sticky, this is needed to make sure page fragment anchors scroll down past the headers / subheaders and are visible.\n    IE: \\`<a href=\"#id-for-h2\">\\` anchors.\n    */\n  wa-page :is(*, *:after, *:before) {\n    scroll-margin-top: var(--scroll-margin-top);\n  }\n\n  wa-page[view='desktop'] [data-toggle-nav] {\n    display: none;\n  }\n\n  wa-page[view='mobile'] .wa-desktop-only,\n  wa-page[view='desktop'] .wa-mobile-only {\n    display: none !important;\n  }\n}\n\n/* Rules shared by all palettes */\n\n@layer wa-color-variant {\n  :where(#scpanl-root), /* default */\n  .wa-brand-blue {\n    --wa-color-brand-95: var(--wa-color-blue-95);\n    --wa-color-brand-90: var(--wa-color-blue-90);\n    --wa-color-brand-80: var(--wa-color-blue-80);\n    --wa-color-brand-70: var(--wa-color-blue-70);\n    --wa-color-brand-60: var(--wa-color-blue-60);\n    --wa-color-brand-50: var(--wa-color-blue-50);\n    --wa-color-brand-40: var(--wa-color-blue-40);\n    --wa-color-brand-30: var(--wa-color-blue-30);\n    --wa-color-brand-20: var(--wa-color-blue-20);\n    --wa-color-brand-10: var(--wa-color-blue-10);\n    --wa-color-brand-05: var(--wa-color-blue-05);\n    --wa-color-brand: var(--wa-color-blue);\n    --wa-color-brand-on: var(--wa-color-blue-on);\n  }\n\n  .wa-brand-red {\n    --wa-color-brand-95: var(--wa-color-red-95);\n    --wa-color-brand-90: var(--wa-color-red-90);\n    --wa-color-brand-80: var(--wa-color-red-80);\n    --wa-color-brand-70: var(--wa-color-red-70);\n    --wa-color-brand-60: var(--wa-color-red-60);\n    --wa-color-brand-50: var(--wa-color-red-50);\n    --wa-color-brand-40: var(--wa-color-red-40);\n    --wa-color-brand-30: var(--wa-color-red-30);\n    --wa-color-brand-20: var(--wa-color-red-20);\n    --wa-color-brand-10: var(--wa-color-red-10);\n    --wa-color-brand-05: var(--wa-color-red-05);\n    --wa-color-brand: var(--wa-color-red);\n    --wa-color-brand-on: var(--wa-color-red-on);\n  }\n\n  .wa-brand-orange {\n    --wa-color-brand-95: var(--wa-color-orange-95);\n    --wa-color-brand-90: var(--wa-color-orange-90);\n    --wa-color-brand-80: var(--wa-color-orange-80);\n    --wa-color-brand-70: var(--wa-color-orange-70);\n    --wa-color-brand-60: var(--wa-color-orange-60);\n    --wa-color-brand-50: var(--wa-color-orange-50);\n    --wa-color-brand-40: var(--wa-color-orange-40);\n    --wa-color-brand-30: var(--wa-color-orange-30);\n    --wa-color-brand-20: var(--wa-color-orange-20);\n    --wa-color-brand-10: var(--wa-color-orange-10);\n    --wa-color-brand-05: var(--wa-color-orange-05);\n    --wa-color-brand: var(--wa-color-orange);\n    --wa-color-brand-on: var(--wa-color-orange-on);\n  }\n\n  .wa-brand-yellow {\n    --wa-color-brand-95: var(--wa-color-yellow-95);\n    --wa-color-brand-90: var(--wa-color-yellow-90);\n    --wa-color-brand-80: var(--wa-color-yellow-80);\n    --wa-color-brand-70: var(--wa-color-yellow-70);\n    --wa-color-brand-60: var(--wa-color-yellow-60);\n    --wa-color-brand-50: var(--wa-color-yellow-50);\n    --wa-color-brand-40: var(--wa-color-yellow-40);\n    --wa-color-brand-30: var(--wa-color-yellow-30);\n    --wa-color-brand-20: var(--wa-color-yellow-20);\n    --wa-color-brand-10: var(--wa-color-yellow-10);\n    --wa-color-brand-05: var(--wa-color-yellow-05);\n    --wa-color-brand: var(--wa-color-yellow);\n    --wa-color-brand-on: var(--wa-color-yellow-on);\n  }\n\n  .wa-brand-green {\n    --wa-color-brand-95: var(--wa-color-green-95);\n    --wa-color-brand-90: var(--wa-color-green-90);\n    --wa-color-brand-80: var(--wa-color-green-80);\n    --wa-color-brand-70: var(--wa-color-green-70);\n    --wa-color-brand-60: var(--wa-color-green-60);\n    --wa-color-brand-50: var(--wa-color-green-50);\n    --wa-color-brand-40: var(--wa-color-green-40);\n    --wa-color-brand-30: var(--wa-color-green-30);\n    --wa-color-brand-20: var(--wa-color-green-20);\n    --wa-color-brand-10: var(--wa-color-green-10);\n    --wa-color-brand-05: var(--wa-color-green-05);\n    --wa-color-brand: var(--wa-color-green);\n    --wa-color-brand-on: var(--wa-color-green-on);\n  }\n\n  .wa-brand-cyan {\n    --wa-color-brand-95: var(--wa-color-cyan-95);\n    --wa-color-brand-90: var(--wa-color-cyan-90);\n    --wa-color-brand-80: var(--wa-color-cyan-80);\n    --wa-color-brand-70: var(--wa-color-cyan-70);\n    --wa-color-brand-60: var(--wa-color-cyan-60);\n    --wa-color-brand-50: var(--wa-color-cyan-50);\n    --wa-color-brand-40: var(--wa-color-cyan-40);\n    --wa-color-brand-30: var(--wa-color-cyan-30);\n    --wa-color-brand-20: var(--wa-color-cyan-20);\n    --wa-color-brand-10: var(--wa-color-cyan-10);\n    --wa-color-brand-05: var(--wa-color-cyan-05);\n    --wa-color-brand: var(--wa-color-cyan);\n    --wa-color-brand-on: var(--wa-color-cyan-on);\n  }\n\n  .wa-brand-indigo {\n    --wa-color-brand-95: var(--wa-color-indigo-95);\n    --wa-color-brand-90: var(--wa-color-indigo-90);\n    --wa-color-brand-80: var(--wa-color-indigo-80);\n    --wa-color-brand-70: var(--wa-color-indigo-70);\n    --wa-color-brand-60: var(--wa-color-indigo-60);\n    --wa-color-brand-50: var(--wa-color-indigo-50);\n    --wa-color-brand-40: var(--wa-color-indigo-40);\n    --wa-color-brand-30: var(--wa-color-indigo-30);\n    --wa-color-brand-20: var(--wa-color-indigo-20);\n    --wa-color-brand-10: var(--wa-color-indigo-10);\n    --wa-color-brand-05: var(--wa-color-indigo-05);\n    --wa-color-brand: var(--wa-color-indigo);\n    --wa-color-brand-on: var(--wa-color-indigo-on);\n  }\n\n  .wa-brand-purple {\n    --wa-color-brand-95: var(--wa-color-purple-95);\n    --wa-color-brand-90: var(--wa-color-purple-90);\n    --wa-color-brand-80: var(--wa-color-purple-80);\n    --wa-color-brand-70: var(--wa-color-purple-70);\n    --wa-color-brand-60: var(--wa-color-purple-60);\n    --wa-color-brand-50: var(--wa-color-purple-50);\n    --wa-color-brand-40: var(--wa-color-purple-40);\n    --wa-color-brand-30: var(--wa-color-purple-30);\n    --wa-color-brand-20: var(--wa-color-purple-20);\n    --wa-color-brand-10: var(--wa-color-purple-10);\n    --wa-color-brand-05: var(--wa-color-purple-05);\n    --wa-color-brand: var(--wa-color-purple);\n    --wa-color-brand-on: var(--wa-color-purple-on);\n  }\n\n  .wa-brand-pink {\n    --wa-color-brand-95: var(--wa-color-pink-95);\n    --wa-color-brand-90: var(--wa-color-pink-90);\n    --wa-color-brand-80: var(--wa-color-pink-80);\n    --wa-color-brand-70: var(--wa-color-pink-70);\n    --wa-color-brand-60: var(--wa-color-pink-60);\n    --wa-color-brand-50: var(--wa-color-pink-50);\n    --wa-color-brand-40: var(--wa-color-pink-40);\n    --wa-color-brand-30: var(--wa-color-pink-30);\n    --wa-color-brand-20: var(--wa-color-pink-20);\n    --wa-color-brand-10: var(--wa-color-pink-10);\n    --wa-color-brand-05: var(--wa-color-pink-05);\n    --wa-color-brand: var(--wa-color-pink);\n    --wa-color-brand-on: var(--wa-color-pink-on);\n  }\n\n  .wa-brand-gray {\n    --wa-color-brand-95: var(--wa-color-gray-95);\n    --wa-color-brand-90: var(--wa-color-gray-90);\n    --wa-color-brand-80: var(--wa-color-gray-80);\n    --wa-color-brand-70: var(--wa-color-gray-70);\n    --wa-color-brand-60: var(--wa-color-gray-60);\n    --wa-color-brand-50: var(--wa-color-gray-50);\n    --wa-color-brand-40: var(--wa-color-gray-40);\n    --wa-color-brand-30: var(--wa-color-gray-30);\n    --wa-color-brand-20: var(--wa-color-gray-20);\n    --wa-color-brand-10: var(--wa-color-gray-10);\n    --wa-color-brand-05: var(--wa-color-gray-05);\n    --wa-color-brand: var(--wa-color-gray);\n    --wa-color-brand-on: var(--wa-color-gray-on);\n  }\n}\n\n@layer wa-color-variant {\n  :where(#scpanl-root), /* default */\n  .wa-neutral-gray {\n    --wa-color-neutral-95: var(--wa-color-gray-95);\n    --wa-color-neutral-90: var(--wa-color-gray-90);\n    --wa-color-neutral-80: var(--wa-color-gray-80);\n    --wa-color-neutral-70: var(--wa-color-gray-70);\n    --wa-color-neutral-60: var(--wa-color-gray-60);\n    --wa-color-neutral-50: var(--wa-color-gray-50);\n    --wa-color-neutral-40: var(--wa-color-gray-40);\n    --wa-color-neutral-30: var(--wa-color-gray-30);\n    --wa-color-neutral-20: var(--wa-color-gray-20);\n    --wa-color-neutral-10: var(--wa-color-gray-10);\n    --wa-color-neutral-05: var(--wa-color-gray-05);\n    --wa-color-neutral: var(--wa-color-gray);\n    --wa-color-neutral-on: var(--wa-color-gray-on);\n  }\n\n  .wa-neutral-red {\n    --wa-color-neutral-95: var(--wa-color-red-95);\n    --wa-color-neutral-90: var(--wa-color-red-90);\n    --wa-color-neutral-80: var(--wa-color-red-80);\n    --wa-color-neutral-70: var(--wa-color-red-70);\n    --wa-color-neutral-60: var(--wa-color-red-60);\n    --wa-color-neutral-50: var(--wa-color-red-50);\n    --wa-color-neutral-40: var(--wa-color-red-40);\n    --wa-color-neutral-30: var(--wa-color-red-30);\n    --wa-color-neutral-20: var(--wa-color-red-20);\n    --wa-color-neutral-10: var(--wa-color-red-10);\n    --wa-color-neutral-05: var(--wa-color-red-05);\n    --wa-color-neutral: var(--wa-color-red);\n    --wa-color-neutral-on: var(--wa-color-red-on);\n  }\n\n  .wa-neutral-orange {\n    --wa-color-neutral-95: var(--wa-color-orange-95);\n    --wa-color-neutral-90: var(--wa-color-orange-90);\n    --wa-color-neutral-80: var(--wa-color-orange-80);\n    --wa-color-neutral-70: var(--wa-color-orange-70);\n    --wa-color-neutral-60: var(--wa-color-orange-60);\n    --wa-color-neutral-50: var(--wa-color-orange-50);\n    --wa-color-neutral-40: var(--wa-color-orange-40);\n    --wa-color-neutral-30: var(--wa-color-orange-30);\n    --wa-color-neutral-20: var(--wa-color-orange-20);\n    --wa-color-neutral-10: var(--wa-color-orange-10);\n    --wa-color-neutral-05: var(--wa-color-orange-05);\n    --wa-color-neutral: var(--wa-color-orange);\n    --wa-color-neutral-on: var(--wa-color-orange-on);\n  }\n\n  .wa-neutral-yellow {\n    --wa-color-neutral-95: var(--wa-color-yellow-95);\n    --wa-color-neutral-90: var(--wa-color-yellow-90);\n    --wa-color-neutral-80: var(--wa-color-yellow-80);\n    --wa-color-neutral-70: var(--wa-color-yellow-70);\n    --wa-color-neutral-60: var(--wa-color-yellow-60);\n    --wa-color-neutral-50: var(--wa-color-yellow-50);\n    --wa-color-neutral-40: var(--wa-color-yellow-40);\n    --wa-color-neutral-30: var(--wa-color-yellow-30);\n    --wa-color-neutral-20: var(--wa-color-yellow-20);\n    --wa-color-neutral-10: var(--wa-color-yellow-10);\n    --wa-color-neutral-05: var(--wa-color-yellow-05);\n    --wa-color-neutral: var(--wa-color-yellow);\n    --wa-color-neutral-on: var(--wa-color-yellow-on);\n  }\n\n  .wa-neutral-green {\n    --wa-color-neutral-95: var(--wa-color-green-95);\n    --wa-color-neutral-90: var(--wa-color-green-90);\n    --wa-color-neutral-80: var(--wa-color-green-80);\n    --wa-color-neutral-70: var(--wa-color-green-70);\n    --wa-color-neutral-60: var(--wa-color-green-60);\n    --wa-color-neutral-50: var(--wa-color-green-50);\n    --wa-color-neutral-40: var(--wa-color-green-40);\n    --wa-color-neutral-30: var(--wa-color-green-30);\n    --wa-color-neutral-20: var(--wa-color-green-20);\n    --wa-color-neutral-10: var(--wa-color-green-10);\n    --wa-color-neutral-05: var(--wa-color-green-05);\n    --wa-color-neutral: var(--wa-color-green);\n    --wa-color-neutral-on: var(--wa-color-green-on);\n  }\n\n  .wa-neutral-cyan {\n    --wa-color-neutral-95: var(--wa-color-cyan-95);\n    --wa-color-neutral-90: var(--wa-color-cyan-90);\n    --wa-color-neutral-80: var(--wa-color-cyan-80);\n    --wa-color-neutral-70: var(--wa-color-cyan-70);\n    --wa-color-neutral-60: var(--wa-color-cyan-60);\n    --wa-color-neutral-50: var(--wa-color-cyan-50);\n    --wa-color-neutral-40: var(--wa-color-cyan-40);\n    --wa-color-neutral-30: var(--wa-color-cyan-30);\n    --wa-color-neutral-20: var(--wa-color-cyan-20);\n    --wa-color-neutral-10: var(--wa-color-cyan-10);\n    --wa-color-neutral-05: var(--wa-color-cyan-05);\n    --wa-color-neutral: var(--wa-color-cyan);\n    --wa-color-neutral-on: var(--wa-color-cyan-on);\n  }\n\n  .wa-neutral-blue {\n    --wa-color-neutral-95: var(--wa-color-blue-95);\n    --wa-color-neutral-90: var(--wa-color-blue-90);\n    --wa-color-neutral-80: var(--wa-color-blue-80);\n    --wa-color-neutral-70: var(--wa-color-blue-70);\n    --wa-color-neutral-60: var(--wa-color-blue-60);\n    --wa-color-neutral-50: var(--wa-color-blue-50);\n    --wa-color-neutral-40: var(--wa-color-blue-40);\n    --wa-color-neutral-30: var(--wa-color-blue-30);\n    --wa-color-neutral-20: var(--wa-color-blue-20);\n    --wa-color-neutral-10: var(--wa-color-blue-10);\n    --wa-color-neutral-05: var(--wa-color-blue-05);\n    --wa-color-neutral: var(--wa-color-blue);\n    --wa-color-neutral-on: var(--wa-color-blue-on);\n  }\n\n  .wa-neutral-indigo {\n    --wa-color-neutral-95: var(--wa-color-indigo-95);\n    --wa-color-neutral-90: var(--wa-color-indigo-90);\n    --wa-color-neutral-80: var(--wa-color-indigo-80);\n    --wa-color-neutral-70: var(--wa-color-indigo-70);\n    --wa-color-neutral-60: var(--wa-color-indigo-60);\n    --wa-color-neutral-50: var(--wa-color-indigo-50);\n    --wa-color-neutral-40: var(--wa-color-indigo-40);\n    --wa-color-neutral-30: var(--wa-color-indigo-30);\n    --wa-color-neutral-20: var(--wa-color-indigo-20);\n    --wa-color-neutral-10: var(--wa-color-indigo-10);\n    --wa-color-neutral-05: var(--wa-color-indigo-05);\n    --wa-color-neutral: var(--wa-color-indigo);\n    --wa-color-neutral-on: var(--wa-color-indigo-on);\n  }\n\n  .wa-neutral-purple {\n    --wa-color-neutral-95: var(--wa-color-purple-95);\n    --wa-color-neutral-90: var(--wa-color-purple-90);\n    --wa-color-neutral-80: var(--wa-color-purple-80);\n    --wa-color-neutral-70: var(--wa-color-purple-70);\n    --wa-color-neutral-60: var(--wa-color-purple-60);\n    --wa-color-neutral-50: var(--wa-color-purple-50);\n    --wa-color-neutral-40: var(--wa-color-purple-40);\n    --wa-color-neutral-30: var(--wa-color-purple-30);\n    --wa-color-neutral-20: var(--wa-color-purple-20);\n    --wa-color-neutral-10: var(--wa-color-purple-10);\n    --wa-color-neutral-05: var(--wa-color-purple-05);\n    --wa-color-neutral: var(--wa-color-purple);\n    --wa-color-neutral-on: var(--wa-color-purple-on);\n  }\n\n  .wa-neutral-pink {\n    --wa-color-neutral-95: var(--wa-color-pink-95);\n    --wa-color-neutral-90: var(--wa-color-pink-90);\n    --wa-color-neutral-80: var(--wa-color-pink-80);\n    --wa-color-neutral-70: var(--wa-color-pink-70);\n    --wa-color-neutral-60: var(--wa-color-pink-60);\n    --wa-color-neutral-50: var(--wa-color-pink-50);\n    --wa-color-neutral-40: var(--wa-color-pink-40);\n    --wa-color-neutral-30: var(--wa-color-pink-30);\n    --wa-color-neutral-20: var(--wa-color-pink-20);\n    --wa-color-neutral-10: var(--wa-color-pink-10);\n    --wa-color-neutral-05: var(--wa-color-pink-05);\n    --wa-color-neutral: var(--wa-color-pink);\n    --wa-color-neutral-on: var(--wa-color-pink-on);\n  }\n}\n\n@layer wa-color-variant {\n  :where(#scpanl-root), /* default */\n  .wa-success-green {\n    --wa-color-success-95: var(--wa-color-green-95);\n    --wa-color-success-90: var(--wa-color-green-90);\n    --wa-color-success-80: var(--wa-color-green-80);\n    --wa-color-success-70: var(--wa-color-green-70);\n    --wa-color-success-60: var(--wa-color-green-60);\n    --wa-color-success-50: var(--wa-color-green-50);\n    --wa-color-success-40: var(--wa-color-green-40);\n    --wa-color-success-30: var(--wa-color-green-30);\n    --wa-color-success-20: var(--wa-color-green-20);\n    --wa-color-success-10: var(--wa-color-green-10);\n    --wa-color-success-05: var(--wa-color-green-05);\n    --wa-color-success: var(--wa-color-green);\n    --wa-color-success-on: var(--wa-color-green-on);\n  }\n\n  .wa-success-red {\n    --wa-color-success-95: var(--wa-color-red-95);\n    --wa-color-success-90: var(--wa-color-red-90);\n    --wa-color-success-80: var(--wa-color-red-80);\n    --wa-color-success-70: var(--wa-color-red-70);\n    --wa-color-success-60: var(--wa-color-red-60);\n    --wa-color-success-50: var(--wa-color-red-50);\n    --wa-color-success-40: var(--wa-color-red-40);\n    --wa-color-success-30: var(--wa-color-red-30);\n    --wa-color-success-20: var(--wa-color-red-20);\n    --wa-color-success-10: var(--wa-color-red-10);\n    --wa-color-success-05: var(--wa-color-red-05);\n    --wa-color-success: var(--wa-color-red);\n    --wa-color-success-on: var(--wa-color-red-on);\n  }\n\n  .wa-success-orange {\n    --wa-color-success-95: var(--wa-color-orange-95);\n    --wa-color-success-90: var(--wa-color-orange-90);\n    --wa-color-success-80: var(--wa-color-orange-80);\n    --wa-color-success-70: var(--wa-color-orange-70);\n    --wa-color-success-60: var(--wa-color-orange-60);\n    --wa-color-success-50: var(--wa-color-orange-50);\n    --wa-color-success-40: var(--wa-color-orange-40);\n    --wa-color-success-30: var(--wa-color-orange-30);\n    --wa-color-success-20: var(--wa-color-orange-20);\n    --wa-color-success-10: var(--wa-color-orange-10);\n    --wa-color-success-05: var(--wa-color-orange-05);\n    --wa-color-success: var(--wa-color-orange);\n    --wa-color-success-on: var(--wa-color-orange-on);\n  }\n\n  .wa-success-yellow {\n    --wa-color-success-95: var(--wa-color-yellow-95);\n    --wa-color-success-90: var(--wa-color-yellow-90);\n    --wa-color-success-80: var(--wa-color-yellow-80);\n    --wa-color-success-70: var(--wa-color-yellow-70);\n    --wa-color-success-60: var(--wa-color-yellow-60);\n    --wa-color-success-50: var(--wa-color-yellow-50);\n    --wa-color-success-40: var(--wa-color-yellow-40);\n    --wa-color-success-30: var(--wa-color-yellow-30);\n    --wa-color-success-20: var(--wa-color-yellow-20);\n    --wa-color-success-10: var(--wa-color-yellow-10);\n    --wa-color-success-05: var(--wa-color-yellow-05);\n    --wa-color-success: var(--wa-color-yellow);\n    --wa-color-success-on: var(--wa-color-yellow-on);\n  }\n\n  .wa-success-cyan {\n    --wa-color-success-95: var(--wa-color-cyan-95);\n    --wa-color-success-90: var(--wa-color-cyan-90);\n    --wa-color-success-80: var(--wa-color-cyan-80);\n    --wa-color-success-70: var(--wa-color-cyan-70);\n    --wa-color-success-60: var(--wa-color-cyan-60);\n    --wa-color-success-50: var(--wa-color-cyan-50);\n    --wa-color-success-40: var(--wa-color-cyan-40);\n    --wa-color-success-30: var(--wa-color-cyan-30);\n    --wa-color-success-20: var(--wa-color-cyan-20);\n    --wa-color-success-10: var(--wa-color-cyan-10);\n    --wa-color-success-05: var(--wa-color-cyan-05);\n    --wa-color-success: var(--wa-color-cyan);\n    --wa-color-success-on: var(--wa-color-cyan-on);\n  }\n\n  .wa-success-blue {\n    --wa-color-success-95: var(--wa-color-blue-95);\n    --wa-color-success-90: var(--wa-color-blue-90);\n    --wa-color-success-80: var(--wa-color-blue-80);\n    --wa-color-success-70: var(--wa-color-blue-70);\n    --wa-color-success-60: var(--wa-color-blue-60);\n    --wa-color-success-50: var(--wa-color-blue-50);\n    --wa-color-success-40: var(--wa-color-blue-40);\n    --wa-color-success-30: var(--wa-color-blue-30);\n    --wa-color-success-20: var(--wa-color-blue-20);\n    --wa-color-success-10: var(--wa-color-blue-10);\n    --wa-color-success-05: var(--wa-color-blue-05);\n    --wa-color-success: var(--wa-color-blue);\n    --wa-color-success-on: var(--wa-color-blue-on);\n  }\n\n  .wa-success-indigo {\n    --wa-color-success-95: var(--wa-color-indigo-95);\n    --wa-color-success-90: var(--wa-color-indigo-90);\n    --wa-color-success-80: var(--wa-color-indigo-80);\n    --wa-color-success-70: var(--wa-color-indigo-70);\n    --wa-color-success-60: var(--wa-color-indigo-60);\n    --wa-color-success-50: var(--wa-color-indigo-50);\n    --wa-color-success-40: var(--wa-color-indigo-40);\n    --wa-color-success-30: var(--wa-color-indigo-30);\n    --wa-color-success-20: var(--wa-color-indigo-20);\n    --wa-color-success-10: var(--wa-color-indigo-10);\n    --wa-color-success-05: var(--wa-color-indigo-05);\n    --wa-color-success: var(--wa-color-indigo);\n    --wa-color-success-on: var(--wa-color-indigo-on);\n  }\n\n  .wa-success-purple {\n    --wa-color-success-95: var(--wa-color-purple-95);\n    --wa-color-success-90: var(--wa-color-purple-90);\n    --wa-color-success-80: var(--wa-color-purple-80);\n    --wa-color-success-70: var(--wa-color-purple-70);\n    --wa-color-success-60: var(--wa-color-purple-60);\n    --wa-color-success-50: var(--wa-color-purple-50);\n    --wa-color-success-40: var(--wa-color-purple-40);\n    --wa-color-success-30: var(--wa-color-purple-30);\n    --wa-color-success-20: var(--wa-color-purple-20);\n    --wa-color-success-10: var(--wa-color-purple-10);\n    --wa-color-success-05: var(--wa-color-purple-05);\n    --wa-color-success: var(--wa-color-purple);\n    --wa-color-success-on: var(--wa-color-purple-on);\n  }\n\n  .wa-success-pink {\n    --wa-color-success-95: var(--wa-color-pink-95);\n    --wa-color-success-90: var(--wa-color-pink-90);\n    --wa-color-success-80: var(--wa-color-pink-80);\n    --wa-color-success-70: var(--wa-color-pink-70);\n    --wa-color-success-60: var(--wa-color-pink-60);\n    --wa-color-success-50: var(--wa-color-pink-50);\n    --wa-color-success-40: var(--wa-color-pink-40);\n    --wa-color-success-30: var(--wa-color-pink-30);\n    --wa-color-success-20: var(--wa-color-pink-20);\n    --wa-color-success-10: var(--wa-color-pink-10);\n    --wa-color-success-05: var(--wa-color-pink-05);\n    --wa-color-success: var(--wa-color-pink);\n    --wa-color-success-on: var(--wa-color-pink-on);\n  }\n\n  .wa-success-gray {\n    --wa-color-success-95: var(--wa-color-gray-95);\n    --wa-color-success-90: var(--wa-color-gray-90);\n    --wa-color-success-80: var(--wa-color-gray-80);\n    --wa-color-success-70: var(--wa-color-gray-70);\n    --wa-color-success-60: var(--wa-color-gray-60);\n    --wa-color-success-50: var(--wa-color-gray-50);\n    --wa-color-success-40: var(--wa-color-gray-40);\n    --wa-color-success-30: var(--wa-color-gray-30);\n    --wa-color-success-20: var(--wa-color-gray-20);\n    --wa-color-success-10: var(--wa-color-gray-10);\n    --wa-color-success-05: var(--wa-color-gray-05);\n    --wa-color-success: var(--wa-color-gray);\n    --wa-color-success-on: var(--wa-color-gray-on);\n  }\n}\n\n@layer wa-color-variant {\n  :where(#scpanl-root), /* default */\n  .wa-warning-yellow {\n    --wa-color-warning-95: var(--wa-color-yellow-95);\n    --wa-color-warning-90: var(--wa-color-yellow-90);\n    --wa-color-warning-80: var(--wa-color-yellow-80);\n    --wa-color-warning-70: var(--wa-color-yellow-70);\n    --wa-color-warning-60: var(--wa-color-yellow-60);\n    --wa-color-warning-50: var(--wa-color-yellow-50);\n    --wa-color-warning-40: var(--wa-color-yellow-40);\n    --wa-color-warning-30: var(--wa-color-yellow-30);\n    --wa-color-warning-20: var(--wa-color-yellow-20);\n    --wa-color-warning-10: var(--wa-color-yellow-10);\n    --wa-color-warning-05: var(--wa-color-yellow-05);\n    --wa-color-warning: var(--wa-color-yellow);\n    --wa-color-warning-on: var(--wa-color-yellow-on);\n  }\n\n  .wa-warning-red {\n    --wa-color-warning-95: var(--wa-color-red-95);\n    --wa-color-warning-90: var(--wa-color-red-90);\n    --wa-color-warning-80: var(--wa-color-red-80);\n    --wa-color-warning-70: var(--wa-color-red-70);\n    --wa-color-warning-60: var(--wa-color-red-60);\n    --wa-color-warning-50: var(--wa-color-red-50);\n    --wa-color-warning-40: var(--wa-color-red-40);\n    --wa-color-warning-30: var(--wa-color-red-30);\n    --wa-color-warning-20: var(--wa-color-red-20);\n    --wa-color-warning-10: var(--wa-color-red-10);\n    --wa-color-warning-05: var(--wa-color-red-05);\n    --wa-color-warning: var(--wa-color-red);\n    --wa-color-warning-on: var(--wa-color-red-on);\n  }\n\n  .wa-warning-orange {\n    --wa-color-warning-95: var(--wa-color-orange-95);\n    --wa-color-warning-90: var(--wa-color-orange-90);\n    --wa-color-warning-80: var(--wa-color-orange-80);\n    --wa-color-warning-70: var(--wa-color-orange-70);\n    --wa-color-warning-60: var(--wa-color-orange-60);\n    --wa-color-warning-50: var(--wa-color-orange-50);\n    --wa-color-warning-40: var(--wa-color-orange-40);\n    --wa-color-warning-30: var(--wa-color-orange-30);\n    --wa-color-warning-20: var(--wa-color-orange-20);\n    --wa-color-warning-10: var(--wa-color-orange-10);\n    --wa-color-warning-05: var(--wa-color-orange-05);\n    --wa-color-warning: var(--wa-color-orange);\n    --wa-color-warning-on: var(--wa-color-orange-on);\n  }\n\n  .wa-warning-green {\n    --wa-color-warning-95: var(--wa-color-green-95);\n    --wa-color-warning-90: var(--wa-color-green-90);\n    --wa-color-warning-80: var(--wa-color-green-80);\n    --wa-color-warning-70: var(--wa-color-green-70);\n    --wa-color-warning-60: var(--wa-color-green-60);\n    --wa-color-warning-50: var(--wa-color-green-50);\n    --wa-color-warning-40: var(--wa-color-green-40);\n    --wa-color-warning-30: var(--wa-color-green-30);\n    --wa-color-warning-20: var(--wa-color-green-20);\n    --wa-color-warning-10: var(--wa-color-green-10);\n    --wa-color-warning-05: var(--wa-color-green-05);\n    --wa-color-warning: var(--wa-color-green);\n    --wa-color-warning-on: var(--wa-color-green-on);\n  }\n\n  .wa-warning-cyan {\n    --wa-color-warning-95: var(--wa-color-cyan-95);\n    --wa-color-warning-90: var(--wa-color-cyan-90);\n    --wa-color-warning-80: var(--wa-color-cyan-80);\n    --wa-color-warning-70: var(--wa-color-cyan-70);\n    --wa-color-warning-60: var(--wa-color-cyan-60);\n    --wa-color-warning-50: var(--wa-color-cyan-50);\n    --wa-color-warning-40: var(--wa-color-cyan-40);\n    --wa-color-warning-30: var(--wa-color-cyan-30);\n    --wa-color-warning-20: var(--wa-color-cyan-20);\n    --wa-color-warning-10: var(--wa-color-cyan-10);\n    --wa-color-warning-05: var(--wa-color-cyan-05);\n    --wa-color-warning: var(--wa-color-cyan);\n    --wa-color-warning-on: var(--wa-color-cyan-on);\n  }\n\n  .wa-warning-blue {\n    --wa-color-warning-95: var(--wa-color-blue-95);\n    --wa-color-warning-90: var(--wa-color-blue-90);\n    --wa-color-warning-80: var(--wa-color-blue-80);\n    --wa-color-warning-70: var(--wa-color-blue-70);\n    --wa-color-warning-60: var(--wa-color-blue-60);\n    --wa-color-warning-50: var(--wa-color-blue-50);\n    --wa-color-warning-40: var(--wa-color-blue-40);\n    --wa-color-warning-30: var(--wa-color-blue-30);\n    --wa-color-warning-20: var(--wa-color-blue-20);\n    --wa-color-warning-10: var(--wa-color-blue-10);\n    --wa-color-warning-05: var(--wa-color-blue-05);\n    --wa-color-warning: var(--wa-color-blue);\n    --wa-color-warning-on: var(--wa-color-blue-on);\n  }\n\n  .wa-warning-indigo {\n    --wa-color-warning-95: var(--wa-color-indigo-95);\n    --wa-color-warning-90: var(--wa-color-indigo-90);\n    --wa-color-warning-80: var(--wa-color-indigo-80);\n    --wa-color-warning-70: var(--wa-color-indigo-70);\n    --wa-color-warning-60: var(--wa-color-indigo-60);\n    --wa-color-warning-50: var(--wa-color-indigo-50);\n    --wa-color-warning-40: var(--wa-color-indigo-40);\n    --wa-color-warning-30: var(--wa-color-indigo-30);\n    --wa-color-warning-20: var(--wa-color-indigo-20);\n    --wa-color-warning-10: var(--wa-color-indigo-10);\n    --wa-color-warning-05: var(--wa-color-indigo-05);\n    --wa-color-warning: var(--wa-color-indigo);\n    --wa-color-warning-on: var(--wa-color-indigo-on);\n  }\n\n  .wa-warning-purple {\n    --wa-color-warning-95: var(--wa-color-purple-95);\n    --wa-color-warning-90: var(--wa-color-purple-90);\n    --wa-color-warning-80: var(--wa-color-purple-80);\n    --wa-color-warning-70: var(--wa-color-purple-70);\n    --wa-color-warning-60: var(--wa-color-purple-60);\n    --wa-color-warning-50: var(--wa-color-purple-50);\n    --wa-color-warning-40: var(--wa-color-purple-40);\n    --wa-color-warning-30: var(--wa-color-purple-30);\n    --wa-color-warning-20: var(--wa-color-purple-20);\n    --wa-color-warning-10: var(--wa-color-purple-10);\n    --wa-color-warning-05: var(--wa-color-purple-05);\n    --wa-color-warning: var(--wa-color-purple);\n    --wa-color-warning-on: var(--wa-color-purple-on);\n  }\n\n  .wa-warning-pink {\n    --wa-color-warning-95: var(--wa-color-pink-95);\n    --wa-color-warning-90: var(--wa-color-pink-90);\n    --wa-color-warning-80: var(--wa-color-pink-80);\n    --wa-color-warning-70: var(--wa-color-pink-70);\n    --wa-color-warning-60: var(--wa-color-pink-60);\n    --wa-color-warning-50: var(--wa-color-pink-50);\n    --wa-color-warning-40: var(--wa-color-pink-40);\n    --wa-color-warning-30: var(--wa-color-pink-30);\n    --wa-color-warning-20: var(--wa-color-pink-20);\n    --wa-color-warning-10: var(--wa-color-pink-10);\n    --wa-color-warning-05: var(--wa-color-pink-05);\n    --wa-color-warning: var(--wa-color-pink);\n    --wa-color-warning-on: var(--wa-color-pink-on);\n  }\n\n  .wa-warning-gray {\n    --wa-color-warning-95: var(--wa-color-gray-95);\n    --wa-color-warning-90: var(--wa-color-gray-90);\n    --wa-color-warning-80: var(--wa-color-gray-80);\n    --wa-color-warning-70: var(--wa-color-gray-70);\n    --wa-color-warning-60: var(--wa-color-gray-60);\n    --wa-color-warning-50: var(--wa-color-gray-50);\n    --wa-color-warning-40: var(--wa-color-gray-40);\n    --wa-color-warning-30: var(--wa-color-gray-30);\n    --wa-color-warning-20: var(--wa-color-gray-20);\n    --wa-color-warning-10: var(--wa-color-gray-10);\n    --wa-color-warning-05: var(--wa-color-gray-05);\n    --wa-color-warning: var(--wa-color-gray);\n    --wa-color-warning-on: var(--wa-color-gray-on);\n  }\n}\n\n@layer wa-color-variant {\n  :where(#scpanl-root), /* default */\n  .wa-danger-red {\n    --wa-color-danger-95: var(--wa-color-red-95);\n    --wa-color-danger-90: var(--wa-color-red-90);\n    --wa-color-danger-80: var(--wa-color-red-80);\n    --wa-color-danger-70: var(--wa-color-red-70);\n    --wa-color-danger-60: var(--wa-color-red-60);\n    --wa-color-danger-50: var(--wa-color-red-50);\n    --wa-color-danger-40: var(--wa-color-red-40);\n    --wa-color-danger-30: var(--wa-color-red-30);\n    --wa-color-danger-20: var(--wa-color-red-20);\n    --wa-color-danger-10: var(--wa-color-red-10);\n    --wa-color-danger-05: var(--wa-color-red-05);\n    --wa-color-danger: var(--wa-color-red);\n    --wa-color-danger-on: var(--wa-color-red-on);\n  }\n\n  .wa-danger-orange {\n    --wa-color-danger-95: var(--wa-color-orange-95);\n    --wa-color-danger-90: var(--wa-color-orange-90);\n    --wa-color-danger-80: var(--wa-color-orange-80);\n    --wa-color-danger-70: var(--wa-color-orange-70);\n    --wa-color-danger-60: var(--wa-color-orange-60);\n    --wa-color-danger-50: var(--wa-color-orange-50);\n    --wa-color-danger-40: var(--wa-color-orange-40);\n    --wa-color-danger-30: var(--wa-color-orange-30);\n    --wa-color-danger-20: var(--wa-color-orange-20);\n    --wa-color-danger-10: var(--wa-color-orange-10);\n    --wa-color-danger-05: var(--wa-color-orange-05);\n    --wa-color-danger: var(--wa-color-orange);\n    --wa-color-danger-on: var(--wa-color-orange-on);\n  }\n\n  .wa-danger-yellow {\n    --wa-color-danger-95: var(--wa-color-yellow-95);\n    --wa-color-danger-90: var(--wa-color-yellow-90);\n    --wa-color-danger-80: var(--wa-color-yellow-80);\n    --wa-color-danger-70: var(--wa-color-yellow-70);\n    --wa-color-danger-60: var(--wa-color-yellow-60);\n    --wa-color-danger-50: var(--wa-color-yellow-50);\n    --wa-color-danger-40: var(--wa-color-yellow-40);\n    --wa-color-danger-30: var(--wa-color-yellow-30);\n    --wa-color-danger-20: var(--wa-color-yellow-20);\n    --wa-color-danger-10: var(--wa-color-yellow-10);\n    --wa-color-danger-05: var(--wa-color-yellow-05);\n    --wa-color-danger: var(--wa-color-yellow);\n    --wa-color-danger-on: var(--wa-color-yellow-on);\n  }\n\n  .wa-danger-green {\n    --wa-color-danger-95: var(--wa-color-green-95);\n    --wa-color-danger-90: var(--wa-color-green-90);\n    --wa-color-danger-80: var(--wa-color-green-80);\n    --wa-color-danger-70: var(--wa-color-green-70);\n    --wa-color-danger-60: var(--wa-color-green-60);\n    --wa-color-danger-50: var(--wa-color-green-50);\n    --wa-color-danger-40: var(--wa-color-green-40);\n    --wa-color-danger-30: var(--wa-color-green-30);\n    --wa-color-danger-20: var(--wa-color-green-20);\n    --wa-color-danger-10: var(--wa-color-green-10);\n    --wa-color-danger-05: var(--wa-color-green-05);\n    --wa-color-danger: var(--wa-color-green);\n    --wa-color-danger-on: var(--wa-color-green-on);\n  }\n\n  .wa-danger-cyan {\n    --wa-color-danger-95: var(--wa-color-cyan-95);\n    --wa-color-danger-90: var(--wa-color-cyan-90);\n    --wa-color-danger-80: var(--wa-color-cyan-80);\n    --wa-color-danger-70: var(--wa-color-cyan-70);\n    --wa-color-danger-60: var(--wa-color-cyan-60);\n    --wa-color-danger-50: var(--wa-color-cyan-50);\n    --wa-color-danger-40: var(--wa-color-cyan-40);\n    --wa-color-danger-30: var(--wa-color-cyan-30);\n    --wa-color-danger-20: var(--wa-color-cyan-20);\n    --wa-color-danger-10: var(--wa-color-cyan-10);\n    --wa-color-danger-05: var(--wa-color-cyan-05);\n    --wa-color-danger: var(--wa-color-cyan);\n    --wa-color-danger-on: var(--wa-color-cyan-on);\n  }\n\n  .wa-danger-blue {\n    --wa-color-danger-95: var(--wa-color-blue-95);\n    --wa-color-danger-90: var(--wa-color-blue-90);\n    --wa-color-danger-80: var(--wa-color-blue-80);\n    --wa-color-danger-70: var(--wa-color-blue-70);\n    --wa-color-danger-60: var(--wa-color-blue-60);\n    --wa-color-danger-50: var(--wa-color-blue-50);\n    --wa-color-danger-40: var(--wa-color-blue-40);\n    --wa-color-danger-30: var(--wa-color-blue-30);\n    --wa-color-danger-20: var(--wa-color-blue-20);\n    --wa-color-danger-10: var(--wa-color-blue-10);\n    --wa-color-danger-05: var(--wa-color-blue-05);\n    --wa-color-danger: var(--wa-color-blue);\n    --wa-color-danger-on: var(--wa-color-blue-on);\n  }\n\n  .wa-danger-indigo {\n    --wa-color-danger-95: var(--wa-color-indigo-95);\n    --wa-color-danger-90: var(--wa-color-indigo-90);\n    --wa-color-danger-80: var(--wa-color-indigo-80);\n    --wa-color-danger-70: var(--wa-color-indigo-70);\n    --wa-color-danger-60: var(--wa-color-indigo-60);\n    --wa-color-danger-50: var(--wa-color-indigo-50);\n    --wa-color-danger-40: var(--wa-color-indigo-40);\n    --wa-color-danger-30: var(--wa-color-indigo-30);\n    --wa-color-danger-20: var(--wa-color-indigo-20);\n    --wa-color-danger-10: var(--wa-color-indigo-10);\n    --wa-color-danger-05: var(--wa-color-indigo-05);\n    --wa-color-danger: var(--wa-color-indigo);\n    --wa-color-danger-on: var(--wa-color-indigo-on);\n  }\n\n  .wa-danger-purple {\n    --wa-color-danger-95: var(--wa-color-purple-95);\n    --wa-color-danger-90: var(--wa-color-purple-90);\n    --wa-color-danger-80: var(--wa-color-purple-80);\n    --wa-color-danger-70: var(--wa-color-purple-70);\n    --wa-color-danger-60: var(--wa-color-purple-60);\n    --wa-color-danger-50: var(--wa-color-purple-50);\n    --wa-color-danger-40: var(--wa-color-purple-40);\n    --wa-color-danger-30: var(--wa-color-purple-30);\n    --wa-color-danger-20: var(--wa-color-purple-20);\n    --wa-color-danger-10: var(--wa-color-purple-10);\n    --wa-color-danger-05: var(--wa-color-purple-05);\n    --wa-color-danger: var(--wa-color-purple);\n    --wa-color-danger-on: var(--wa-color-purple-on);\n  }\n\n  .wa-danger-pink {\n    --wa-color-danger-95: var(--wa-color-pink-95);\n    --wa-color-danger-90: var(--wa-color-pink-90);\n    --wa-color-danger-80: var(--wa-color-pink-80);\n    --wa-color-danger-70: var(--wa-color-pink-70);\n    --wa-color-danger-60: var(--wa-color-pink-60);\n    --wa-color-danger-50: var(--wa-color-pink-50);\n    --wa-color-danger-40: var(--wa-color-pink-40);\n    --wa-color-danger-30: var(--wa-color-pink-30);\n    --wa-color-danger-20: var(--wa-color-pink-20);\n    --wa-color-danger-10: var(--wa-color-pink-10);\n    --wa-color-danger-05: var(--wa-color-pink-05);\n    --wa-color-danger: var(--wa-color-pink);\n    --wa-color-danger-on: var(--wa-color-pink-on);\n  }\n\n  .wa-danger-gray {\n    --wa-color-danger-95: var(--wa-color-gray-95);\n    --wa-color-danger-90: var(--wa-color-gray-90);\n    --wa-color-danger-80: var(--wa-color-gray-80);\n    --wa-color-danger-70: var(--wa-color-gray-70);\n    --wa-color-danger-60: var(--wa-color-gray-60);\n    --wa-color-danger-50: var(--wa-color-gray-50);\n    --wa-color-danger-40: var(--wa-color-gray-40);\n    --wa-color-danger-30: var(--wa-color-gray-30);\n    --wa-color-danger-20: var(--wa-color-gray-20);\n    --wa-color-danger-10: var(--wa-color-gray-10);\n    --wa-color-danger-05: var(--wa-color-gray-05);\n    --wa-color-danger: var(--wa-color-gray);\n    --wa-color-danger-on: var(--wa-color-gray-on);\n  }\n}\n\n\n\n/* Generates --wa-color-{hue}-on tokens for pairing with any palette's key colors */\n:where(#scpanl-root),\n:host {\n  /**\n    * Conditional tokens to check if the key color is >= 60\n    * Key colors are the most colorful tint in a scale, recorded as --wa-color-{hue} in each palette\n    * The numeric value of the key is isolated as --wa-color-{hue}-key\n    * If key < 60, the result is 0%\n    * If key >= 60, the result is 100%\n    * Intended to be used in the color-mix() functions below\n    */\n\n  --wa-color-red-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-red-key), 1) * 100%));\n  --wa-color-orange-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-orange-key), 1) * 100%));\n  --wa-color-yellow-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-yellow-key), 1) * 100%));\n  --wa-color-green-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-green-key), 1) * 100%));\n  --wa-color-cyan-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-cyan-key), 1) * 100%));\n  --wa-color-blue-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-blue-key), 1) * 100%));\n  --wa-color-indigo-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-indigo-key), 1) * 100%));\n  --wa-color-purple-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-purple-key), 1) * 100%));\n  --wa-color-pink-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-pink-key), 1) * 100%));\n  --wa-color-gray-gte-60: calc(100% - (clamp(0, 60 - var(--wa-color-gray-key), 1) * 100%));\n\n  /**\n    * Tokens to set text color with appropriate WCAG 2.1 contrast\n    * If key < 60, the text color is white\n    * If key >= 60, the text color is {hue}-10\n    */\n\n  --wa-color-red-on: color-mix(in oklab, var(--wa-color-red-10) var(--wa-color-red-gte-60), white);\n  --wa-color-orange-on: color-mix(in oklab, var(--wa-color-orange-10) var(--wa-color-orange-gte-60), white);\n  --wa-color-yellow-on: color-mix(in oklab, var(--wa-color-yellow-10) var(--wa-color-yellow-gte-60), white);\n  --wa-color-green-on: color-mix(in oklab, var(--wa-color-green-10) var(--wa-color-green-gte-60), white);\n  --wa-color-cyan-on: color-mix(in oklab, var(--wa-color-cyan-10) var(--wa-color-cyan-gte-60), white);\n  --wa-color-blue-on: color-mix(in oklab, var(--wa-color-blue-10) var(--wa-color-blue-gte-60), white);\n  --wa-color-indigo-on: color-mix(in oklab, var(--wa-color-indigo-10) var(--wa-color-indigo-gte-60), white);\n  --wa-color-purple-on: color-mix(in oklab, var(--wa-color-purple-10) var(--wa-color-purple-gte-60), white);\n  --wa-color-pink-on: color-mix(in oklab, var(--wa-color-pink-10) var(--wa-color-pink-gte-60), white);\n  --wa-color-gray-on: color-mix(in oklab, var(--wa-color-gray-10) var(--wa-color-gray-gte-60), white);\n}\n\n\n@layer wa-color-palette {\n  :where(#scpanl-root),\n  .wa-palette-default {\n    --wa-color-red-95: #fff0ef /* oklch(96.667% 0.01632 22.08) */;\n    --wa-color-red-90: #ffdedc /* oklch(92.735% 0.03679 21.966) */;\n    --wa-color-red-80: #ffb8b6 /* oklch(84.803% 0.08289 20.771) */;\n    --wa-color-red-70: #fd8f90 /* oklch(76.801% 0.13322 20.052) */;\n    --wa-color-red-60: #f3676c /* oklch(68.914% 0.17256 20.646) */;\n    --wa-color-red-50: #dc3146 /* oklch(58.857% 0.20512 20.223) */;\n    --wa-color-red-40: #b30532 /* oklch(48.737% 0.19311 18.413) */;\n    --wa-color-red-30: #8a132c /* oklch(41.17% 0.1512 16.771) */;\n    --wa-color-red-20: #631323 /* oklch(33.297% 0.11208 14.847) */;\n    --wa-color-red-10: #3e0913 /* oklch(24.329% 0.08074 15.207) */;\n    --wa-color-red-05: #2a040b /* oklch(19.016% 0.06394 13.71) */;\n    --wa-color-red: var(--wa-color-red-50);\n    --wa-color-red-key: 50;\n\n    --wa-color-orange-95: #fff0e6 /* oklch(96.426% 0.02105 56.133) */;\n    --wa-color-orange-90: #ffdfca /* oklch(92.468% 0.04529 55.325) */;\n    --wa-color-orange-80: #ffbb94 /* oklch(84.588% 0.09454 50.876) */;\n    --wa-color-orange-70: #ff9266 /* oklch(76.744% 0.14429 42.309) */;\n    --wa-color-orange-60: #f46a45 /* oklch(68.848% 0.17805 35.951) */;\n    --wa-color-orange-50: #cd491c /* oklch(58.195% 0.17597 37.577) */;\n    --wa-color-orange-40: #9f3501 /* oklch(47.889% 0.14981 39.957) */;\n    --wa-color-orange-30: #802700 /* oklch(40.637% 0.1298 39.149) */;\n    --wa-color-orange-20: #601b00 /* oklch(33.123% 0.10587 39.117) */;\n    --wa-color-orange-10: #3c0d00 /* oklch(24.043% 0.07768 38.607) */;\n    --wa-color-orange-05: #280600 /* oklch(18.644% 0.0607 38.252) */;\n    --wa-color-orange: var(--wa-color-orange-60);\n    --wa-color-orange-key: 60;\n\n    --wa-color-yellow-95: #fef3cd /* oklch(96.322% 0.05069 93.748) */;\n    --wa-color-yellow-90: #ffe495 /* oklch(92.377% 0.10246 91.296) */;\n    --wa-color-yellow-80: #fac22b /* oklch(84.185% 0.16263 85.991) */;\n    --wa-color-yellow-70: #ef9d00 /* oklch(75.949% 0.16251 72.13) */;\n    --wa-color-yellow-60: #da7e00 /* oklch(67.883% 0.15587 62.246) */;\n    --wa-color-yellow-50: #b45f04 /* oklch(57.449% 0.13836 56.585) */;\n    --wa-color-yellow-40: #8c4602 /* oklch(47.319% 0.11666 54.663) */;\n    --wa-color-yellow-30: #6f3601 /* oklch(40.012% 0.09892 54.555) */;\n    --wa-color-yellow-20: #532600 /* oklch(32.518% 0.08157 53.927) */;\n    --wa-color-yellow-10: #331600 /* oklch(23.846% 0.05834 56.02) */;\n    --wa-color-yellow-05: #220c00 /* oklch(18.585% 0.04625 54.588) */;\n    --wa-color-yellow: var(--wa-color-yellow-80);\n    --wa-color-yellow-key: 80;\n\n    --wa-color-green-95: #e3f9e3 /* oklch(96.006% 0.03715 145.28) */;\n    --wa-color-green-90: #c2f2c1 /* oklch(91.494% 0.08233 144.35) */;\n    --wa-color-green-80: #93da98 /* oklch(82.445% 0.11601 146.11) */;\n    --wa-color-green-70: #5dc36f /* oklch(73.554% 0.15308 147.59) */;\n    --wa-color-green-60: #00ac49 /* oklch(64.982% 0.18414 148.83) */;\n    --wa-color-green-50: #00883c /* oklch(54.765% 0.15165 149.77) */;\n    --wa-color-green-40: #036730 /* oklch(45.004% 0.11963 151.06) */;\n    --wa-color-green-30: #0a5027 /* oklch(37.988% 0.09487 151.62) */;\n    --wa-color-green-20: #0a3a1d /* oklch(30.876% 0.07202 152.23) */;\n    --wa-color-green-10: #052310 /* oklch(22.767% 0.05128 152.45) */;\n    --wa-color-green-05: #031608 /* oklch(17.84% 0.03957 151.36) */;\n    --wa-color-green: var(--wa-color-green-60);\n    --wa-color-green-key: 60;\n\n    --wa-color-cyan-95: #e3f6fb /* oklch(96.063% 0.02111 215.26) */;\n    --wa-color-cyan-90: #c5ecf7 /* oklch(91.881% 0.04314 216.7) */;\n    --wa-color-cyan-80: #7fd6ec /* oklch(82.906% 0.08934 215.86) */;\n    --wa-color-cyan-70: #2fbedc /* oklch(74.18% 0.12169 215.86) */;\n    --wa-color-cyan-60: #00a3c0 /* oklch(65.939% 0.11738 216.42) */;\n    --wa-color-cyan-50: #078098 /* oklch(55.379% 0.09774 217.32) */;\n    --wa-color-cyan-40: #026274 /* oklch(45.735% 0.08074 216.18) */;\n    --wa-color-cyan-30: #014c5b /* oklch(38.419% 0.06817 216.88) */;\n    --wa-color-cyan-20: #003844 /* oklch(31.427% 0.05624 217.32) */;\n    --wa-color-cyan-10: #002129 /* oklch(22.851% 0.04085 217.17) */;\n    --wa-color-cyan-05: #00151b /* oklch(18.055% 0.03231 217.31) */;\n    --wa-color-cyan: var(--wa-color-cyan-70);\n    --wa-color-cyan-key: 70;\n\n    --wa-color-blue-95: #e8f3ff /* oklch(95.944% 0.01996 250.38) */;\n    --wa-color-blue-90: #d1e8ff /* oklch(92.121% 0.03985 248.26) */;\n    --wa-color-blue-80: #9fceff /* oklch(83.572% 0.08502 249.92) */;\n    --wa-color-blue-70: #6eb3ff /* oklch(75.256% 0.1308 252.03) */;\n    --wa-color-blue-60: #3e96ff /* oklch(67.196% 0.17661 254.97) */;\n    --wa-color-blue-50: #0071ec /* oklch(56.972% 0.20461 257.29) */;\n    --wa-color-blue-40: #0053c0 /* oklch(47.175% 0.1846 259.19) */;\n    --wa-color-blue-30: #003f9c /* oklch(39.805% 0.16217 259.98) */;\n    --wa-color-blue-20: #002d77 /* oklch(32.436% 0.1349 260.35) */;\n    --wa-color-blue-10: #001a4e /* oklch(23.965% 0.10161 260.68) */;\n    --wa-color-blue-05: #000f35 /* oklch(18.565% 0.07904 260.75) */;\n    --wa-color-blue: var(--wa-color-blue-50);\n    --wa-color-blue-key: 50;\n\n    --wa-color-indigo-95: #f0f2ff /* oklch(96.341% 0.0175 279.06) */;\n    --wa-color-indigo-90: #dfe5ff /* oklch(92.527% 0.0359 275.35) */;\n    --wa-color-indigo-80: #bcc7ff /* oklch(84.053% 0.07938 275.91) */;\n    --wa-color-indigo-70: #9da9ff /* oklch(75.941% 0.12411 276.95) */;\n    --wa-color-indigo-60: #808aff /* oklch(67.977% 0.17065 277.16) */;\n    --wa-color-indigo-50: #6163f2 /* oklch(57.967% 0.20943 277.04) */;\n    --wa-color-indigo-40: #4945cb /* oklch(48.145% 0.20042 277.08) */;\n    --wa-color-indigo-30: #3933a7 /* oklch(40.844% 0.17864 277.26) */;\n    --wa-color-indigo-20: #292381 /* oklch(33.362% 0.15096 277.21) */;\n    --wa-color-indigo-10: #181255 /* oklch(24.534% 0.11483 277.73) */;\n    --wa-color-indigo-05: #0d0a3a /* oklch(19.092% 0.08825 276.76) */;\n    --wa-color-indigo: var(--wa-color-indigo-50);\n    --wa-color-indigo-key: 50;\n\n    --wa-color-purple-95: #f7f0ff /* oklch(96.49% 0.02119 306.84) */;\n    --wa-color-purple-90: #eedfff /* oklch(92.531% 0.04569 306.6) */;\n    --wa-color-purple-80: #ddbdff /* oklch(84.781% 0.09615 306.52) */;\n    --wa-color-purple-70: #ca99ff /* oklch(76.728% 0.14961 305.27) */;\n    --wa-color-purple-60: #b678f5 /* oklch(68.906% 0.1844 304.96) */;\n    --wa-color-purple-50: #9951db /* oklch(58.603% 0.20465 304.87) */;\n    --wa-color-purple-40: #7936b3 /* oklch(48.641% 0.18949 304.79) */;\n    --wa-color-purple-30: #612692 /* oklch(41.23% 0.16836 304.92) */;\n    --wa-color-purple-20: #491870 /* oklch(33.663% 0.14258 305.12) */;\n    --wa-color-purple-10: #2d0b48 /* oklch(24.637% 0.10612 304.95) */;\n    --wa-color-purple-05: #1e0532 /* oklch(19.393% 0.08461 305.26) */;\n    --wa-color-purple: var(--wa-color-purple-50);\n    --wa-color-purple-key: 50;\n\n    --wa-color-pink-95: #feeff9 /* oklch(96.676% 0.02074 337.69) */;\n    --wa-color-pink-90: #feddf0 /* oklch(93.026% 0.04388 342.45) */;\n    --wa-color-pink-80: #fcb5d8 /* oklch(84.928% 0.09304 348.21) */;\n    --wa-color-pink-70: #f78dbf /* oklch(77.058% 0.14016 351.19) */;\n    --wa-color-pink-60: #e66ba3 /* oklch(69.067% 0.16347 353.69) */;\n    --wa-color-pink-50: #c84382 /* oklch(58.707% 0.17826 354.82) */;\n    --wa-color-pink-40: #9e2a6c /* oklch(48.603% 0.16439 350.08) */;\n    --wa-color-pink-30: #7d1e58 /* oklch(41.017% 0.14211 347.77) */;\n    --wa-color-pink-20: #5e1342 /* oklch(33.442% 0.11808 347.01) */;\n    --wa-color-pink-10: #3c0828 /* oklch(24.601% 0.08768 347.8) */;\n    --wa-color-pink-05: #28041a /* oklch(19.199% 0.06799 346.97) */;\n    --wa-color-pink: var(--wa-color-pink-50);\n    --wa-color-pink-key: 50;\n\n    --wa-color-gray-95: #f1f2f3 /* oklch(96.067% 0.00172 247.84) */;\n    --wa-color-gray-90: #e4e5e9 /* oklch(92.228% 0.0055 274.96) */;\n    --wa-color-gray-80: #c7c9d0 /* oklch(83.641% 0.00994 273.33) */;\n    --wa-color-gray-70: #abaeb9 /* oklch(75.183% 0.01604 273.78) */;\n    --wa-color-gray-60: #9194a2 /* oklch(66.863% 0.02088 276.18) */;\n    --wa-color-gray-50: #717584 /* oklch(56.418% 0.02359 273.77) */;\n    --wa-color-gray-40: #545868 /* oklch(46.281% 0.02644 274.26) */;\n    --wa-color-gray-30: #424554 /* oklch(39.355% 0.02564 276.27) */;\n    --wa-color-gray-20: #2f323f /* oklch(31.97% 0.02354 274.82) */;\n    --wa-color-gray-10: #1b1d26 /* oklch(23.277% 0.01762 275.14) */;\n    --wa-color-gray-05: #101219 /* oklch(18.342% 0.01472 272.42) */;\n    --wa-color-gray: var(--wa-color-gray-40);\n    --wa-color-gray-key: 40;\n  }\n}\n\n\n@layer wa-theme {\n  :where(#scpanl-root),\n  .wa-theme-default,\n  .wa-light,\n  .wa-dark .wa-invert,\n  .wa-light .wa-theme-default,\n  .wa-dark .wa-theme-default.wa-invert,\n  .wa-dark .wa-theme-default .wa-invert {\n    /* #region Colors (Light) ~~~~~~~~~~~~~~~~~~~~~ */\n    color-scheme: light;\n    color: var(--wa-color-text-normal);\n\n    --wa-color-surface-raised: white;\n    --wa-color-surface-default: white;\n    --wa-color-surface-lowered: var(--wa-color-neutral-95);\n    --wa-color-surface-border: var(--wa-color-neutral-90);\n\n    --wa-color-text-normal: var(--wa-color-neutral-10);\n    --wa-color-text-quiet: var(--wa-color-neutral-40);\n    --wa-color-text-link: var(--wa-color-brand-40);\n\n    --wa-color-overlay-modal: color-mix(in oklab, var(--wa-color-neutral-05) 50%, transparent);\n    --wa-color-overlay-inline: color-mix(in oklab, var(--wa-color-neutral-80) 25%, transparent);\n\n    --wa-color-shadow: color-mix(\n      in oklab,\n      var(--wa-color-neutral-05) calc(var(--wa-shadow-blur-scale) * 4% + 8%),\n      transparent\n    );\n\n    --wa-color-focus: var(--wa-color-brand-60);\n\n    --wa-color-mix-hover: oklch(from currentColor calc(1 - l) c h) 10%;\n    --wa-color-mix-active: var(--wa-color-surface-default) 10%;\n\n    --wa-color-brand-fill-quiet: var(--wa-color-brand-95);\n    --wa-color-brand-fill-normal: var(--wa-color-brand-90);\n    --wa-color-brand-fill-loud: var(--wa-color-brand-50);\n    --wa-color-brand-border-quiet: var(--wa-color-brand-90);\n    --wa-color-brand-border-normal: var(--wa-color-brand-80);\n    --wa-color-brand-border-loud: var(--wa-color-brand-60);\n    --wa-color-brand-on-quiet: var(--wa-color-brand-40);\n    --wa-color-brand-on-normal: var(--wa-color-brand-30);\n    --wa-color-brand-on-loud: white;\n\n    --wa-color-success-fill-quiet: var(--wa-color-success-95);\n    --wa-color-success-fill-normal: var(--wa-color-success-90);\n    --wa-color-success-fill-loud: var(--wa-color-success-50);\n    --wa-color-success-border-quiet: var(--wa-color-success-90);\n    --wa-color-success-border-normal: var(--wa-color-success-80);\n    --wa-color-success-border-loud: var(--wa-color-success-60);\n    --wa-color-success-on-quiet: var(--wa-color-success-40);\n    --wa-color-success-on-normal: var(--wa-color-success-30);\n    --wa-color-success-on-loud: white;\n\n    --wa-color-warning-fill-quiet: var(--wa-color-warning-95);\n    --wa-color-warning-fill-normal: var(--wa-color-warning-90);\n    --wa-color-warning-fill-loud: var(--wa-color-warning-50);\n    --wa-color-warning-border-quiet: var(--wa-color-warning-90);\n    --wa-color-warning-border-normal: var(--wa-color-warning-80);\n    --wa-color-warning-border-loud: var(--wa-color-warning-60);\n    --wa-color-warning-on-quiet: var(--wa-color-warning-40);\n    --wa-color-warning-on-normal: var(--wa-color-warning-30);\n    --wa-color-warning-on-loud: white;\n\n    --wa-color-danger-fill-quiet: var(--wa-color-danger-95);\n    --wa-color-danger-fill-normal: var(--wa-color-danger-90);\n    --wa-color-danger-fill-loud: var(--wa-color-danger-50);\n    --wa-color-danger-border-quiet: var(--wa-color-danger-90);\n    --wa-color-danger-border-normal: var(--wa-color-danger-80);\n    --wa-color-danger-border-loud: var(--wa-color-danger-60);\n    --wa-color-danger-on-quiet: var(--wa-color-danger-40);\n    --wa-color-danger-on-normal: var(--wa-color-danger-30);\n    --wa-color-danger-on-loud: white;\n\n    --wa-color-neutral-fill-quiet: var(--wa-color-neutral-95);\n    --wa-color-neutral-fill-normal: var(--wa-color-neutral-90);\n    --wa-color-neutral-fill-loud: var(--wa-color-neutral-20);\n    --wa-color-neutral-border-quiet: var(--wa-color-neutral-90);\n    --wa-color-neutral-border-normal: var(--wa-color-neutral-80);\n    --wa-color-neutral-border-loud: var(--wa-color-neutral-60);\n    --wa-color-neutral-on-quiet: var(--wa-color-neutral-40);\n    --wa-color-neutral-on-normal: var(--wa-color-neutral-30);\n    --wa-color-neutral-on-loud: white;\n    /* #endregion */\n  }\n\n  .wa-dark,\n  .wa-invert,\n  .wa-dark .wa-theme-default,\n  .wa-light .wa-theme-default.wa-invert,\n  .wa-light .wa-theme-default .wa-invert {\n    /* #region Colors (Dark) ~~~~~~~~~~~~~~~~~~~~~~ */\n    color-scheme: dark;\n    color: var(--wa-color-text-normal);\n\n    --wa-color-surface-raised: var(--wa-color-neutral-10);\n    --wa-color-surface-default: var(--wa-color-neutral-05);\n    --wa-color-surface-lowered: color-mix(in oklab, var(--wa-color-surface-default), black 20%);\n    --wa-color-surface-border: var(--wa-color-neutral-20);\n\n    --wa-color-text-normal: var(--wa-color-neutral-95);\n    --wa-color-text-quiet: var(--wa-color-neutral-60);\n    --wa-color-text-link: var(--wa-color-brand-70);\n\n    --wa-color-overlay-modal: color-mix(in oklab, black 60%, transparent);\n    --wa-color-overlay-inline: color-mix(in oklab, var(--wa-color-neutral-50) 10%, transparent);\n\n    --wa-color-shadow: color-mix(\n      in oklab,\n      var(--wa-color-surface-lowered) calc(var(--wa-shadow-blur-scale) * 32% + 40%),\n      transparent\n    );\n\n    --wa-color-focus: var(--wa-color-brand-60);\n\n    --wa-color-mix-hover: oklch(from currentColor calc(1 - l) c h) 20%;\n    --wa-color-mix-active: var(--wa-color-surface-default) 20%;\n\n    --wa-color-brand-fill-quiet: var(--wa-color-brand-10);\n    --wa-color-brand-fill-normal: var(--wa-color-brand-20);\n    --wa-color-brand-fill-loud: var(--wa-color-brand-50);\n    --wa-color-brand-border-quiet: var(--wa-color-brand-20);\n    --wa-color-brand-border-normal: var(--wa-color-brand-30);\n    --wa-color-brand-border-loud: var(--wa-color-brand-40);\n    --wa-color-brand-on-quiet: var(--wa-color-brand-60);\n    --wa-color-brand-on-normal: var(--wa-color-brand-70);\n    --wa-color-brand-on-loud: white;\n\n    --wa-color-success-fill-quiet: var(--wa-color-success-10);\n    --wa-color-success-fill-normal: var(--wa-color-success-20);\n    --wa-color-success-fill-loud: var(--wa-color-success-50);\n    --wa-color-success-border-quiet: var(--wa-color-success-20);\n    --wa-color-success-border-normal: var(--wa-color-success-30);\n    --wa-color-success-border-loud: var(--wa-color-success-40);\n    --wa-color-success-on-quiet: var(--wa-color-success-60);\n    --wa-color-success-on-normal: var(--wa-color-success-70);\n    --wa-color-success-on-loud: white;\n\n    --wa-color-warning-fill-quiet: var(--wa-color-warning-10);\n    --wa-color-warning-fill-normal: var(--wa-color-warning-20);\n    --wa-color-warning-fill-loud: var(--wa-color-warning-50);\n    --wa-color-warning-border-quiet: var(--wa-color-warning-20);\n    --wa-color-warning-border-normal: var(--wa-color-warning-30);\n    --wa-color-warning-border-loud: var(--wa-color-warning-40);\n    --wa-color-warning-on-quiet: var(--wa-color-warning-60);\n    --wa-color-warning-on-normal: var(--wa-color-warning-70);\n    --wa-color-warning-on-loud: white;\n\n    --wa-color-danger-fill-quiet: var(--wa-color-danger-10);\n    --wa-color-danger-fill-normal: var(--wa-color-danger-20);\n    --wa-color-danger-fill-loud: var(--wa-color-danger-50);\n    --wa-color-danger-border-quiet: var(--wa-color-danger-20);\n    --wa-color-danger-border-normal: var(--wa-color-danger-30);\n    --wa-color-danger-border-loud: var(--wa-color-danger-40);\n    --wa-color-danger-on-quiet: var(--wa-color-danger-60);\n    --wa-color-danger-on-normal: var(--wa-color-danger-70);\n    --wa-color-danger-on-loud: white;\n\n    --wa-color-neutral-fill-quiet: var(--wa-color-neutral-10);\n    --wa-color-neutral-fill-normal: var(--wa-color-neutral-20);\n    --wa-color-neutral-fill-loud: var(--wa-color-neutral-90);\n    --wa-color-neutral-border-quiet: var(--wa-color-neutral-20);\n    --wa-color-neutral-border-normal: var(--wa-color-neutral-30);\n    --wa-color-neutral-border-loud: var(--wa-color-neutral-40);\n    --wa-color-neutral-on-quiet: var(--wa-color-neutral-60);\n    --wa-color-neutral-on-normal: var(--wa-color-neutral-70);\n    --wa-color-neutral-on-loud: var(--wa-color-neutral-05);\n    /* #endregion */\n  }\n\n  :where(#scpanl-root),\n  .wa-theme-default,\n  .wa-light,\n  .wa-dark,\n  .wa-invert {\n    font-family: var(--wa-font-family-body);\n\n    /* #region Fonts ~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */\n    --wa-font-family-body: ui-sans-serif, system-ui, sans-serif;\n    --wa-font-family-heading: var(--wa-font-family-body);\n    --wa-font-family-code: ui-monospace, monospace;\n    --wa-font-family-longform: ui-serif, serif;\n\n    /* Font sizes use a ratio of 1.125 to scale sizes proportionally.\n     * For larger font sizes, each size is twice 1.125x larger to maximize impact.\n     * Each value uses `rem` units and is rounded to the nearest whole pixel when rendered. */\n    --wa-font-size-scale: 1;\n    --wa-font-size-3xs: round(calc(var(--wa-font-size-2xs) / 1.125), 1px); /* 10px */\n    --wa-font-size-2xs: round(calc(var(--wa-font-size-xs) / 1.125), 1px); /* 11px */\n    --wa-font-size-xs: round(calc(var(--wa-font-size-s) / 1.125), 1px); /* 12px */\n    --wa-font-size-s: round(calc(var(--wa-font-size-m) / 1.125), 1px); /* 14px */\n    --wa-font-size-m: calc(1rem * var(--wa-font-size-scale)); /* 16px */\n    --wa-font-size-l: round(calc(var(--wa-font-size-m) * 1.125 * 1.125), 1px); /* 20px */\n    --wa-font-size-xl: round(calc(var(--wa-font-size-l) * 1.125 * 1.125), 1px); /* 25px */\n    --wa-font-size-2xl: round(calc(var(--wa-font-size-xl) * 1.125 * 1.125), 1px); /* 32px */\n    --wa-font-size-3xl: round(calc(var(--wa-font-size-2xl) * 1.125 * 1.125), 1px); /* 41px */\n    --wa-font-size-4xl: round(calc(var(--wa-font-size-3xl) * 1.125 * 1.125), 1px); /* 52px */\n    --wa-font-size-5xl: round(calc(var(--wa-font-size-4xl) * 1.125 * 1.125), 1px); /* 66px */\n\n    --wa-font-size-smaller: round(calc(1em / 1.125), 1px);\n    --wa-font-size-larger: round(calc(1em * 1.125 * 1.125), 1px);\n\n    --wa-font-weight-light: 300;\n    --wa-font-weight-normal: 400;\n    --wa-font-weight-semibold: 500;\n    --wa-font-weight-bold: 600;\n\n    --wa-font-weight-body: var(--wa-font-weight-normal);\n    --wa-font-weight-heading: var(--wa-font-weight-bold);\n    --wa-font-weight-code: var(--wa-font-weight-normal);\n    --wa-font-weight-longform: var(--wa-font-weight-normal);\n    --wa-font-weight-action: var(--wa-font-weight-semibold);\n\n    --wa-line-height-condensed: 1.2;\n    --wa-line-height-normal: 1.6;\n    --wa-line-height-expanded: 2;\n\n    --wa-link-decoration-default: underline color-mix(in oklab, currentColor 70%, transparent) dotted;\n    --wa-link-decoration-hover: underline;\n    /* #endregion */\n\n    /* #region Space ~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */\n    --wa-space-scale: 1;\n    --wa-space-3xs: calc(var(--wa-space-scale) * 0.125rem); /* 2px */\n    --wa-space-2xs: calc(var(--wa-space-scale) * 0.25rem); /* 4px */\n    --wa-space-xs: calc(var(--wa-space-scale) * 0.5rem); /* 8px */\n    --wa-space-s: calc(var(--wa-space-scale) * 0.75rem); /* 12px */\n    --wa-space-m: calc(var(--wa-space-scale) * 1rem); /* 16px */\n    --wa-space-l: calc(var(--wa-space-scale) * 1.5rem); /* 24px */\n    --wa-space-xl: calc(var(--wa-space-scale) * 2rem); /* 32px */\n    --wa-space-2xl: calc(var(--wa-space-scale) * 2.5rem); /* 40px */\n    --wa-space-3xl: calc(var(--wa-space-scale) * 3rem); /* 48px */\n    --wa-space-4xl: calc(var(--wa-space-scale) * 4rem); /* 64px */\n    --wa-space-5xl: calc(var(--wa-space-scale) * 5rem); /* 80px */\n\n    --wa-content-spacing: var(--wa-space-l);\n    /* #endregion */\n\n    /* #region Borders ~~~~~~~~~~~~~~~~~~~~~~~~~~ */\n    --wa-border-style: solid;\n\n    --wa-border-width-scale: 1;\n    --wa-border-width-s: calc(var(--wa-border-width-scale) * 0.0625rem);\n    --wa-border-width-m: calc(var(--wa-border-width-scale) * 0.125rem);\n    --wa-border-width-l: calc(var(--wa-border-width-scale) * 0.1875rem);\n    /* #endregion */\n\n    /* #region Rounding ~~~~~~~~~~~~~~~~~~~~~~~~~ */\n    --wa-border-radius-scale: 1;\n    --wa-border-radius-s: calc(var(--wa-border-radius-scale) * 0.1875rem);\n    --wa-border-radius-m: calc(var(--wa-border-radius-scale) * 0.375rem);\n    --wa-border-radius-l: calc(var(--wa-border-radius-scale) * 0.75rem);\n\n    --wa-border-radius-pill: 9999px;\n    --wa-border-radius-circle: 50%;\n    --wa-border-radius-square: 0px;\n    /* #endregion */\n\n    /* #region Focus ~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */\n    --wa-focus-ring-style: solid;\n    --wa-focus-ring-width: 0.1875rem; /* 3px */\n    --wa-focus-ring: var(--wa-focus-ring-style) var(--wa-focus-ring-width) var(--wa-color-focus);\n    --wa-focus-ring-offset: 0.0625rem; /* 1px */\n    /* #endregion */\n\n    /* #region Shadows ~~~~~~~~~~~~~~~~~~~~~~~~~~ */\n    --wa-shadow-offset-x-scale: 0;\n    --wa-shadow-offset-x-s: calc(var(--wa-shadow-offset-x-scale) * 0.125rem);\n    --wa-shadow-offset-x-m: calc(var(--wa-shadow-offset-x-scale) * 0.25rem);\n    --wa-shadow-offset-x-l: calc(var(--wa-shadow-offset-x-scale) * 0.5rem);\n\n    --wa-shadow-offset-y-scale: 1;\n    --wa-shadow-offset-y-s: calc(var(--wa-shadow-offset-y-scale) * 0.125rem);\n    --wa-shadow-offset-y-m: calc(var(--wa-shadow-offset-y-scale) * 0.25rem);\n    --wa-shadow-offset-y-l: calc(var(--wa-shadow-offset-y-scale) * 0.5rem);\n\n    --wa-shadow-blur-scale: 1;\n    --wa-shadow-blur-s: calc(var(--wa-shadow-blur-scale) * 0.125rem);\n    --wa-shadow-blur-m: calc(var(--wa-shadow-blur-scale) * 0.25rem);\n    --wa-shadow-blur-l: calc(var(--wa-shadow-blur-scale) * 0.5rem);\n\n    --wa-shadow-spread-scale: -0.5;\n    --wa-shadow-spread-s: calc(var(--wa-shadow-spread-scale) * 0.125rem);\n    --wa-shadow-spread-m: calc(var(--wa-shadow-spread-scale) * 0.25rem);\n    --wa-shadow-spread-l: calc(var(--wa-shadow-spread-scale) * 0.5rem);\n\n    --wa-shadow-s: var(--wa-shadow-offset-x-s) var(--wa-shadow-offset-y-s) var(--wa-shadow-blur-s)\n      var(--wa-shadow-spread-s) var(--wa-color-shadow);\n    --wa-shadow-m: var(--wa-shadow-offset-x-m) var(--wa-shadow-offset-y-m) var(--wa-shadow-blur-m)\n      var(--wa-shadow-spread-m) var(--wa-color-shadow);\n    --wa-shadow-l: var(--wa-shadow-offset-x-l) var(--wa-shadow-offset-y-l) var(--wa-shadow-blur-l)\n      var(--wa-shadow-spread-l) var(--wa-color-shadow);\n    /* #endregion */\n\n    /* #region Transitions ~~~~~~~~~~~~~~~~~~~~~~ */\n    --wa-transition-easing: ease;\n    --wa-transition-slow: 300ms;\n    --wa-transition-normal: 150ms;\n    --wa-transition-fast: 75ms;\n    /* #endregion */\n\n    /* #region Components ~~~~~~~~~~~~~~~~~~~~~~~ */\n    /* Form Controls */\n    --wa-form-control-background-color: var(--wa-color-surface-default);\n\n    --wa-form-control-border-color: var(--wa-color-neutral-border-loud);\n    --wa-form-control-border-style: var(--wa-border-style);\n    --wa-form-control-border-width: var(--wa-border-width-s);\n    --wa-form-control-border-radius: var(--wa-border-radius-m);\n\n    --wa-form-control-activated-color: var(--wa-color-brand-fill-loud);\n\n    --wa-form-control-label-color: var(--wa-color-text-normal);\n    --wa-form-control-label-font-weight: var(--wa-font-weight-semibold);\n    --wa-form-control-label-line-height: var(--wa-line-height-condensed);\n\n    --wa-form-control-value-color: var(--wa-color-text-normal);\n    --wa-form-control-value-font-weight: var(--wa-font-weight-body);\n    --wa-form-control-value-line-height: var(--wa-line-height-condensed);\n\n    --wa-form-control-hint-color: var(--wa-color-text-quiet);\n    --wa-form-control-hint-font-weight: var(--wa-font-weight-body);\n    --wa-form-control-hint-line-height: var(--wa-line-height-normal);\n\n    --wa-form-control-placeholder-color: var(--wa-color-gray-50);\n\n    --wa-form-control-required-content: '*';\n    --wa-form-control-required-content-color: inherit;\n    --wa-form-control-required-content-offset: 0.1em;\n\n    --wa-form-control-padding-block: 0.75em;\n    --wa-form-control-padding-inline: 1em;\n    --wa-form-control-height: round(\n      calc(2 * var(--wa-form-control-padding-block) + 1em * var(--wa-form-control-value-line-height)),\n      1px\n    );\n    --wa-form-control-toggle-size: round(1.25em, 1px);\n\n    /* Buttons */\n    --wa-button-transform-hover: none;\n    --wa-button-transform-active: scale(0.9875);\n\n    /* Panels */\n    --wa-panel-border-style: var(--wa-border-style);\n    --wa-panel-border-width: var(--wa-border-width-s);\n    --wa-panel-border-radius: var(--wa-border-radius-l);\n\n    /* Tooltips */\n    --wa-tooltip-arrow-size: 0.375rem;\n\n    --wa-tooltip-background-color: var(--wa-color-text-normal);\n\n    --wa-tooltip-border-color: var(--wa-tooltip-background-color);\n    --wa-tooltip-border-style: var(--wa-border-style);\n    --wa-tooltip-border-width: var(--wa-border-width-s);\n    --wa-tooltip-border-radius: var(--wa-border-radius-s);\n\n    --wa-tooltip-content-color: var(--wa-color-surface-default);\n    --wa-tooltip-font-size: var(--wa-font-size-s);\n    --wa-tooltip-line-height: var(--wa-line-height-normal);\n    /* #endregion */\n  }\n\n  :is(#scpanl-root, #scpanl-root):has(wa-page) {\n    min-height: 100%;\n    padding: 0;\n    margin: 0;\n  }\n}\n";

  // src-client/vendor.js
  if (typeof window !== "undefined") window.__SC_VENDOR_CSS__ = VENDOR_CSS;
  var ICONS = {
    "chevron-down": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M4.2 6.2 8 10l3.8-3.8 1 1L8 12 3.2 7.2z"/></svg>',
    "chevron-up": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M8 4l4.8 4.8-1 1L8 6l-3.8 3.8-1-1z"/></svg>',
    x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M4.5 3.4 8 6.9l3.5-3.5 1.1 1.1L9.1 8l3.5 3.5-1.1 1.1L8 9.1l-3.5 3.5-1.1-1.1L6.9 8 3.4 4.5z"/></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M6.2 11.4 3 8.2l1.1-1.1 2.1 2.1 5-5L12.3 5z"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M6.5 2a4.5 4.5 0 1 0 2.8 8l3.3 3.3 1.1-1.1-3.3-3.3A4.5 4.5 0 0 0 6.5 2m0 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6"/></svg>'
  };
  try {
    registerIconLibrary("default", {
      resolver: (name) => "data:image/svg+xml," + encodeURIComponent(ICONS[name] || ICONS["chevron-down"]),
      mutator: (svg2) => {
        try {
          svg2.setAttribute("fill", "currentColor");
        } catch (e8) {
        }
      }
    });
  } catch (e8) {
    if (typeof console !== "undefined") console.warn("[shoucang] \u56FE\u6807\u5E93\u6CE8\u518C\u5931\u8D25\uFF1A" + (e8 && e8.message));
  }

  // src-client/panel-contract.generated.js
  var PANEL_CONTRACT = {
    "$comment": "\u751F\u6210\u7269\uFF08npm run build:host && node scripts/gen-panel-contract.mjs\uFF09\u2014\u2014 \u52FF\u624B\u6539\uFF1B\u6E90 = src/panel-contract.ts",
    "plugin": "dsh-shoucang-memory",
    "prefix": "/api/shoucang-panel",
    "routeCount": 42,
    "routes": [
      {
        "path": "/roots",
        "summary": "\u5DF2\u767B\u8BB0\u6839\u76EE\u5F55\u5217\u8868",
        "required": [],
        "fields": null
      },
      {
        "path": "/get_root",
        "summary": "\u5F53\u524D\u6FC0\u6D3B\u6839\u76EE\u5F55",
        "required": [],
        "fields": null
      },
      {
        "path": "/root/bootstrap",
        "summary": "\u5EFA\u5355\u5E93\u9AA8\u67B6",
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
        "summary": "\u5207\u6362/\u767B\u8BB0\u6839\u76EE\u5F55",
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
        "summary": "\u8BFB\u914D\u7F6E\u539F\u6587",
        "required": [],
        "fields": null
      },
      {
        "path": "/save",
        "summary": "\u5199\u914D\u7F6E\u539F\u6587",
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
        "summary": "\u7FFB\u8F6C\u5E03\u5C14\u952E",
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
        "summary": "\u8BBE\u7F6E\u6807\u91CF\u952E",
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
        "summary": "\u7D22\u5F15/\u5BB9\u91CF/\u5019\u9009\u603B\u89C8",
        "required": [],
        "fields": null
      },
      {
        "path": "/memory/sections",
        "summary": "\u7D22\u5F15\u5C0F\u8282\u5217\u8868",
        "required": [],
        "fields": null
      },
      {
        "path": "/suite",
        "summary": "suite \u88C5\u914D\u77E9\u9635",
        "required": [],
        "fields": null
      },
      {
        "path": "/mcl/status",
        "summary": "\u8BA4\u77E5\u73AF\u72B6\u6001",
        "required": [],
        "fields": null
      },
      {
        "path": "/reconcile",
        "summary": "\u8BB0\u5FC6\u5BF9\u8D26",
        "required": [],
        "fields": null
      },
      {
        "path": "/maturation/scan",
        "summary": "\u6210\u719F\u5EA6\u626B\u63CF",
        "required": [],
        "fields": null
      },
      {
        "path": "/selfcheck",
        "summary": "\u81EA\u68C0\u7ED3\u679C",
        "required": [],
        "fields": null
      },
      {
        "path": "/selfcheck/run",
        "summary": "\u8FD0\u884C\u81EA\u68C0",
        "required": [],
        "fields": null
      },
      {
        "path": "/rings",
        "summary": "\u4E94\u73AF KPI \u4E0E\u73AF\u4E8B\u4EF6\u5BF9\u8D26",
        "required": [],
        "fields": null
      },
      {
        "path": "/config/recent",
        "summary": "\u8FD1\u671F\u914D\u7F6E\u53D8\u66F4",
        "required": [],
        "fields": null
      },
      {
        "path": "/criteria",
        "summary": "\u5224\u636E\u6CE8\u518C\u8868 + \u53F0\u8D26",
        "required": [],
        "fields": null
      },
      {
        "path": "/content-types",
        "summary": "\u5185\u5BB9\u7C7B\u578B\u5951\u7EA6\uFF1A\u7C7B\u578B\u5206\u5E03 \xB7 \u53EF\u8FBE\u6027 \xB7 \u901A\u8DEF\u63A5\u7EBF",
        "required": [],
        "fields": null
      },
      {
        "path": "/cognition/report",
        "summary": "\u6DF1\u7761\u56DE\u6267/\u6D3B\u6027/\u5F52\u6863",
        "required": [],
        "fields": null
      },
      {
        "path": "/llm/models",
        "summary": "\u6A21\u578B\u6E05\u5355",
        "required": [],
        "fields": null
      },
      {
        "path": "/deepsleep",
        "summary": "\u6DF1\u7761\u72B6\u6001",
        "required": [],
        "fields": null
      },
      {
        "path": "/deepsleep/trigger",
        "summary": "\u624B\u52A8\u89E6\u53D1\u6DF1\u7761",
        "required": [],
        "fields": null
      },
      {
        "path": "/distill/run",
        "summary": "\u624B\u52A8\u89E6\u53D1\u84B8\u998F",
        "required": [],
        "fields": null
      },
      {
        "path": "/deepsleep/config",
        "summary": "\u6DF1\u7761\u914D\u7F6E\u8BFB\u5199\uFF08\u767D\u540D\u5355\u8865\u4E01\uFF09",
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
        "summary": "\u84B8\u998F\u914D\u7F6E\u8BFB\u5199\uFF08\u767D\u540D\u5355\u8865\u4E01\uFF09",
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
        "summary": "\u5411\u91CF\u6863\u72B6\u6001",
        "required": [],
        "fields": null
      },
      {
        "path": "/embed/config",
        "summary": "\u5D4C\u5165\u914D\u7F6E\u8BFB\u5199\uFF08\u767D\u540D\u5355\u8865\u4E01\uFF09",
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
        "summary": "\u5D4C\u5165\u8FDE\u901A\u6027\u6D4B\u8BD5",
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
        "summary": "\u6E05\u5411\u91CF\u7F13\u5B58",
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
        "summary": "\u6539\u5199\u5C0F\u8282\u6B63\u6587",
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
        "summary": "\u884C\u7EA7\u7F16\u8F91",
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
        "summary": "\u884C\u7EA7\u5220\u9664",
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
        "summary": "\u91C7\u7EB3\u5019\u9009",
        "required": [
          "pendingFile"
        ],
        "fields": [
          {
            "name": "pendingFile",
            "type": "string",
            "optional": false
          }
        ]
      },
      {
        "path": "/inject/preview",
        "summary": "\u70ED\u8BB0\u5FC6\u6CE8\u5165\u9884\u89C8",
        "required": [],
        "fields": null
      },
      {
        "path": "/inject/stats",
        "summary": "\u6CE8\u5165\u7EDF\u8BA1",
        "required": [],
        "fields": null
      },
      {
        "path": "/arch/records",
        "summary": "\u8BB0\u5F55\u5C42\uFF1Astore \u4EBA\u53E3 \xB7 md\u2194store \u9010\u8F7D\u4F53\u5BF9\u8D26 \xB7 \u5199\u65F6\u81EA\u8BC1 \xB7 \u8DE8\u6587\u4EF6\u540C\u6587 \xB7 \u884C\u5BFB\u5740\u53E3\u5F84",
        "required": [],
        "fields": null
      },
      {
        "path": "/arch/graph",
        "summary": "\u65AD\u8A00\u56FE\uFF1A\u8282\u70B9/\u8FB9/\u5404 rel/\u60AC\u7A7A\u8BC1\u636E\uFF08\u7EAF\u8BA1\u6570\uFF0C\u96F6\u5411\u91CF\uFF09",
        "required": [],
        "fields": null
      },
      {
        "path": "/arch/observability",
        "summary": "\u89C2\u6D4B\u9762\uFF1A\u7EDF\u4E00\u53F0\u8D26\u5B9E\u51B5\uFF08\u6309 type \u5206\u5E03/\u4FE1\u5C01\u5B8C\u6574\u6027\uFF09\xB7 audit \u76EE\u5F55 \xB7 legacy \u6D41\u5B58\u5426 \xB7 \u65CF\xD7\u57DF\u53E3\u5F84",
        "required": [],
        "fields": null
      },
      {
        "path": "/arch/assembly",
        "summary": "\u88C5\u914D\u9762\uFF1Acomposition root \u5C31\u7EEA\u5EA6\uFF08\u6865=0\uFF09\xB7 \u5951\u7EA6\u8DEF\u7531\u6570 \xB7 \u5DF2\u88C5\u65B0\u67B6\u6784\u6A21\u5757\u76D8\u70B9",
        "required": [],
        "fields": null
      },
      {
        "path": "/mcl/config",
        "summary": "\u8BA4\u77E5\u73AF\u65CB\u94AE\uFF08\u767D\u540D\u5355\u8865\u4E01\uFF1A\u9608\u503C/\u4E0A\u9650/\u9884\u7B97/topK/P2b/REM\uFF09",
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
    var n6 = document.createElement(tag);
    if (cls) n6.className = cls;
    if (text != null) n6.textContent = text;
    return n6;
  }
  function svg(paths) {
    var s4 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s4.setAttribute("viewBox", "0 0 24 24");
    s4.setAttribute("width", "18");
    s4.setAttribute("height", "18");
    s4.setAttribute("fill", "none");
    s4.setAttribute("stroke", "currentColor");
    s4.setAttribute("stroke-width", "1.8");
    s4.setAttribute("stroke-linecap", "round");
    s4.setAttribute("stroke-linejoin", "round");
    paths.split("|").forEach(function(d3) {
      var p4 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p4.setAttribute("d", d3);
      s4.appendChild(p4);
    });
    return s4;
  }
  var ICONS2 = {
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

  // src-client/state.js
  var Bus = /* @__PURE__ */ (function() {
    var m3 = {};
    return {
      on: function(k2, fn) {
        (m3[k2] = m3[k2] || []).push(fn);
        return function() {
          m3[k2] = (m3[k2] || []).filter(function(f3) {
            return f3 !== fn;
          });
        };
      },
      emit: function(k2, p4) {
        (m3[k2] || []).slice().forEach(function(f3) {
          try {
            f3(p4);
          } catch (e8) {
          }
        });
      }
    };
  })();
  var Store = /* @__PURE__ */ (function() {
    var s4 = { view: "file", logs: [], progress: {}, metrics: {}, errors: [] };
    var subs = [];
    return {
      get: function(k2) {
        return k2 === void 0 ? s4 : s4[k2];
      },
      set: function(k2, v2) {
        var old = s4[k2];
        if (old === v2) return v2;
        s4[k2] = v2;
        subs.forEach(function(f3) {
          try {
            f3(k2, v2, old);
          } catch (e8) {
          }
        });
        Bus.emit("store:" + k2, v2);
        return v2;
      },
      patch: function(k2, o9) {
        var base = typeof s4[k2] === "object" && s4[k2] ? s4[k2] : {};
        var next = Object.assign({}, base, o9 || {});
        return Store.set(k2, next);
      },
      sub: function(fn) {
        subs.push(fn);
        return function() {
          subs = subs.filter(function(f3) {
            return f3 !== fn;
          });
        };
      }
    };
  })();
  var statusSinkBox = /* @__PURE__ */ (function() {
    var fn = null;
    return { set: function(f3) {
      fn = f3;
    }, get: function() {
      return fn;
    } };
  })();
  var setLogStatusSink = statusSinkBox.set;
  var Log = /* @__PURE__ */ (function() {
    var MAX = 500;
    function add(level, msg, ctx) {
      var e8 = { t: Date.now(), level: level || "info", msg: String(msg), ctx: ctx || null };
      var a4 = (Store.get("logs") || []).concat([e8]);
      if (a4.length > MAX) a4 = a4.slice(a4.length - MAX);
      Store.set("logs", a4);
      Bus.emit("log", e8);
      if (level === "error") {
        var _s = statusSinkBox.get();
        if (_s) _s(msg, "error");
      }
      return e8;
    }
    return {
      add,
      info: function(m3, c5) {
        return add("info", m3, c5);
      },
      warn: function(m3, c5) {
        return add("warn", m3, c5);
      },
      error: function(m3, c5) {
        return add("error", m3, c5);
      },
      clear: function() {
        Store.set("logs", []);
        Bus.emit("log", null);
      }
    };
  })();
  var Prog = {
    start: function(id3, label) {
      Store.patch("progress", Object.assign({}, Store.get("progress"), make(id3, { id: id3, label: label || "", pct: 0, note: "\u8FDB\u884C\u4E2D", on: true })));
      Bus.emit("progress", Store.get("progress"));
    },
    set: function(id3, pct, note) {
      var cur = (Store.get("progress") || {})[id3];
      if (!cur) return;
      Store.patch("progress", Object.assign({}, Store.get("progress"), make(id3, Object.assign({}, cur, { pct: Math.max(0, Math.min(100, pct || 0)), note: note || cur.note }))));
      Bus.emit("progress", Store.get("progress"));
    },
    done: function(id3, ok, msg) {
      var cur = (Store.get("progress") || {})[id3];
      if (!cur) return;
      var p4 = Object.assign({}, Store.get("progress"));
      p4[id3] = Object.assign({}, cur, { on: false, pct: 100, note: msg || (ok ? "\u5B8C\u6210" : "\u5931\u8D25"), ok: ok !== false });
      Store.set("progress", p4);
      Bus.emit("progress", p4);
      var self = this;
      setTimeout(function() {
        var q = Object.assign({}, Store.get("progress"));
        delete q[id3];
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
          var o9 = JSON.parse(raw);
          if (o9 && typeof o9 === "object") cache = Object.assign(cache, o9);
        }
      } catch (e8) {
      }
      return cache;
    }
    return {
      get: function(k2, d3) {
        var c5 = load();
        return k2 === void 0 ? c5 : c5[k2] !== void 0 ? c5[k2] : d3;
      },
      set: function(k2, v2) {
        var c5 = load();
        c5[k2] = v2;
        cache = c5;
        try {
          localStorage.setItem(KEY, JSON.stringify(c5));
        } catch (e8) {
        }
        Bus.emit("cfg:" + k2, v2);
        return v2;
      },
      reset: function() {
        cache = Object.assign({}, DEF);
        try {
          localStorage.removeItem(KEY);
        } catch (e8) {
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
    var m3 = {};
    var hasOwn = Object.prototype.hasOwnProperty;
    function norm(k2) {
      return String(k2 === void 0 || k2 === null ? "" : k2);
    }
    return {
      /* 读：未登记 ⇒ 用调用方给的默认值（默认值不入库，各处可各自定义缺省） */
      get: function(key, dflt) {
        var s4 = norm(key);
        return hasOwn.call(m3, s4) ? m3[s4] : !!dflt;
      },
      /* 写：同值不广播（避免 paint↔set 回环） */
      set: function(key, v2) {
        var s4 = norm(key), next = !!v2;
        if (hasOwn.call(m3, s4) && m3[s4] === next) return next;
        m3[s4] = next;
        Bus.emit("fold", { key: s4, open: next });
        return next;
      },
      toggle: function(key, dflt) {
        return Fold.set(key, !Fold.get(key, dflt));
      },
      /* 清空：按前缀或全清。切视图 / 换数据源时调用，防止旧 key 的状态残留到新数据上。 */
      clear: function(prefix) {
        var p4 = prefix === void 0 || prefix === null ? null : String(prefix);
        var hit = Object.keys(m3).filter(function(s4) {
          return p4 === null || s4.indexOf(p4) === 0;
        });
        hit.forEach(function(s4) {
          delete m3[s4];
        });
        if (hit.length) Bus.emit("fold:clear", { prefix: p4, keys: hit });
        return hit.length;
      },
      keys: function() {
        return Object.keys(m3);
      },
      size: function() {
        return Object.keys(m3).length;
      },
      _raw: function() {
        return m3;
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
    slotReact: null
  };

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
     *   extra        —— 数组，追加进 setting-item-info（如作用域徽标）；用于覆盖"info 内还有额外子节点"的既有写法
     *   wrapControl  —— true(默认) 包进 .setting-item-control；false = 直接挂 row（兼容既有未包装写法）
     *   children     —— 数组，追加为 row 的平级子节点（如 info + badge + slider 三子节点形态）
     * ⚠ 这三个开关是为**等价替换旧写法**而设：既有 DOM 结构千差万别（实测三处三种形态），
     *   组件层必须能无损表达它们，否则替换就会改变 DOM —— 与"结构不变"要求冲突。 */
    item: function(name, desc, control, opts) {
      var o9 = opts || {};
      var row = el("div", "setting-item" + (o9.cls ? " " + o9.cls : ""));
      var info = el("div", "setting-item-info");
      if (name) info.appendChild(el("div", "setting-item-name", name));
      if (desc) info.appendChild(el("div", "setting-item-desc", desc));
      (o9.extra || []).forEach(function(n6) {
        if (n6) info.appendChild(n6);
      });
      row.appendChild(info);
      if (control) {
        if (o9.wrapControl === false) row.appendChild(control);
        else {
          var c5 = el("div", "setting-item-control");
          c5.appendChild(control);
          row.appendChild(c5);
        }
      }
      (o9.children || []).forEach(function(n6) {
        if (n6) row.appendChild(n6);
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
      var sw = document.createElement("wa-switch");
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
      var o9 = opts || {};
      var box = el("div", "sc-card");
      var head = null;
      if (title) {
        head = el("div", "sc-card-hd");
        head.appendChild(el("span", null, title));
        if (o9.sub) head.appendChild(el("span", "sub", o9.sub));
        if (o9.right) {
          var r7 = el("div", "right");
          (Array.isArray(o9.right) ? o9.right : [o9.right]).forEach(function(n6) {
            if (n6) r7.appendChild(n6);
          });
          head.appendChild(r7);
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
      var c5 = UI.card(null, opts);
      if (pane) pane.appendChild(c5.box);
      return c5.body;
    },
    /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 sc-h1 / sc-desc）。
     * v9 对齐：页头挂在固定槽 #scpanl-headslot（**不随内容滚动**），渲染时自清上一次的页头；
     * 槽不可用时（老结构/单测夹具）回退为返回游离节点，调用方 appendChild 仍可用。 */
    pageHead: function(title, desc, opts) {
      var o9 = opts || {};
      var box = el("div", "sc-pagehead");
      var main = el("div", "sc-ph-main");
      main.appendChild(el("h2", "sc-h1", title));
      var descEl = null;
      if (desc) {
        descEl = el("div", "sc-desc", desc);
        main.appendChild(descEl);
      }
      if (o9.routes && o9.routes.length) {
        if (o9.routesInline && descEl) {
          o9.routes.forEach(function(r7) {
            descEl.appendChild(el("span", "sc-src", r7));
          });
        } else {
          var row = el("div", "sc-routes");
          o9.routes.forEach(function(r7) {
            row.appendChild(el("span", "sc-src", r7));
          });
          main.appendChild(row);
        }
      }
      box.appendChild(main);
      var acts = el("div", "sc-ph-acts");
      if (o9.search) {
        var srch = el("label", "sc-srch");
        srch.appendChild(svg(ICONS2.search));
        var inp = document.createElement("input");
        inp.type = "search";
        inp.placeholder = o9.search.placeholder || "\u8FC7\u6EE4\u2026";
        inp.setAttribute("aria-label", o9.search.placeholder || "\u8FC7\u6EE4");
        inp.oninput = function() {
          if (o9.search.onInput) o9.search.onInput(String(inp.value || "").trim());
        };
        srch.appendChild(inp);
        acts.appendChild(srch);
      }
      if (o9.refresh) {
        acts.appendChild(UI.button("\u5237\u65B0", function() {
          appState.refreshView();
          appState.statusFn("\u5DF2\u91CD\u65B0\u53D6\u6570");
        }, { title: "\u91CD\u65B0\u53D6\u6570\u5E76\u91CD\u7ED8\u672C\u9875" }));
      }
      (o9.actions || []).forEach(function(n6) {
        if (n6) acts.appendChild(n6);
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
      var o9 = opts || {};
      var i7 = document.createElement("input");
      i7.type = o9.type || "text";
      i7.value = value === void 0 || value === null ? "" : String(value);
      if (o9.placeholder) i7.placeholder = o9.placeholder;
      if (o9.ariaLabel) i7.setAttribute("aria-label", o9.ariaLabel);
      if (o9.width) i7.style.setProperty("--sc-in-w", o9.width);
      if (o9.onEnter) i7.onkeydown = function(e8) {
        if (e8.key === "Enter") o9.onEnter(i7.value);
      };
      else if (onChange) i7.onchange = function() {
        onChange(i7.value);
      };
      return i7;
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
      var s4 = document.createElement("select");
      if (ariaLabel) s4.setAttribute("aria-label", ariaLabel);
      (options || []).forEach(function(op) {
        var o9 = document.createElement("option");
        o9.value = String(op.value);
        o9.textContent = op.label;
        if (String(op.value) === String(value)) o9.selected = true;
        s4.appendChild(o9);
      });
      s4.onchange = function() {
        onChange(s4.value);
      };
      return s4;
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
      var o9 = opts || {};
      var b3 = document.createElement("wa-button");
      b3.setAttribute("size", o9.size || "s");
      b3.setAttribute("variant", o9.danger ? "danger" : o9.primary ? "brand" : "neutral");
      b3.setAttribute("appearance", o9.primary || o9.danger ? "filled" : "outlined");
      if (o9.pill) b3.setAttribute("pill", "");
      if (o9.title) b3.title = o9.title;
      b3.textContent = text;
      b3.onclick = function() {
        if (o9.confirm && !confirm(o9.confirm)) return;
        if (!o9.async) {
          try {
            onClick();
          } catch (e8) {
            appState.failFn(e8);
          }
          return;
        }
        b3.disabled = true;
        b3.setAttribute("loading", "");
        var old = b3.textContent;
        if (o9.busyText) b3.textContent = o9.busyText;
        Promise.resolve().then(onClick).then(function(r7) {
          Log.info(o9.okText || text + " \u5B8C\u6210");
          return r7;
        }).catch(appState.failFn).then(function() {
          b3.disabled = false;
          b3.removeAttribute("loading");
          b3.textContent = old;
        });
      };
      return b3;
    },
    /* 徽标 */
    badge: function(text, kind) {
      var b3 = el("span", "sc-badge" + (kind ? " sc-badge-" + kind : ""), text);
      return b3;
    },
    /* 状态徽标（sc-ds-badge：圆点 + 文本）—— 后台进程状态行的**唯一构造入口**。
     * 此前 10 处各写三行「建 div → 塞 dot → 塞文本」，其中 3 枚还要异步回填，
     * 靠 `querySelectorAll('span')[1]` 按 DOM 位置取文本节点（改结构即断）。
     * 现返回句柄：setText/setKind 直接持有节点引用，不再依赖位置。 */
    dsBadge: function(text, kind) {
      var box = el("div", "sc-ds-badge" + (kind ? " " + kind : ""));
      box.appendChild(el("span", "dot"));
      var t6 = el("span", null, "");
      box.appendChild(t6);
      function render(s4) {
        t6.textContent = "";
        var str = String(s4 === void 0 || s4 === null ? "" : s4);
        var m3 = /^(.*?)([^\s]*\d[^\s]*)\s*$/.exec(str);
        if (m3 && m3[1]) {
          t6.appendChild(document.createTextNode(m3[1]));
          t6.appendChild(el("b", null, m3[2]));
        } else {
          t6.textContent = str;
        }
      }
      var h3 = {
        box,
        setText: function(s4) {
          render(s4);
          return h3;
        },
        setKind: function(k2) {
          box.className = "sc-ds-badge" + (k2 ? " " + k2 : "");
          return h3;
        },
        setTitle: function(s4) {
          box.title = s4;
          return h3;
        }
      };
      render(text);
      return h3;
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
      var o9 = opts || {};
      var isMore = o9.variant === "more";
      var dflt = !!o9.open;
      var label = o9.label || "\u5C55\u5F00";
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
        head.appendChild(el("span", null, o9.title || ""));
        if (o9.summary) head.appendChild(el("span", "sc-fold-summary", o9.summary));
        box.appendChild(head);
        box.appendChild(body);
        nodes.push(box);
      }
      var ctl = { box, head, body, nodes, key: String(o9.key) };
      function current() {
        return Fold.get(o9.key, dflt);
      }
      function paint(open) {
        if (isMore) {
          body.classList.toggle("sc-hidden", !open);
          head.textContent = open ? "\u6536\u8D77 \u25B4" : label + " \u25BE";
        } else {
          box.classList.toggle("open", open);
          arrow.textContent = open ? "\u25BE" : "\u25B8";
        }
        head.setAttribute("aria-expanded", open ? "true" : "false");
      }
      ctl.isOpen = current;
      ctl.setOpen = function(v2) {
        paint(Fold.set(o9.key, v2));
        return ctl;
      };
      ctl.sync = function() {
        paint(current());
        return ctl;
      };
      ctl.busy = function(v2) {
        body.classList.toggle("sc-loading", !!v2);
        return ctl;
      };
      ctl.empty = function() {
        return body.childNodes.length === 0;
      };
      ctl.seal = function() {
        if (ctl.empty() && o9.emptyText !== false) {
          body.appendChild(el("div", "sc-mem-empty", o9.emptyText || "\uFF08\u65E0\u5185\u5BB9\uFF09"));
        }
        return ctl;
      };
      ctl.appendTo = function(host) {
        nodes.forEach(function(n6) {
          host.appendChild(n6);
        });
        return ctl;
      };
      function act() {
        if (o9.disabled) return;
        paint(Fold.toggle(o9.key, dflt));
      }
      head.onclick = act;
      if (!isMore) {
        head.setAttribute("role", "button");
        head.setAttribute("tabindex", "0");
        head.onkeydown = function(e8) {
          if (e8.key === "Enter" || e8.key === " ") {
            e8.preventDefault();
            act();
          }
        };
      }
      if (o9.disabled) head.setAttribute("aria-disabled", "true");
      paint(current());
      var everMounted = false;
      function alive() {
        var any = nodes.some(function(n6) {
          return n6.isConnected === true;
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
      var off1 = Bus.on("fold", function(p4) {
        if (!alive()) {
          unsubscribe();
          return;
        }
        if (p4 && p4.key === ctl.key) ctl.sync();
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
      var o9 = opts || {};
      var f3 = UI.fold({
        key: o9.key || "fold:" + title,
        variant: "card",
        title,
        summary: o9.summary,
        open: o9.open,
        disabled: o9.disabled,
        emptyText: o9.emptyText
      });
      if (bodyNode) f3.body.appendChild(bodyNode);
      return f3.box;
    },
    /* 容量/指标 KPI 卡（P3）：**画像 / 记忆库 / 运行总览三处共用的唯一实现**。
     * v9 裁决：容量类信息统一为「大数值 + 百分比 + 进度条」；无容量门的载体给 .na 虚线空槽保持槽位一致。
     * opts: { val, txt(文字型主值), sub, pct(null=无门), kind('' | ok | suspect | stalled) }
     * 返回 { box, set(val, sub, isTxt), fill(pct, kind) } */
    tabs: function(key, defs) {
      var box = el("div", "sc-tabbox");
      var group = document.createElement("wa-tab-group");
      var cur = Cfg.get("tab:" + key, (defs[0] || {}).id);
      var valid = false;
      defs.forEach(function(d3) {
        if (d3.id === cur) valid = true;
      });
      if (!valid) cur = (defs[0] || {}).id;
      defs.forEach(function(d3) {
        var tab = document.createElement("wa-tab");
        tab.setAttribute("slot", "nav");
        tab.setAttribute("panel", d3.id);
        tab.textContent = d3.label;
        group.appendChild(tab);
        var panel = document.createElement("wa-tab-panel");
        panel.setAttribute("name", d3.id);
        d3.pane.classList.add("sc-tabpane");
        panel.appendChild(d3.pane);
        group.appendChild(panel);
      });
      group.setAttribute("active", cur);
      group.addEventListener("wa-tab-show", function(ev) {
        var n6 = ev && ev.detail && ev.detail.name;
        if (n6) Cfg.set("tab:" + key, n6);
      });
      box.appendChild(group);
      return {
        box,
        select: function(id3) {
          group.setAttribute("active", id3);
        },
        pane: function(id3) {
          for (var i7 = 0; i7 < defs.length; i7++) if (defs[i7].id === id3) return defs[i7].pane;
          return null;
        }
      };
    },
    kpi: function(top, opts) {
      var o9 = opts || {};
      var c5 = el("div", "sc-kpi");
      var topEl = el("div", "sc-kpi-top");
      var DOTK = { ended: "ok", running: "ok", probing: "info", suspect: "warn", stalled: "err" };
      var dotCls = function(k2) {
        return "sc-dot " + (DOTK[k2] || k2 || "ok");
      };
      var dot = null;
      if (o9.kind) {
        dot = el("span", dotCls(o9.kind));
        topEl.appendChild(dot);
      }
      topEl.appendChild(el("span", null, top));
      c5.appendChild(topEl);
      var v2 = el("div", "sc-kpi-val" + (o9.txt ? " txt" : ""), o9.val === void 0 || o9.val === null ? "\u2014" : String(o9.val));
      c5.appendChild(v2);
      var sub = el("div", "sc-kpi-sub", o9.sub || "");
      c5.appendChild(sub);
      var bar = null;
      if (!o9.plain) {
        bar = el("div", "sc-kpi-bar" + (o9.pct === null || o9.pct === void 0 ? " na" : ""));
        var fill = el("i", o9.kind || "");
        if (o9.pct !== null && o9.pct !== void 0) fill.style.setProperty("--sc-pct", o9.pct + "%");
        bar.appendChild(fill);
        c5.appendChild(bar);
      }
      var h3 = {
        box: c5,
        set: function(val, subText, isTxt) {
          v2.textContent = val === void 0 || val === null ? "\u2014" : String(val);
          v2.className = "sc-kpi-val" + (isTxt ? " txt" : "");
          if (subText !== void 0) sub.textContent = subText || "";
          return h3;
        },
        fill: function(pct, kind) {
          if (dot && kind !== void 0) dot.className = dotCls(kind);
          if (!bar) return h3;
          if (pct === null || pct === void 0) {
            bar.classList.add("na");
            return h3;
          }
          bar.classList.remove("na");
          bar.firstChild.style.setProperty("--sc-pct", pct + "%");
          if (kind !== void 0) bar.firstChild.className = kind === "ended" ? "ok" : kind;
          return h3;
        }
      };
      return h3;
    },
    /* 进度条（C1）。P0-1（2026-09-13）：条体改由组件库承载 ——
     *   外壳 `div.sc-prog` 保留（承载行间距与下方文字），`<wa-progress-bar>` 负责条本身。
     *   尺寸/配色由 CSS 侧接管组件变量（见上方 .sc-prog-bar 规则），此处只驱动 `value`。 */
    progress: function(id3) {
      var box = el("div", "sc-prog");
      var bar = document.createElement("wa-progress-bar");
      bar.className = "sc-prog-bar";
      bar.setAttribute("max", "100");
      bar.setAttribute("value", "0");
      var txt = el("div", "sc-prog-txt", "");
      box.appendChild(bar);
      box.appendChild(txt);
      function render(p4) {
        var s4 = (p4 || {})[id3];
        if (!s4 || !s4.on) {
          box.classList.add("sc-hidden");
          return;
        }
        box.classList.remove("sc-hidden");
        bar.setAttribute("value", String(s4.pct || 0));
        txt.textContent = (s4.label ? s4.label + " \xB7 " : "") + (s4.pct || 0) + "% \xB7 " + (s4.note || "");
      }
      render(Store.get("progress"));
      Bus.on("progress", render);
      return box;
    },
    /* 键值对（信息密度） */
    kv: function(pairs) {
      var w2 = el("div", "sc-kv");
      (pairs || []).forEach(function(p4) {
        var r7 = el("div", "sc-kv-row");
        r7.appendChild(el("span", "sc-kv-k", p4[0]));
        r7.appendChild(el("span", "sc-kv-v", p4[1]));
        w2.appendChild(r7);
      });
      return w2;
    }
  };

  // src-client/derive.js
  var Derive = /* @__PURE__ */ (function() {
    var VEC_DOWN = { off: "stalled", unreachable: "stalled" };
    var VEC_LABEL = {
      fusion: "\u878D\u5408",
      "gpu-ready": "\u672C\u673A\u5C31\u7EEA",
      lexical: "\u8BCD\u6CD5",
      cloud: "\u4E91\u7AEF",
      unreachable: "\u670D\u52A1\u672A\u8FDE",
      off: "\u5173"
    };
    var CAP_PCT = { stalled: 85, suspect: 60 };
    var BACKREF_LIMIT = 8;
    var SUITE_STATUS = {
      both: { text: "\u5DF2\u88C5\u914D", kind: "ok", tip: "\u6CE8\u5165\u5668 + profile \u53CC\u57FA\u51C6" },
      injected: { text: "\u5DF2\u88C5\u914D", kind: "ok", tip: "\u6CE8\u5165\u5668\u88C5\u914D" },
      profile: { text: "\u5DF2\u88C5\u914D", kind: "ok", tip: "profile \u88C5\u914D" },
      missing: { text: "\u672A\u88C5\u914D", kind: "error", tip: "\u4E24\u57FA\u51C6\u5747\u672A\u88C5\u914D\uFF08member \u72EC\u7ACB\u53EF\u88C5\uFF09" }
    };
    var SUITE_FALLBACK = { text: "\u672A\u88C5\u914D", kind: "info", tip: "\u72B6\u6001\u672A\u77E5" };
    function s4(v2, dflt) {
      return String(v2 === void 0 || v2 === null || v2 === "" ? dflt : v2);
    }
    var hasOwn2 = Object.prototype.hasOwnProperty;
    function pick(o9, k2, dflt) {
      return hasOwn2.call(o9, k2) ? o9[k2] : dflt;
    }
    return {
      CAP_PCT,
      BACKREF_LIMIT,
      VEC_LABEL,
      VEC_DOWN,
      SUITE_STATUS,
      /* provider → 徽章 kind。running 档由调用方显式给出（各视图口径不同，见上注）。 */
      providerKind: function(p4, runningList) {
        var k2 = s4(p4, "off");
        if (runningList && runningList.indexOf(k2) >= 0) return "running";
        return pick(VEC_DOWN, k2, "ended");
      },
      /* provider 是否未就绪（off / unreachable）——决定是否出兜底/引导提示。
      * 注意不做 'off' 兜底：原判据 `p === 'off' || p === 'unreachable'` 在 p 缺失时为 false
      * （记忆板块 §7 传的是裸 `data.vector.provider`），兜底会把「未上报」误判成「已关闭」。 */
      providerDown: function(p4) {
        return hasOwn2.call(VEC_DOWN, String(p4));
      },
      vecLabel: function(p4) {
        return pick(VEC_LABEL, s4(p4, "off"), "\u5173");
      },
      capKind: function(pct) {
        var n6 = Number(pct) || 0;
        return n6 >= CAP_PCT.stalled ? "stalled" : n6 >= CAP_PCT.suspect ? "suspect" : "ended";
      },
      suiteStatus: function(st) {
        return pick(SUITE_STATUS, String(st), SUITE_FALLBACK);
      },
      /* 判空：替代散落的 `x && x.length`（20+ 处）。注意与 `!x.length` 的差异——
         后者在 x 为 null/undefined 时直接抛错，has() 返回 false（把崩溃变成空态）。 */
      has: function(v2) {
        return !!(v2 && v2.length);
      },
      /* 取数：替代 `(x || []).length`（取值场景用，缺省 0） */
      count: function(v2) {
        return v2 && v2.length || 0;
      },
      /* 千分位（v9 对齐：`3,204` / `3,100 / 5,000 字符`；此前裸数字） */
      num: function(v2) {
        if (v2 === null || v2 === void 0 || v2 === "") return "\u2014";
        var s5 = String(v2);
        return /^-?\d+$/.test(s5) ? s5.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s5;
      },
      /* 向量区可见性：原判据 `data.vector && data.vector.enabled !== false` */
      vectorOn: function(data) {
        return !!(data && data.vector && data.vector.enabled !== false);
      }
    };
  })();
  function fmtTime(iso) {
    if (!iso) return "\u2014";
    try {
      var d3 = new Date(iso);
      var p4 = function(n6) {
        return (n6 < 10 ? "0" : "") + n6;
      };
      return p4(d3.getMonth() + 1) + "-" + p4(d3.getDate()) + " " + p4(d3.getHours()) + ":" + p4(d3.getMinutes());
    } catch (e8) {
      return String(iso).slice(0, 16);
    }
  }

  // src-client/panes-overview.js
  function ovCRow(title, desc, right) {
    var r7 = el("div", "sc-crow");
    var l6 = el("div");
    l6.appendChild(el("div", "sc-ct", title));
    if (desc) l6.appendChild(el("div", "sc-cd", desc));
    r7.appendChild(l6);
    var rr = el("div", "sc-right");
    (right || []).forEach(function(n6) {
      if (n6) rr.appendChild(n6);
    });
    r7.appendChild(rr);
    return r7;
  }
  function ovPill(text, kind, mono) {
    return el("span", "sc-pill" + (kind ? " " + kind : "") + (mono ? " mono" : ""), text);
  }
  function ovAgo(ts) {
    var t6 = typeof ts === "number" ? ts : ts ? Date.parse(String(ts)) : 0;
    if (!t6 || isNaN(t6)) return "";
    var m3 = Math.max(0, Math.round((Date.now() - t6) / 6e4));
    if (m3 < 1) return "\u521A\u521A";
    if (m3 < 60) return m3 + " \u5206\u949F\u524D";
    if (m3 < 1440) return Math.round(m3 / 60) + " \u5C0F\u65F6\u524D";
    return Math.round(m3 / 1440) + " \u5929\u524D";
  }
  function ovMorningCard() {
    var card = UI.card("\u6668\u8D77\u6458\u8981", { right: [el("span", "sc-src", "/memory/overview \xB7 delta / weekDiff")] });
    var box = el("div");
    box.appendChild(el("div", "sc-desc", "\u8BFB\u53D6\u4E2D\u2026"));
    card.body.appendChild(box);
    appState.api("/memory/overview").then(function(d3) {
      var dl = (d3 || {}).delta || {}, wd = (d3 || {}).weekDiff || {};
      var sub = card.head && card.head.querySelector(".sub");
      if (sub) {
        if (dl.present && dl.staleAt) {
          var h3 = Math.round((Date.parse(dl.staleAt) - Date.now()) / 36e5);
          sub.textContent = "delta \xB7 \u5269\u4F59 " + (h3 > 0 ? h3 + "h" : "\u5DF2\u8FC7\u671F") + " \u6709\u6548";
        } else sub.textContent = "delta \xB7 weekDiff";
      }
      box.textContent = "";
      var rows = (dl.rows || []).slice(0, 2);
      if (!Derive.has(rows)) box.appendChild(el("div", "sc-desc", "\u672C\u6B21\u65E0\u6668\u8D77\u6458\u8981\uFF08delta.md \u672A\u751F\u6210\u6216\u5DF2\u8FC7\u671F\uFF09\u3002"));
      rows.forEach(function(t6, i7) {
        box.appendChild(ovCRow(String(t6), "\u6765\u6E90\uFF1Adelta.md", [
          i7 === 0 ? ovPill("injections " + Derive.num(dl.injections || 0), null, true) : ovPill("delta", "info")
        ]));
      });
      var n6 = Number(wd.deepAdded || 0);
      box.appendChild(ovCRow("\u8FD1 7 \u5929\u6DF1\u7761\u65B0\u4E60\u5F97 " + Derive.num(n6) + " \u6761", "weekDiff.deepAdded", [ovPill("+" + Derive.num(n6), "ok")]));
    }).catch(function() {
      box.textContent = "";
      box.appendChild(el("div", "sc-desc", "\u6668\u8D77\u6458\u8981\u8BFB\u53D6\u5931\u8D25\uFF08/memory/overview\uFF09\u3002"));
    });
    return card.box;
  }
  function ovTimelineCard() {
    var card = UI.card("\u6700\u8FD1\u52A8\u6001", { right: [ovPill("\u6700\u8FD1 24 \u5C0F\u65F6")] });
    var tl = el("div", "sc-tl");
    tl.appendChild(el("div", "sc-desc", "\u8BFB\u53D6\u4E2D\u2026"));
    card.body.appendChild(tl);
    Promise.all([
      appState.api("/memory/overview").catch(function() {
        return {};
      }),
      appState.api("/deepsleep").catch(function() {
        return {};
      })
    ]).then(function(rs) {
      var d3 = rs[0] || {}, sl = rs[1] || {};
      var ds = d3.distillStats || {}, g2 = d3.growth || {}, pend = d3.pending || {};
      var it = [];
      if (ds.last && ds.last.at) {
        it.push({
          t: Date.parse(ds.last.at) || 0,
          k: "ok",
          title: "\u84B8\u998F\u5B8C\u6210 \xB7 \u672C\u6708 " + Derive.num(ds.runs || 0) + " \u6B21",
          desc: "\u7D2F\u8BA1\u5165\u5E93 " + Derive.num(ds.added || 0) + " \u6761 \xB7 \u5F02\u5E38 " + Derive.num(ds.failed || 0) + " \u6761",
          time: ovAgo(ds.last.at)
        });
      }
      if (g2.sleep && g2.sleep.passes) {
        it.push({
          t: Number(sl.lastDeepSleepAt) || 0,
          k: "ok",
          title: "\u6DF1\u5EA6\u7761\u7720\u6574\u7406 \xB7 \u672C\u6708 " + Derive.num(g2.sleep.passes) + " \u6B21",
          desc: "\u4E60\u5F97\u539F\u5219 " + Derive.num(g2.sleep.principleAdded || 0) + " \xB7 \u66FF\u6362 " + Derive.num(g2.sleep.replaced || 0) + " \xB7 \u753B\u50CF " + Derive.num(g2.sleep.profilesAdded || 0),
          time: sl.lastDeepSleepAt ? ovAgo(sl.lastDeepSleepAt) : "\u672C\u6708"
        });
      }
      (d3.indexes || []).forEach(function(f3) {
        if (!f3 || !f3.cap) return;
        var pct = Math.round((f3.chars || 0) / f3.cap * 100);
        if (pct < 80) return;
        it.push({
          t: 0,
          k: "warn",
          title: "\u5BB9\u91CF\u9884\u8B66 \xB7 " + String(f3.name || "") + " \u8FBE " + pct + "%",
          desc: "\u7EA2\u7EBF\u7531 write_gate \u5199\u5165\u65F6\u5F3A\u5236\uFF1B\u5EFA\u8BAE\u5728\u4E0B\u4E00\u6B21\u6DF1\u7761\u4E2D\u6267\u884C\u753B\u50CF\u538B\u7F29",
          time: "\u9608\u503C 80%"
        });
      });
      if (pend.count) {
        it.push({
          t: 0,
          k: pend.count > 5 ? "warn" : "",
          title: "\u5019\u9009\u5F85\u88C1\u51B3 \xB7 " + Derive.num(pend.count) + " \u6761",
          desc: "24h \u5185\u65B0\u589E " + Derive.num(pend.last24h || 0) + " \u6761",
          time: "\u5F85\u5904\u7406"
        });
      }
      tl.textContent = "";
      if (!Derive.has(it)) {
        tl.appendChild(el("div", "sc-desc", "\u6682\u65E0\u52A8\u6001\u3002"));
        return;
      }
      it.sort(function(a4, b3) {
        return (b3.t || 0) - (a4.t || 0);
      });
      it.slice(0, 4).forEach(function(x2) {
        var box = el("div", "sc-tl-item" + (x2.k ? " " + x2.k : ""));
        box.appendChild(el("div", "sc-tl-t", x2.title));
        box.appendChild(el("div", "sc-tl-d", x2.desc));
        box.appendChild(el("div", "sc-tl-time", x2.time));
        tl.appendChild(box);
      });
    });
    return card.box;
  }
  function ovCriteriaCard() {
    var card = UI.card("\u5224\u636E\u4E0E\u91CD\u6392\u95E8", {
      sub: "\u73B0\u72B6\u5DF2\u6709 \xB7 \u4EC5\u6539\u5F52\u5C5E",
      right: [el("span", "sc-src", "GET /criteria")]
    });
    var mini = el("div", "sc-mini");
    var note = el("div", "sc-mem-stat-rule", "\u8BFB\u53D6\u4E2D\u2026");
    card.body.appendChild(mini);
    card.body.appendChild(note);
    appState.api("/criteria").then(function(c5) {
      var o9 = c5 || {};
      var gate = o9.rerankGate || {}, h3 = o9.health || {}, bg = o9.bankGit || {}, led = o9.ledger || {};
      mini.textContent = "";
      var put = function(k2, v2) {
        mini.appendChild(el("div", "k", k2));
        mini.appendChild(el("div", "v", v2));
      };
      put("\u5224\u636E\u7248\u672C", String(o9.version || "\u2014"));
      put("\u53F0\u8D26\u884C\u6570", Derive.num(led.rows || 0));
      put("notes \u544A\u8B66\u9608\u503C", h3.notesWarn == null ? "\u2014" : Derive.num(h3.notesWarn));
      put("\u91CD\u6392\u95E8", Derive.num(gate.indexRows || 0) + " / " + Derive.num(gate.threshold || 0) + " \xB7 \u884C\u6570\u95E8" + (gate.ready ? "\u5DF2\u8FBE" : "\u672A\u8FBE"));
      put("\u5E93\u7248\u672C", Derive.num(bg.commits || 0) + " \u63D0\u4EA4");
      note.textContent = "\u5065\u5EB7\u5EA6 health.R / K \u4E0E caps \u7531 criteria-gate.json \u63D0\u4F9B\uFF1B\u672C\u5361\u53EA\u8BFB\u3002";
    }).catch(function() {
      note.textContent = "\u5224\u636E\u53F0\u8D26\u8BFB\u53D6\u5931\u8D25\uFF08GET /criteria\uFF09\u3002";
    });
    return card.box;
  }
  function ovQuickCard() {
    var card = UI.card("\u5FEB\u6377\u64CD\u4F5C");
    var row = el("div", "sc-toolbar");
    row.style.flexWrap = "wrap";
    var res = el("div", "sc-desc", "");
    row.appendChild(UI.button("\u6D4B\u8BD5\u5D4C\u5165\u8FDE\u901A", function() {
      res.textContent = "\u8BFB\u53D6\u914D\u7F6E\u2026";
      return appState.api("/embed/config").then(function(c5) {
        var g2 = c5 && c5.effective || c5 && c5.persisted || {};
        var baseUrl = String(g2.baseUrl || g2.embedBaseUrl || "").trim();
        if (!baseUrl) {
          res.textContent = "\u2717 \u672A\u914D\u7F6E embedBaseUrl\uFF08\u4E14\u7F3A\u7701\u4E0D\u53EF\u7528\uFF09";
          return;
        }
        var dflt = c5 && c5.isDefault || {};
        var src = dflt.embedBaseUrl ? "\uFF08\u7F3A\u7701\u5728\u7528\uFF09" : "\uFF08\u5DF2\u843D\u76D8\uFF09";
        res.textContent = "\u6D4B\u8BD5\u4E2D\u2026 " + baseUrl + src;
        return appState.apiCtx("/embed/test", {
          method: "POST",
          body: JSON.stringify({ baseUrl, apiKey: String(g2.apiKey || g2.embedApiKey || "").trim() })
        }, "\u5D4C\u5165\u8FDE\u901A\u6027").then(function(r7) {
          res.textContent = r7 && r7.error ? "\u2717 " + r7.error + " \xB7 " + baseUrl + src : "\u2713 \u53EF\u8FBE \xB7 " + Derive.count(r7 && r7.models) + " \u4E2A\u6A21\u578B \xB7 " + baseUrl + src;
        });
      }).catch(function(e8) {
        res.textContent = "\u2717 " + e8.message;
      });
    }, { async: true, busyText: "\u6D4B\u8BD5\u4E2D\u2026", okText: "\u5D4C\u5165\u8FDE\u901A\u6027\u6D4B\u8BD5\u5B8C\u6210", title: "POST /embed/test \u2014\u2014 \u9A8C\u8BC1\u5F53\u524D embedding \u914D\u7F6E\u662F\u5426\u53EF\u7528" }));
    row.appendChild(UI.button("\u6839\u76EE\u5F55\u5F15\u5BFC", function() {
      res.textContent = "\u6267\u884C\u4E2D\u2026";
      return appState.apiCtx("/root/bootstrap", { method: "POST", body: JSON.stringify({}) }, "\u6839\u76EE\u5F55\u5F15\u5BFC").then(function(r7) {
        res.textContent = "\u2713 " + JSON.stringify(r7).slice(0, 200);
      }).catch(function(e8) {
        res.textContent = "\u2717 " + e8.message;
      });
    }, { async: true, busyText: "\u6267\u884C\u4E2D\u2026", okText: "\u6839\u76EE\u5F55\u5F15\u5BFC\u5B8C\u6210", confirm: "\u6267\u884C\u6839\u76EE\u5F55\u5F15\u5BFC\u4F1A\u5C1D\u8BD5\u521B\u5EFA\u7F3A\u5931\u7684\u76EE\u5F55\u7ED3\u6784\uFF0C\u786E\u8BA4\u7EE7\u7EED\uFF1F" }));
    row.appendChild(UI.button("\u6210\u719F\u5EA6\u626B\u63CF", function() {
      res.textContent = "\u626B\u63CF\u4E2D\u2026";
      return appState.apiCtx("/maturation/scan", { method: "POST", body: JSON.stringify({}) }, "\u6210\u719F\u5EA6\u626B\u63CF").then(function(r7) {
        res.textContent = r7 && r7.active ? "\u2713 \u626B\u63CF\u5B8C\u6210\uFF08\u5206\u6863\u5DF2\u5199\u5165 audit/maturation.jsonl\uFF09" : "\u26A0 " + (r7 && r7.error || "\u672A\u751F\u6210");
      }).catch(function(e8) {
        res.textContent = "\u2717 " + e8.message;
      });
    }, { async: true, busyText: "\u626B\u63CF\u4E2D\u2026", okText: "\u6210\u719F\u5EA6\u626B\u63CF\u5B8C\u6210", title: "POST /maturation/scan \u2014\u2014 \u91CD\u7B97\u5E93\u5185\u5C0F\u8282\u6210\u719F\u5EA6\u5E76\u8986\u76D6\u53F0\u8D26\uFF08\u53EA\u5199\u53F0\u8D26\uFF0C\u4E0D\u6539\u8BB0\u5FC6\u5185\u5BB9\uFF09" }));
    row.appendChild(UI.button("\u8D26\u672C\u5BF9\u8D26", function() {
      res.textContent = "\u5BF9\u8D26\u4E2D\u2026";
      return appState.apiCtx("/reconcile", { method: "POST", body: JSON.stringify({}) }, "\u8D26\u672C\u5BF9\u8D26").then(function(r7) {
        res.textContent = r7 && r7.active ? "\u2713 \u5BF9\u8D26\u5B8C\u6210" : "\u26A0 " + (r7 && r7.error || "\u5931\u8D25");
      }).catch(function(e8) {
        res.textContent = "\u2717 " + e8.message;
      });
    }, { async: true, busyText: "\u5BF9\u8D26\u4E2D\u2026", okText: "\u8D26\u672C\u5BF9\u8D26\u5B8C\u6210", title: "POST /reconcile \u2014\u2014 \u8BB0\u5FC6\u5E93\u5BF9\u8D26\uFF08\u53EA\u8BFB\u6C47\u603B\uFF09" }));
    card.body.appendChild(row);
    card.body.appendChild(res);
    return card.box;
  }
  function renderViewOverview(view) {
    view.textContent = "";
    UI.pageHead("\u8FD0\u884C\u603B\u89C8", "\u4E00\u5C4F\u56DE\u7B54\u300C\u73B0\u5728\u600E\u4E48\u6837\u300D\u3002\u5FBD\u7AE0\u884C = \u539F\u8BB0\u5FC6\u677F\u5757 \xA70 \u7684 7 \u679A\u72B6\u6001\u5FBD\u7AE0\uFF0C\u6574\u4F53\u63D0\u5347\u4E3A\u72EC\u7ACB\u9996\u5C4F\u3002", {
      routes: ["/memory/overview", "/cognition/report", "/mcl/status"],
      refresh: true,
      actions: [el("span", "sc-proto-note", "\u84B8\u998F\u6267\u884C\u4F4D\uFF1A\u4E0B\u65B9\u64CD\u4F5C\u5361\uFF08\u672C\u9875\u4EC5\u4E00\u5904\uFF09")]
    });
    var badges = el("div", "sc-ds-badges");
    function bd(t6, k2) {
      var h3 = UI.dsBadge(t6, k2);
      badges.appendChild(h3.box);
      return h3;
    }
    var bDistill = bd("\u84B8\u998F \u2026");
    var bVec = bd("\u5411\u91CF \u2026");
    var bPend = bd("\u5019\u9009 \u2026");
    var bMem = bd("\u8BB0\u5FC6\u5E93 \u2026");
    var bMcl = bd("\u8BA4\u77E5\u73AF \u2026");
    var bCrit = bd("\u5224\u636E\u53F0\u8D26 \u2026");
    var bGit = bd("\u5E93\u7248\u672C \u2026");
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
      if (detail) body.appendChild(el("span", null, " \u2014\u2014 " + detail));
      if (linkText) {
        var a4 = el("a", null, linkText);
        a4.setAttribute("role", "button");
        a4.onclick = function() {
          if (typeof linkGo === "function") linkGo();
        };
        body.appendChild(a4);
      }
      alertBox.appendChild(body);
      alertBox.classList.remove("sc-hidden");
    }
    var ops = el("div", "sc-opgrid");
    ops.appendChild(appState.opCard("\u7ACB\u5373\u84B8\u998F", "\u904D\u5386\u6839\u4F1A\u8BDD\u84B8\u998F\uFF0C\u643A\u5E26 pending \u5019\u9009\u56DE\u6D41\uFF1B\u7B49\u4EF7\u4E8E\u7B49\u4F1A\u8BDD\u7A7A\u95F2\u81EA\u52A8\u89E6\u53D1\u3002", "POST /distill/run", "\u84B8\u998F", function() {
      return appState.apiCtx("/distill/run", { method: "POST", body: JSON.stringify({}) }, "\u84B8\u998F").then(function(r7) {
        appState.statusFn(r7 && r7.ok ? "\u2713 " + (r7.note || "\u84B8\u998F\u5B8C\u6210") : "\u26A0 " + (r7 && r7.note || "\u672A\u89E6\u53D1\uFF1A\u6839\u4F1A\u8BDD\u6D3B\u8DC3\u4E2D\u4F1A\u8DF3\u8FC7\uFF0C\u7B49\u95F2\u7F6E\u81EA\u52A8\u8DD1"));
        appState.refreshView();
      });
    }, { icon: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1", busyText: "\u84B8\u998F\u4E2D\u2026", okText: "\u84B8\u998F\u5B8C\u6210" }));
    ops.appendChild(appState.opCard("\u7ACB\u5373\u8FDB\u5165\u6DF1\u7761", "\u79BB\u7EBF\u56DE\u60F3\uFF0C\u63D0\u70BC\u300C[\u539F\u5219]/[\u8DEF\u5F84]\u300D\u5E76\u505A\u7ED3\u6784\u6574\u7406\u4E0E\u5F52\u6863\uFF08\u7981\u76F4\u5220\uFF09\u3002\u9884\u8BA1 1\u20133 \u5206\u949F\u3002", "POST /deepsleep/trigger", "\u6DF1\u7761", function() {
      return appState.apiCtx("/deepsleep/trigger", { method: "POST", body: JSON.stringify({}) }, "\u6DF1\u7761").then(function() {
        appState.statusFn("\u2713 \u5DF2\u89E6\u53D1\u6DF1\u7761\u5F52\u7EB3\uFF08\u540E\u53F0\u6267\u884C\uFF0C\u56DE\u6267\u89C1\u300C\u6DF1\u5EA6\u7761\u7720\u300D\uFF09");
      });
    }, { icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", confirm: "\u7ACB\u5373\u89E6\u53D1\u4E00\u6B21\u6DF1\u5EA6\u7761\u7720\u5F52\u7EB3\uFF1F\u5C06\u8C03\u7528\u5F52\u7EB3\u5B50\u4EE3\u7406\u56DE\u987E\u5F53\u5929\u8BB0\u5FC6\u75D5\u8FF9\u3002" }));
    ops.appendChild(appState.opCard("\u8FD0\u884C\u81EA\u68C0", "\u6821\u9A8C\u5224\u636E\u95E8 / \u8F7D\u4F53\u95E8 / \u5206\u5C42 / \u6210\u719F\u5EA6 / \u5F71\u5B50 / \u5BF9\u8D26\u516D\u9879\uFF1B\u8D85\u65F6\u4E0A\u9650 180s\u3002", "POST /selfcheck/run", "\u81EA\u68C0", function() {
      return appState.apiCtx("/selfcheck/run", { method: "POST", body: JSON.stringify({}) }, "\u81EA\u68C0").then(function() {
        appState.statusFn("\u2713 \u81EA\u68C0\u5DF2\u6267\u884C\uFF0C\u7ED3\u679C\u89C1\u300C\u8FD0\u884C\u89C2\u6D4B\u300D");
      });
    }, { icon: "M20 6L9 17l-5-5", busyText: "\u81EA\u68C0\u4E2D\u2026", confirm: "\u7ACB\u5373\u8DD1\u4E00\u6B21\u8FD0\u884C\u81EA\u68C0\uFF1F\u6267\u884C\u671F\u95F4\u8BF7\u52FF\u5173\u95ED\u9762\u677F\u3002" }));
    view.appendChild(ops);
    var kpis = el("div", "sc-kpis");
    var kMem = UI.kpi("\u8BB0\u5FC6\u5E93\u5BB9\u91CF", { val: "\u2014", sub: "MEMORY.md", pct: 0, kind: "ended" });
    var kLevel = UI.kpi("\u84B8\u998F\u6C34\u4F4D", { val: "\u2014", sub: "\u672C\u8F6E\u84B8\u998F\u4E8B\u4EF6", pct: 0, kind: "ended" });
    var kSleep = UI.kpi("\u6DF1\u5EA6\u7761\u7720", { val: "\u2014", txt: true, sub: "\u2014", pct: null, kind: "probing" });
    var kVec = UI.kpi("\u5411\u91CF\u6863", { val: "\u672A\u542F\u7528", sub: "\u8BCD\u6CD5\u53EC\u56DE\u515C\u5E95", pct: null, kind: "ended" });
    [kMem, kLevel, kSleep, kVec].forEach(function(c5) {
      kpis.appendChild(c5.box);
    });
    view.appendChild(kpis);
    var cols2 = el("div", "sc-cols2");
    var gCard = UI.card("\u672C\u6708\u6210\u957F", { right: [el("span", "sc-src", "/memory/overview \xB7 growth")] });
    var sCard = UI.card("\u7CFB\u7EDF\u72B6\u6001", { right: [el("span", "sc-src", "/mcl/status \xB7 /inject/stats")] });
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
      var c5 = el("div", "sc-mem-stat");
      c5.appendChild(el("div", "sc-mem-stat-label", label));
      c5.appendChild(el("div", "sc-mem-stat-value", value));
      if (sub) c5.appendChild(el("div", "sc-mem-stat-sub", sub));
      return c5;
    }
    appState.api("/memory/overview").then(function(r7) {
      var d3 = r7 || {};
      var ds = d3.distillStats || {};
      bDistill.setText("\u84B8\u998F \xB7 " + (ds.last && ds.last.at ? ovAgo(ds.last.at) : "\u5F85\u547D\u4E2D")).setKind(ds.runs || 0 ? "ended" : "running");
      if (Derive.vectorOn(d3)) {
        var vp = d3.vector.provider || "off";
        bVec.setText("\u5411\u91CF " + String(vp)).setKind(Derive.providerKind(vp, ["fusion"]));
      } else {
        bVec.setText("\u5411\u91CF \u672A\u542F\u7528").setKind("stalled");
      }
      var pend = d3.pending || {};
      bPend.setText("\u5019\u9009 " + String(pend.count || 0)).setKind(pend.count || 0 ? "suspect" : "ended");
      var mf = null;
      (d3.indexes || []).forEach(function(f3) {
        if (f3.name === "MEMORY.md") mf = f3;
      });
      if (mf) {
        var pct = mf.cap ? Math.round((mf.chars || 0) / mf.cap * 100) : null;
        bMem.setText("\u8BB0\u5FC6\u5E93 \xB7 " + (pct === null ? "\u6B63\u5E38" : Derive.capKind(pct) !== "ended" ? "\u6C34\u4F4D\u504F\u9AD8" : "\u6B63\u5E38")).setKind(pct === null ? "ended" : Derive.capKind(pct));
        kMem.set(pct === null ? Derive.num(mf.chars || 0) : pct + "%", Derive.num(mf.chars || 0) + " / " + Derive.num(mf.cap || "\u2014") + " \u5B57\u7B26" + (Derive.count(mf.lines) ? " \xB7 " + Derive.count(mf.lines) + " \u884C" : ""));
        kMem.fill(pct, pct === null ? "" : Derive.capKind(pct));
        if (appState.refs.navHealth) appState.refs.navHealth(pct === null ? "\u6B63\u5E38" : Derive.capKind(pct) !== "ended" ? "\u6C34\u4F4D\u504F\u9AD8" : "\u6B63\u5E38", pct === null ? "ended" : Derive.capKind(pct));
      }
      var dLast = d3.distill && d3.distill.last;
      if (dLast && dLast.lastSeq != null) {
        kLevel.set(String(dLast.lastSeq), "\u672C\u8F6E\u84B8\u998F\u4E8B\u4EF6 \xB7 " + fmtTime(dLast.at));
        kLevel.fill(100, "ok");
      } else {
        kLevel.set("\u2014", "\u5C1A\u65E0\u84B8\u998F\u4E8B\u4EF6");
      }
      if (Derive.vectorOn(d3)) {
        kVec.set(Derive.num(d3.vector.cacheLines || 0), "\u884C \xB7 " + (d3.vector.provider || "\u2014") + (d3.vector.enabled === false ? " \xB7 \u5DF2\u5173\u95ED" : " \xB7 \u5DF2\u542F\u7528"));
        kVec.fill(null);
      }
      var g2 = d3.growth;
      if (g2) {
        if (gCard.head) {
          var subEl = gCard.head.querySelector(".sub");
          if (subEl) subEl.textContent = "\xB7 " + g2.month;
        }
        var g3 = el("div", "sc-mem-grid");
        var s32 = g2.sleep || {}, d32 = g2.distill || {}, n32 = g2.now || {};
        g3.appendChild(ovStat("\u6DF1\u7761\u5F52\u7EB3", Derive.num(s32.passes || 0) + " \u6B21", "\u4E60\u5F97 " + Derive.num(s32.principleAdded || 0) + " \xB7 \u66FF\u6362 " + Derive.num(s32.replaced || 0) + " \xB7 \u753B\u50CF " + Derive.num(s32.profilesAdded || 0)));
        g3.appendChild(ovStat("\u84B8\u998F", Derive.num(d32.runs || 0) + " \u6B21", "\u6210\u529F " + Derive.num(d32.ok || 0) + " \xB7 \u5F02\u5E38 " + Derive.num(d32.bad || 0) + " \xB7 \u9884\u7B5B\u8DF3\u8FC7 " + Derive.num(d32.skips || 0)));
        g3.appendChild(ovStat("AGENT \u753B\u50CF", Derive.num(n32.tagRows != null ? n32.tagRows : "\u2014") + " \u884C", "\u539F\u5219 " + Derive.num(n32.principleRows || 0) + " \xB7 \u8DEF\u5F84 " + Derive.num(n32.pathRows || 0) + " \xB7 " + Derive.num(n32.agentChars || 0) + " \u5B57\u7B26"));
        growthBox.appendChild(g3);
      }
      var warn = [];
      if (pend.count) warn.push("\u5019\u9009\u533A " + pend.count + " \u6761\u5F85\u88C1\u51B3");
      if ((d3.queue || {}).undone) warn.push("\u5F85\u5F52\u6863\u4F1A\u8BDD " + d3.queue.undone + " \u4E2A");
      if (Derive.vectorOn(d3) && Derive.providerDown(d3.vector.provider)) warn.push("\u5D4C\u5165\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF0C\u5411\u91CF\u53EC\u56DE\u5DF2\u964D\u7EA7\u4E3A\u8BCD\u6CD5");
      if (Derive.has(warn)) setAlert(warn.length + " \u9879\u5F85\u5904\u7406", warn.join("\uFF1B"), "\u524D\u5F80\u5904\u7406", function() {
        appState.show("memory");
      });
      else setAlert("");
    }).catch(appState.failFn);
    appState.api("/mcl/status").then(function(m3) {
      bMcl.setText("\u8BA4\u77E5\u73AF " + (m3 && m3.active ? "\u5FEB" + (m3.fast || 0) + "/\u6162" + (m3.slow || 0) : "\u672A\u88C5\u914D")).setKind(m3 && m3.active ? "ended" : "stalled");
    }).catch(function() {
      bMcl.setText("\u8BA4\u77E5\u73AF \u8BFB\u53D6\u5931\u8D25").setKind("stalled");
    });
    appState.api("/criteria").then(function(c5) {
      bCrit.setText("\u5224\u636E\u53F0\u8D26 \xB7 " + (c5 && c5.active ? "\u5DF2\u5C31\u7EEA" : "\u4E0D\u53EF\u8BFB")).setKind(c5 && c5.active ? "ended" : "stalled");
      var bg = (c5 || {}).bankGit || {};
      bGit.setText("\u5E93\u7248\u672C \xB7 " + (bg.commits || 0 ? "\u5DF2\u542F\u7528" : "\u672A\u521D\u59CB\u5316")).setKind(bg.commits || 0 ? "ended" : "stalled");
    }).catch(function() {
      bGit.setText("\u5E93\u7248\u672C \u8BFB\u53D6\u5931\u8D25");
    });
    appState.api("/deepsleep").then(function(d3) {
      var st = d3 || {};
      var mode = st.running ? "\u6DF1\u7761\u6574\u7406\u4E2D" : st.ended || st.ended === 0 ? "\u6D45\u7761" : "\u2014";
      kSleep.set(mode, (st.idleMs ? "\u7A7A\u95F2 " + Math.round(st.idleMs / 6e4) + " \u5206\u949F \xB7 " : "") + (st.nextEligibleAt ? "\u4E0B\u6B21\u53EF\u7761 " + fmtTime(st.nextEligibleAt) : "\u6309\u6C34\u4F4D\u89E6\u53D1"), true);
    }).catch(function() {
      kSleep.set("\u2014", "\u8BFB\u53D6\u5931\u8D25", true);
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
      var r0 = rs[0] || {}, m3 = rs[1] || {}, s4 = rs[2] || {}, v2 = rs[3] || {};
      sysBox.textContent = "";
      var root = r0.root || r0.path || r0.active || "\u2014";
      sysBox.appendChild(ovCRow("\u5F53\u524D\u6839\u76EE\u5F55", String(root), [
        ovPill(r0.active ? "\u5DF2\u6FC0\u6D3B" : "\u672A\u6FC0\u6D3B", r0.active ? "ok" : "warn")
      ]));
      var ch = m3.active ? String(m3.mode) === "slow" ? "\u6162\u901A\u9053" : "\u5FEB\u901A\u9053" : "\u672A\u88C5\u914D";
      sysBox.appendChild(ovCRow(
        "MCL \u8BA4\u77E5\u73AF",
        "\u719F\u6089\u5EA6 " + (m3.familiarity != null ? m3.familiarity : "\u2014") + " \xB7 " + ch,
        [ovPill(ch, m3.active ? "brand" : "warn")]
      ));
      sysBox.appendChild(ovCRow(
        "\u6CE8\u5165\u7EDF\u8BA1",
        "\u672C\u6B21\u4F1A\u8BDD " + Derive.num(s4.calls || 0) + " \u6B21" + (s4.lastAt ? " \xB7 \u6700\u8FD1 " + ovAgo(s4.lastAt) : "") + (s4.root ? " \xB7 root=" + s4.root : ""),
        [ovPill(Derive.num(s4.calls || 0))]
      ));
      sysBox.appendChild(ovCRow(
        "\u5D4C\u5165\u670D\u52A1",
        "provider=" + String(v2.provider || "off") + " \xB7 " + Derive.num(v2.rows || 0) + " \u884C",
        [ovPill(v2.present ? "\u53EF\u8FBE" : "\u672A\u542F\u7528", v2.present ? "ok" : "warn")]
      ));
    });
  }

  // src-client/panes-memory-detail.js
  function renderCognitionReport(view, mode) {
    appState.api("/cognition/report").then(function(r7) {
      if (!r7 || !r7.ok) return;
      var host = view;
      var box = view;
      var group = function(t6) {
        if (mode === "sleep") {
          var c5 = UI.card(t6);
          host.appendChild(c5.box);
          box = c5.body;
        } else {
          box.appendChild(el("div", "sc-mem-group-title", t6));
        }
      };
      var sleeps = r7.sleeps || [], last = Derive.has(sleeps) ? sleeps[sleeps.length - 1] : null;
      if (mode === "sleep") {
        group("\u672C\u8F6E\u4EA7\u51FA\u56DE\u6267" + (last && last.at ? " \xB7 " + fmtTime(last.at) : ""));
        if (!last) {
          box.appendChild(el("div", "sc-mem-empty", "\uFF08\u5C1A\u65E0\u6DF1\u7761\u8BB0\u5F55\uFF09"));
        } else {
          var kpiRow = function(defs) {
            var g2 = el("div", "sc-kpis");
            defs.forEach(function(d3) {
              g2.appendChild(UI.kpi(d3[0], { val: String(d3[1] == null ? 0 : d3[1]), sub: d3[2], plain: true }).box);
            });
            return g2;
          };
          box.appendChild(kpiRow([["\u65B0\u589E\u539F\u5219", last.added, "added"], ["\u66FF\u6362\u539F\u5219", last.replaced, "replaced"], ["\u753B\u50CF\u66F4\u65B0", last.profiles, "profiles"]]));
          box.appendChild(kpiRow([
            ["\u6307\u9488\u66F4\u65B0", last.pointers, "pointers"],
            ["\u6811\u64CD\u4F5C", last.tree, "tree"],
            ["\u5F52\u6863", last.forgetArchived, "forgetArchived"],
            ["\u4FDD\u7559", last.forgetKept, "forgetKept"]
          ]));
          if (last.stop && last.stop !== "completed") {
            box.appendChild(el("div", "sc-ds-alert", "\u26A0 \u4E0A\u6B21\u672A\u5B8C\u6210\uFF08stop=" + last.stop + "\uFF09\u2014\u2014\u6309\u300C\u6DF1\u7761\u6C34\u4F4D\u62A4\u680F\u300D\u6C34\u4F4D\u5DF2\u56DE\u6EDA\uFF0C\u540C\u6279\u75D5\u8FF9\u4E0B\u8F6E\u91CD\u8BD5"));
          }
        }
        var m3 = r7.materials || {};
        group("\u4E0B\u8F6E\u6750\u6599\u9884\u4F30" + (r7.day ? " \xB7 " + r7.day : ""));
        [
          ["\u9057\u5FD8\u5019\u9009", "cold \u4E14 \u226590 \u5929\u96F6\u547D\u4E2D", m3.forget],
          ["\u52A0\u6DF1\u5019\u9009", "hits30 \u2265 5", m3.hot],
          ["\u4E92\u6291\u5019\u9009", "\xA7 \u540D\u91CD\u53E0 0.5\u20130.66", m3.interference]
        ].forEach(function(kv) {
          box.appendChild(ovCRow(kv[0], kv[1], [el("b", null, String(kv[2] == null ? 0 : kv[2]) + " \u6761")]));
        });
      } else {
        var ar = r7.archive || [];
        if (Derive.has(ar)) {
          group("\u5F52\u6863\u533A notes/archive/ \xB7 " + ar.length + " \u4E2A\u6587\u4EF6\uFF08forgetOps \u4EA7\u7269\uFF0C\u590D\u5236\u56DE notes/ \u5373\u6062\u590D\uFF09");
          box.appendChild(el("div", "sc-mem-sub", ar.map(function(x2) {
            return x2.file + "\uFF08" + x2.chars + " \u5B57\uFF09";
          }).join(" \xB7 ")));
        }
      }
    }).catch(function() {
    });
  }
  function renderMemoryExpanded(view, data) {
    view.textContent = "";
    UI.pageHead("\u8BB0\u5FC6\u5E93", "MEMORY.md \u7D22\u5F15\u3001\u5019\u9009\u3001\u7B14\u8BB0\u4E0E\u5F52\u6863\u533A\uFF0C\u6309\u300C\u5E93 \u2192 \u5F85\u6D88\u5316 \u2192 \u8BE6\u60C5 \u2192 \u5DF2\u5F52\u6863\u300D\u7684\u751F\u547D\u5468\u671F\u6392\u5E8F\u3002", { routes: ["/memory/overview", "/memory/sections", "/memory/approve"], search: { placeholder: "\u8FC7\u6EE4\u7D22\u5F15 / \u5019\u9009 / \u7B14\u8BB0\u2026", onInput: appState.filterViewRows }, refresh: true });
    var cap = UI.card("\u5BB9\u91CF\u5360\u7528", { sub: "\u5199\u5165\u7531 write_gate \u5F3A\u5236\u7EA2\u7EBF" });
    view.appendChild(cap.box);
    var capGrid = el("div", "sc-cap3");
    cap.body.appendChild(capGrid);
    cap.body.appendChild(el("div", "sc-cap-note", "\u53EA\u6709\u5B58\u5728\u771F\u5B9E\u5BB9\u91CF\u95E8\u7684\u8F7D\u4F53\u624D\u7ED9\u767E\u5206\u6BD4\u4E0E\u8FDB\u5EA6\u6761\uFF1AMEMORY.md\uFF08cap_memory\uFF09\u4E0E\u753B\u50CF\uFF08cap_user / cap_agent\uFF09\uFF1Bnotes / pending \u65E0\u5BB9\u91CF\u95E8 \u21D2 \u53EA\u62A5\u7EDD\u5BF9\u91CF\u3002\u8D85\u9650\u7531 write_gate \u62D2\u5199\u3002"));
    if (!data || !data.present) {
      appState.statusFn(data && data.error || "\u8BB0\u5FC6\u5E93\u4E0D\u53EF\u7528");
      return;
    }
    var memoryFile = null;
    (data.indexes || []).forEach(function(f3) {
      if (f3.name === "MEMORY.md") memoryFile = f3;
    });
    var pM1 = el("div");
    var pM2 = el("div");
    var pM3 = el("div");
    var pM4 = el("div");
    var pM5 = el("div");
    var _tb = UI.tabs("memory", [
      { id: "index", label: "\u77E5\u8BC6\u7D22\u5F15 " + String(Derive.count(memoryFile && memoryFile.lines)), pane: pM1 },
      { id: "pending", label: "\u5019\u9009\u533A " + String((data.pending || {}).count || 0), pane: pM2 },
      { id: "notes", label: "\u7B14\u8BB0 " + String(Derive.count(data.notes)) + " \u7C7B", pane: pM3 },
      /* v9（原型第 4 枚 Tab）：归档区。面板此前无此 Tab（上轮"无独立数据源"未造）——
       * 数据其实来自 `/cognition/report` 的 `archive:[{file,chars}]`，本轮补齐。 */
      { id: "archive", label: "\u5F52\u6863\u533A", pane: pM5 },
      { id: "growth", label: "\u7EDF\u8BA1", pane: pM4 }
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
        "MEMORY.md \u5BB9\u91CF",
        pct === null ? Derive.num(mf ? mf.chars : "\u2014") : pct + "%",
        mf ? Derive.num(mf.chars) + " / " + Derive.num(mf.cap) + " \u5B57\u7B26 \xB7 " + Derive.count(mf.lines) + " \u6761" : "\u2014",
        pct,
        pct === null ? "" : Derive.capKind(pct)
      ));
      var secCount = 0;
      (data.notes || []).forEach(function(nf) {
        secCount += Derive.count(nf.sections);
      });
      capGrid.appendChild(mkCapItem(
        "notes \xB7 \u7B14\u8BB0",
        Derive.num(Derive.count(data.notes)),
        "\u4E2A\u6587\u4EF6 \xB7 " + Derive.num(secCount) + " \u4E2A\u5C0F\u8282 \xB7 \u65E0\u5BB9\u91CF\u95E8",
        null
      ));
      capGrid.appendChild(mkCapItem(
        "pending \u5019\u9009",
        Derive.num(pMeta0.count || 0),
        "\u6761\u5F85\u88C1\u51B3 \xB7 \u65E0\u5BB9\u91CF\u95E8\uFF08ADD-only \u6682\u5B58\uFF09",
        null
      ));
    })();
    if (appState.refs.navHealth) {
      var navPct = memoryFile && memoryFile.cap ? Math.round((memoryFile.chars || 0) / memoryFile.cap * 100) : null;
      appState.refs.navHealth(navPct === null ? "\u6B63\u5E38" : Derive.capKind(navPct) !== "ended" ? "\u6C34\u4F4D\u504F\u9AD8" : "\u6B63\u5E38", navPct === null ? "ended" : Derive.capKind(navPct));
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
    appState.statusFn("\u8BB0\u5FC6 \xB7 MEMORY " + (memoryFile ? Derive.num(memoryFile.chars) + "/" + Derive.num(memoryFile.cap) + " \xB7 " + Derive.count(memoryFile.lines) + " \u884C" : "\u4E0D\u53EF\u7528") + " \xB7 \u84B8\u998F " + (ds ? Derive.num(ds.runs || 0) + " \u6B21" : "\u2014"));
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
    var group = function(t6) {
      host.appendChild(el("div", "sc-mem-group-title", t6));
    };
    var gGrowth = data.growth;
    if (gGrowth) {
      group("\u672C\u6708\u6210\u957F \xB7 " + gGrowth.month);
      var g3 = el("div", "sc-mem-grid");
      var s32 = gGrowth.sleep || {}, d3 = gGrowth.distill || {}, n32 = gGrowth.now || {};
      g3.appendChild(mkStat("\u6DF1\u7761\u5F52\u7EB3", String(s32.passes || 0) + " \u6B21", "\u4E60\u5F97 " + String(s32.principleAdded || 0) + " \xB7 \u66FF\u6362 " + String(s32.replaced || 0) + " \xB7 \u753B\u50CF " + String(s32.profilesAdded || 0)));
      g3.appendChild(mkStat("\u84B8\u998F", String(d3.runs || 0) + " \u6B21", "\u6210\u529F " + String(d3.ok || 0) + " \xB7 \u5F02\u5E38 " + String(d3.bad || 0) + " \xB7 \u9884\u7B5B\u8DF3\u8FC7 " + String(d3.skips || 0)));
      g3.appendChild(mkStat("AGENT \u753B\u50CF", String(n32.tagRows != null ? n32.tagRows : "\u2014") + " \u884C", "\u539F\u5219 " + String(n32.principleRows || 0) + " \xB7 \u8DEF\u5F84 " + String(n32.pathRows || 0) + " \xB7 " + String(n32.agentChars || 0) + " \u5B57\u7B26"));
      host.appendChild(g3);
      var rds = gGrowth.recentDeep || [];
      if (Derive.has(rds)) {
        host.appendChild(el("div", "sc-mem-group-title", "\u672C\u6708\u6709\u6548\u6DF1\u7761\u4EA7\u51FA"));
        var dl3 = el("div", "sc-idx-list");
        rds.forEach(function(r7) {
          dl3.appendChild(el("div", "sc-mem-sub", String(r7.at || "").slice(0, 10) + "  \u539F\u5219 +" + String(r7.added || 0) + "/\u66FF\u6362 " + String(r7.replaced || 0) + " \xB7 \u753B\u50CF +" + String(r7.profiles || 0) + " \xB7 gate=" + String(r7.gate || "")));
        });
        host.appendChild(dl3);
      } else if ((s32.passes || 0) > 0) {
        host.appendChild(el("div", "sc-mem-empty", "\u672C\u6708\u6DF1\u7761\u6709\u8FD0\u884C\u4F46\u65E0\u4EA7\u51FA\uFF08\u5185\u5BB9\u5224\u636E\u5408\u89C4\u4FDD\u5B88\uFF1A\u6750\u6599\u4E0D\u8DB3\u5B81\u7F3A\u6BCB\u6EE5\uFF09"));
      }
    }
  }
  function mmIndexRows(ctx) {
    var host = ctx._tb.pane("index");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t6) {
      host.appendChild(el("div", "sc-mem-group-title", t6));
    };
    if (Derive.has(memoryFile && memoryFile.lines)) {
      group("\u77E5\u8BC6\u7D22\u5F15 MEMORY.md \xB7 " + memoryFile.lines.length + " \u6761");
      host.appendChild(el("div", "sc-desc", "\u70B9\u51FB\u884C\u76F4\u8FBE notes \u8BE6\u60C5\u5C0F\u8282\uFF08\u53EA\u8BFB\uFF09\u3002"));
      var idxWrap = el("div");
      idxWrap.classList.add("sc-box");
      var IDX_PREVIEW = 8;
      var allLines = memoryFile.lines || [];
      renderIndexRows(idxWrap, allLines.slice(0, IDX_PREVIEW), renderMemoryExpanded, true);
      if (allLines.length > IDX_PREVIEW) {
        var moreBtn = el("button", "sc-idx-more", "\u5C55\u5F00\u5168\u90E8 " + allLines.length + " \u6761");
        moreBtn.type = "button";
        moreBtn.addEventListener("click", function() {
          idxWrap.textContent = "";
          renderIndexRows(idxWrap, allLines, renderMemoryExpanded, true);
        });
        idxWrap.appendChild(moreBtn);
      }
      host.appendChild(idxWrap);
    }
  }
  function mmPendingRows(ctx) {
    var host = ctx._tb.pane("pending");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t6) {
      host.appendChild(el("div", "sc-mem-group-title", t6));
    };
    if (data.pending && data.pending.count) {
      group("pending \u5019\u9009\u961F\u5217 \xB7 " + data.pending.count + " \u6761");
      var plist = el("div", "sc-pointer-list");
      (data.pending.recent || []).forEach(function(p22) {
        var row = makeMemoryPointerRow(String(p22.name || "").replace(/\.md$/, ""), null, (p22.mtime || "").slice(0, 10));
        var act = el("div", "sc-row-gap");
        var fname = String(p22.name || "");
        var okBtn = el("button", "sc-btn subtle", "\u6279\u51C6");
        okBtn.type = "button";
        okBtn.classList.add("sc-btn-xs", "sc-btn-ok");
        okBtn.addEventListener("click", function() {
          appState.api("/memory/approve", { method: "POST", body: JSON.stringify({ pendingFile: fname }) }).then(function() {
            appState.statusFn("\u2713 \u5DF2\u6279\u51C6 " + fname + "\uFF08\u79FB .processed\uFF0C\u5185\u5BB9\u7531\u84B8\u998F\u6B63\u5E38\u5165\u518C\uFF09");
          }).catch(appState.failFn);
        });
        var rmBtn = UI.button("\u5FFD\u7565", function() {
          return appState.api("/memory/approve", { method: "POST", body: JSON.stringify({ pendingFile: fname }) }).then(function() {
            appState.statusFn("\u5DF2\u5FFD\u7565 " + fname);
          });
        }, { danger: true, async: true, busyText: "\u5FFD\u7565\u4E2D\u2026", okText: "\u5DF2\u5FFD\u7565", confirm: "\u5FFD\u7565\u5E76\u79FB\u51FA\u5019\u9009\u961F\u5217\uFF1A" + fname + "\uFF1F" });
        act.appendChild(okBtn);
        act.appendChild(rmBtn);
        row.appendChild(act);
        plist.appendChild(row);
      });
      host.appendChild(plist);
      host.appendChild(el("div", "sc-desc", "\u5171 " + data.pending.count + " \u6761\uFF08\u4EC5\u663E\u793A\u6700\u8FD1 " + Derive.count(data.pending.recent) + " \u6761\uFF09\xB7 \u6279\u51C6=\u786E\u8BA4\u6709\u4EF7\u503C\u5165\u518C\uFF0C\u5FFD\u7565=\u79FB\u51FA\u961F\u5217"));
      var pTip = el("div", "sc-ds-alert info");
      pTip.appendChild(el("div", null, "\u5347\u683C / \u964D\u683C\u8D70 /memory/approve\uFF0C\u7531 L0 \u5224\u636E\u88C1\u51B3\u3002\u7D22\u5F15\u884C\u53EA\u8BFB\uFF0C\u6B63\u6587\u7F16\u8F91\u8D70 /memory/section-edit\u3002"));
      host.appendChild(pTip);
    }
  }
  function mmNotesChips(ctx) {
    var host = ctx._tb.pane("notes");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t6) {
      host.appendChild(el("div", "sc-mem-group-title", t6));
    };
    group("notes \u8BE6\u60C5\u5C0F\u8282");
    var nw = el("div", "sc-notes-list");
    (data.notes || []).forEach(function(nf) {
      var chip = el("div", "sc-note-chip");
      chip.appendChild(el("span", null, nf.name));
      chip.appendChild(el("span", "sc-tag", String(nf.sections.length)));
      chip.title = nf.rel + " \xB7 " + nf.sections.map(function(s4) {
        return s4.title;
      }).join(" / ");
      chip.addEventListener("click", function() {
        appState.memoryViewScroll = view.scrollTop;
        appState.noteReturnRender = null;
        appState.api("/memory/sections?rel=" + encodeURIComponent(nf.rel)).then(function(r7) {
          renderNoteSections(view, r7);
        }).catch(appState.failFn);
      });
      nw.appendChild(chip);
    });
    host.appendChild(nw);
  }
  function mmArchiveZone(ctx) {
    var host = ctx._tb.pane("archive");
    host.appendChild(el("div", "sc-mem-group-title", "\u5F52\u6863\u533A notes/archive/"));
    var list = el("div");
    host.appendChild(list);
    list.appendChild(el("div", "sc-desc", "\u8BFB\u53D6\u4E2D\u2026"));
    appState.api("/cognition/report").then(function(r7) {
      var ar = r7 && r7.archive || [];
      var tabsEls = ctx._tb.box.querySelectorAll("wa-tab");
      if (tabsEls[3]) tabsEls[3].textContent = "\u5F52\u6863\u533A " + ar.length;
      list.textContent = "";
      if (!Derive.has(ar)) list.appendChild(el("div", "sc-desc", "\u6682\u65E0\u5F52\u6863\u6761\u76EE\u3002"));
      else ar.forEach(function(a4) {
        list.appendChild(ovCRow(
          String(a4.file || "\u2014"),
          "notes/archive/ \xB7 \u4EC5\u5F52\u6863\u4E0D\u5220\u9664",
          [ovPill(Derive.num(a4.chars || 0) + " \u5B57\u7B26")]
        ));
      });
      var tip = el("div", "sc-ds-alert ok");
      tip.appendChild(el("div", null, "\u4E3B\u52A8\u9057\u5FD8\u53EA\u5F52\u6863\u3001\u4E0D\u5220\u9664 \u2014\u2014 applyForgetOps \u7981\u76F4\u5220\uFF0C\u70ED\u8282\u4E0E\u753B\u50CF\u8282\u6709\u5B88\u536B\u3002\u5982\u9700\u6062\u590D\uFF0C\u628A notes/archive/ \u4E0B\u7684\u6587\u4EF6\u79FB\u56DE notes/ \u5373\u53EF\uFF08\u9762\u677F\u4E0D\u63D0\u4F9B\u5199\u5165\u53E3\uFF09\u3002"));
      host.appendChild(tip);
    }).catch(function() {
      list.textContent = "";
      list.appendChild(el("div", "sc-desc", "\u5F52\u6863\u533A\u8BFB\u53D6\u5931\u8D25\uFF08/cognition/report\uFF09\u3002"));
    });
  }
  function mmSuiteZone(ctx) {
    var host = ctx._tb.pane("index");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t6) {
      host.appendChild(el("div", "sc-mem-group-title", t6));
    };
    var suite = data.suite;
    if (suite && suite.present) {
      group("\u5B88\u85CF\u672C\u5730\u77E5\u8BC6\u533A \xB7 suite/knowledge");
      var sMemory = null;
      (suite.indexes || []).forEach(function(f3) {
        if (f3.name === "MEMORY.md") sMemory = f3;
      });
      host.appendChild(el("div", "sc-desc", "\u5B88\u85CF\u84B8\u998F\u5668\u4E8B\u5B9E\u6E90\uFF08ADR-0002\uFF09\uFF1AMEMORY " + (sMemory ? Derive.num(sMemory.chars) + "/" + Derive.num(sMemory.cap) + " \xB7 " + Derive.count(sMemory.lines) + " \u884C" : "\u2014") + " \xB7 pending " + String(suite.pending ? suite.pending.count : 0) + " \u6761\u3002"));
      if (Derive.has(suite.notes)) {
        var snw = el("div", "sc-notes-list");
        suite.notes.forEach(function(nf) {
          var chip = el("div", "sc-note-chip");
          chip.appendChild(el("span", null, nf.name));
          chip.appendChild(el("span", "sc-tag", String(nf.sections.length)));
          chip.title = "suite \xB7 " + nf.rel + " \xB7 " + nf.sections.map(function(s4) {
            return s4.title;
          }).join(" / ");
          chip.addEventListener("click", function() {
            appState.memoryViewScroll = view.scrollTop;
            appState.noteReturnRender = null;
            appState.api("/memory/sections?rel=" + encodeURIComponent(nf.rel) + "&root=suite").then(function(r7) {
              renderNoteSections(view, r7);
            }).catch(appState.failFn);
          });
          snw.appendChild(chip);
        });
        host.appendChild(snw);
      }
    } else {
      host.appendChild(el("div", "sc-mem-empty", "\u5B88\u85CF\u672C\u5730\u77E5\u8BC6\u533A\u672A\u542F\u7528\uFF08suite/knowledge \u4E0D\u5B58\u5728\uFF09"));
    }
  }
  function mmGrowthDelta(ctx) {
    var host = ctx._tb.pane("growth");
    var data = ctx.data, view = ctx.view, memoryFile = ctx.memoryFile, cap = ctx.cap;
    var group = function(t6) {
      host.appendChild(el("div", "sc-mem-group-title", t6));
    };
    if (data.delta && data.delta.present && Derive.has(data.delta.rows)) {
      group("\u6700\u8FD1\u6210\u957F delta \xB7 \u6DF1\u7761\u4EA7\u51FA");
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
          staleNote = " \xB7 \u5269\u4F59 " + Math.ceil(remain / 36e5) + "h \u6709\u6548";
        } catch (e8) {
        }
      }
      host.appendChild(el("div", "sc-mem-sub muted", "\u672C\u6B21\u6DF1\u7761\u5F52\u7EB3\u4EA7\u51FA\uFF0848h \u6709\u6548" + staleNote + "\uFF09\xB7 \u5DF2\u5728\u4F1A\u8BDD\u6CE8\u5165\u53EF\u89C1"));
    }
    if (data.weekDiff && (data.weekDiff.deepAdded || 0) > 0) {
      group("\u672C\u5468\u6210\u957F \xB7 \u589E\u91CF");
      var g9 = el("div", "sc-mem-grid");
      g9.appendChild(mkStat("\u6DF1\u7761\u65B0\u4E60\u5F97", String(data.weekDiff.deepAdded || 0) + " \u6761", "\u8FD1 7 \u5929 [\u539F\u5219]/[\u8DEF\u5F84] \u5F52\u7EB3"));
      host.appendChild(g9);
    }
  }
  function secFoldKey(rel, path, title) {
    return "note:" + (rel || "") + ":" + (path || "") + "\xA7" + (title || "");
  }
  function renderNoteSections(view, data) {
    if (!data || !data.present || !data.sections) {
      appState.statusFn(data && data.error || "\u65E0\u5C0F\u8282");
      return;
    }
    view.textContent = "";
    UI.pageHead(data.name, (data.root === "suite" ? "suite \u77E5\u8BC6\u533A \xB7 " : "") + data.rel + " \xB7 " + data.sections.length + " \u4E2A\u5C0F\u8282\uFF08\u767D\u540D\u5355\u53EA\u8BFB\uFF09");
    var back = el("button", "sc-btn subtle", "\u2190 \u8FD4\u56DE" + (appState.noteReturnRender === renderPersona ? "\u753B\u50CF\u677F\u5757" : data.root === "suite" ? "\u5B88\u85CF\u77E5\u8BC6\u533A" : "\u8BB0\u5FC6\u5E93"));
    back.type = "button";
    back.addEventListener("click", function() {
      var backRender = appState.noteReturnRender || renderMemoryExpanded;
      appState.api("/memory/overview").then(function(r7) {
        backRender(view, r7);
        requestAnimationFrame(function() {
          view.scrollTop = appState.memoryViewScroll;
        });
      }).catch(appState.failFn);
    });
    view.appendChild(back);
    view.scrollTop = 0;
    if (Derive.has(data.backrefs)) {
      var bl = el("div");
      bl.appendChild(el("div", "sc-mem-group-title", "\u88AB\u5F15\u7528 \xB7 " + data.backrefs.length));
      var bList = el("div", "sc-idx-list");
      data.backrefs.slice(0, 8).forEach(function(br) {
        var row = el("div", "sc-idx-row");
        row.appendChild(el("span", "sc-idx-tag", String(br.from || "").split("/").pop()));
        row.appendChild(el("span", "sc-idx-subject", String(br.line || "").slice(0, 90)));
        row.title = br.line || "";
        bList.appendChild(row);
      });
      bl.appendChild(bList);
      if (data.backrefs.length > Derive.BACKREF_LIMIT) bl.appendChild(el("div", "sc-mem-sub muted", "\u2026 \u5171 " + data.backrefs.length + " \u5904\u5F15\u7528"));
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
      head.title = "\u70B9\u51FB\u5C55\u5F00/\u6536\u8D77" + (depth > 0 ? "\uFF08\u5B50\u6811\uFF09" : "");
      head.classList.add("sc-card-head");
      head.setAttribute("data-fold-key", key);
      if (pad) head.style.setProperty("--sc-indent", pad + "px");
      var body = el("div", "sc-card-body");
      body.textContent = sec.body || (hasKids ? "" : "\uFF08\u7A7A\u5C0F\u8282\uFF09");
      var editSec = el("button", "sc-btn subtle sc-edit-sec", "\u270E \u7F16\u8F91\u6B64\u5C0F\u8282");
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
        arrow.textContent = open ? "\u25BE" : "\u25B8";
        head.classList.toggle("sc-on", open);
      }
      paint(Fold.get(key, false));
      head.addEventListener("click", function() {
        paint(Fold.toggle(key, false));
      });
      var off = Bus.on("fold", function(p4) {
        if (!head.isConnected && !body.isConnected) {
          off();
          return;
        }
        if (p4 && p4.key === key) paint(Fold.get(key, false));
      });
      container.appendChild(head);
      container.appendChild(body);
      container.appendChild(editSec);
      if (hasKids) {
        var kidPath = (path ? path + "/" : "") + sec.title;
        (sec.children || []).forEach(function(c5) {
          renderSecNode(c5, depth + 1, kidsWrap, kidPath);
        });
        container.appendChild(kidsWrap);
      }
    }
    (data.sections || []).forEach(function(sec) {
      renderSecNode(sec, 0, view, "");
    });
    appState.statusFn(data.rel + " \xB7 " + Derive.count(data.sections) + " \u9876\u5C42\u5C0F\u8282\uFF08\u6811\u72B6\uFF0C\u70B9\u51FB\u9010\u5C42\u5C55\u5F00\uFF1B\u7F16\u8F91\u5728\u8282\u70B9\u7EC6\u8282\uFF09");
  }
  function editNoteSection(data, sec, view) {
    if (!data || !data.rel || !sec) return;
    var bodyTxt = sec.body || "";
    var ta = el("textarea", "sc-input sc-ta");
    ta.value = bodyTxt;
    var wrap = el("div");
    wrap.appendChild(el("div", "sc-desc", "\u7F16\u8F91 \xA7" + sec.title + " \u6B63\u6587\uFF08" + data.rel + "\uFF09\u2014\u2014\u4FDD\u7559\u5F00\u5934\u6458\u8981\u884C\u6700\u4F73\uFF1B\u4FDD\u5B58\u8D70\u5199\u95E8\uFF08\u5907\u4EFD+\u5BB9\u91CF\u7EA2\u7EBF\uFF09\uFF0C\u7D22\u5F15\u6307\u9488\u4E0D\u53D8\u3002"));
    wrap.appendChild(ta);
    var bar = el("div", "sc-toolbar");
    var saveBtn = el("button", "sc-btn", "\u4FDD\u5B58\u6B63\u6587");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function() {
      var next = ta.value.trim();
      if (!next) {
        appState.statusFn("\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A\u2014\u2014\u5982\u9700\u6E05\u7A7A\u8BF7\u7528\u5220\u9664");
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "\u4FDD\u5B58\u4E2D\u2026";
      appState.api("/memory/section-edit", { method: "POST", body: JSON.stringify({ rel: data.rel, section: sec.title, newBody: next }) }).then(function() {
        appState.statusFn("\u2713 \xA7" + sec.title + " \u6B63\u6587\u5DF2\u4FDD\u5B58\uFF08write_gate \u901A\u8FC7\uFF09");
        appState.api("/memory/sections?rel=" + encodeURIComponent(data.rel) + (data.root === "suite" ? "&root=suite" : "")).then(function(r7) {
          renderNoteSections(view, r7);
        }).catch(appState.failFn);
      }).catch(function(e8) {
        saveBtn.disabled = false;
        saveBtn.textContent = "\u4FDD\u5B58\u6B63\u6587";
        appState.failFn(e8);
      });
    });
    var cancelBtn = el("button", "sc-btn subtle", "\u53D6\u6D88");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", function() {
      view.removeChild(wrap);
    });
    bar.appendChild(saveBtn);
    bar.appendChild(cancelBtn);
    wrap.appendChild(bar);
    view.appendChild(wrap);
  }

  // src-client/panes-memory.js
  function openMemoryNote(pointer, autoSection, returnRender) {
    if (!pointer) {
      appState.statusFn("\u8BE5\u6761\u76EE\u65E0 notes \u8DF3\u8F6C\u76EE\u6807");
      return;
    }
    var rel = String(pointer).split("\xA7")[0].trim();
    if (!/^notes\/[a-z]+\.md$/.test(rel)) {
      appState.statusFn("\u6307\u9488\u76EE\u6807\u975E notes \u767D\u540D\u5355\uFF1A" + pointer);
      return;
    }
    appState.memoryViewScroll = appState.refs.view.scrollTop;
    appState.noteReturnRender = returnRender || null;
    appState.api("/memory/sections?rel=" + encodeURIComponent(rel)).then(function(r7) {
      if (!r7 || !r7.present) {
        appState.statusFn(r7 && r7.error || "\u5C0F\u8282\u4E0D\u53EF\u7528");
        return;
      }
      Fold.clear("note:");
      renderNoteSections(appState.refs.view, r7);
      if (autoSection) {
        appState.refs.view.querySelectorAll("[data-fold-key]").forEach(function(h3) {
          if ((h3.textContent || "").indexOf(autoSection) !== -1) Fold.set(h3.getAttribute("data-fold-key"), true);
        });
      }
    }).catch(appState.failFn);
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
    if (pointer) row.appendChild(el("span", "sc-pointer-go", "\u2197"));
    var p4 = pointer, sec = String(pointer || "").split("\xA7")[1] || "";
    row.addEventListener("click", function() {
      openMemoryNote(p4, sec.trim() || null);
    });
    return row;
  }
  function idxHue(tag) {
    var map = { env: 180, tool: 212, flow: 262, lesson: 28, release: 320, \u8EAB\u4EFD: 330, \u504F\u597D: 348, \u4E60\u60EF: 12, \u786C\u4EF6: 200, \u73AF\u5883: 190, \u6F14\u5316: 150, \u7ECF\u9A8C: 45 };
    return map[tag] != null ? map[tag] : 254;
  }
  function idxPill(tag) {
    var h3 = idxHue(tag);
    var pill = el("span", "sc-idx-tag hued", String(tag || "?"));
    pill.style.setProperty("--sc-tag-h", String(h3));
    pill.title = tag || "";
    return pill;
  }
  var TAG_ORDER = ["env", "tool", "flow", "lesson", "release", "user", "agent"];
  function renderIndexRows(container, lines, returnRender, withTagCount) {
    var arr = (lines || []).slice();
    var bad = 0;
    arr = arr.filter(function(ln) {
      var ok = !!ln && typeof ln === "object";
      if (!ok) bad++;
      return ok;
    });
    if (bad) {
      try {
        Log.warn("renderIndexRows\uFF1A\u8DF3\u8FC7 " + bad + " \u6761\u683C\u5F0F\u5F02\u5E38\u7D22\u5F15\u884C\uFF08\u671F\u671B { tag, subject, pointer }\uFF09");
      } catch (e8) {
      }
      container.appendChild(el("div", "sc-mem-empty", "\u26A0 " + bad + " \u6761\u7D22\u5F15\u884C\u6570\u636E\u683C\u5F0F\u5F02\u5E38\u5DF2\u8DF3\u8FC7\uFF08\u671F\u671B { tag, subject, pointer }\uFF09"));
    }
    arr.sort(function(a4, b3) {
      var ia = TAG_ORDER.indexOf(String(a4.tag || "").toLowerCase());
      if (ia === -1) ia = TAG_ORDER.length;
      var ib = TAG_ORDER.indexOf(String(b3.tag || "").toLowerCase());
      if (ib === -1) ib = TAG_ORDER.length;
      return ia - ib;
    });
    var tagCount = {};
    arr.forEach(function(l6) {
      var t6 = String(l6.tag || "").trim();
      if (t6) tagCount[t6] = (tagCount[t6] || 0) + 1;
    });
    arr.forEach(function(ln) {
      var row = el("div", "sc-idx-row");
      row.appendChild(idxPill(ln.tag));
      row.appendChild(el("span", "sc-idx-subject", ln.subject || ""));
      if (ln.pointer) row.appendChild(el("span", "sc-idx-pointer", ln.pointer));
      if (withTagCount) {
        var t6 = String(ln.tag || "").trim();
        var right = el("div", "sc-right");
        right.appendChild(idxPill(ln.tag).cloneNode(true));
        right.appendChild(el("span", null, Derive.num(tagCount[t6] || 1) + " \u6761"));
        row.appendChild(right);
      }
      var ptr = ln.pointer, sec = String(ln.pointer || "").split("\xA7")[1] || "";
      row.addEventListener("click", function() {
        openMemoryNote(ptr, sec.trim() || null, returnRender);
      });
      row.title = (ln.subject || "") + (ln.pointer ? " \u2192 " + ln.pointer : "") + " \xB7 \u70B9\u51FB\u8FDB\u8BE6\u60C5";
      container.appendChild(row);
    });
  }
  function renderPersona(view, data) {
    view.textContent = "";
    UI.pageHead("\u753B\u50CF", "USER.md\uFF08\u7528\u6237\u753B\u50CF\uFF09\u4E0E AGENT.md\uFF08Agent \u753B\u50CF\uFF09\u7684\u552F\u4E00\u5C55\u793A\u4F4D\u3002", {
      routes: ["/memory/overview"],
      actions: [el("span", "sc-proto-note", "\u538B\u7F29\u6267\u884C\u4F4D\uFF1A\u4E0B\u65B9 USER.md \u5361")]
    });
    if (!data || !data.present || !Derive.has(data.indexes)) {
      appState.statusFn(data && data.error || "\u8BB0\u5FC6\u5E93\u753B\u50CF\u4E0D\u53EF\u7528");
      return;
    }
    var pair = data.indexes.filter(function(f3) {
      return f3.name === "USER.md" || f3.name === "AGENT.md";
    });
    var totalRows = 0;
    var grid = el("div", "sc-kpis sc-kpis-2");
    pair.forEach(function(f3) {
      var pct = f3.cap ? Math.round((f3.chars || 0) / f3.cap * 100) : null;
      grid.appendChild(UI.kpi(f3.name.replace(".md", "") + " \u5BB9\u91CF", {
        val: pct === null ? Derive.num(f3.chars || 0) : pct + "%",
        sub: Derive.num(f3.chars || 0) + " / " + Derive.num(f3.cap || "\u2014") + " \u5B57\u7B26 \xB7 " + Derive.count(f3.lines) + " \u6761\u753B\u50CF",
        pct,
        kind: pct === null ? "" : Derive.capKind(pct)
      }).box);
    });
    view.appendChild(grid);
    var statGrid = el("div", "sc-mem-grid");
    statGrid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    pair.forEach(function(f3) {
      var byTag = {};
      (f3.lines || []).forEach(function(ln) {
        var t6 = String(ln && ln.tag || "").trim();
        if (t6) byTag[t6] = (byTag[t6] || 0) + 1;
      });
      var parts = Object.keys(byTag).map(function(k2) {
        return k2 + " " + byTag[k2];
      });
      var pct = f3.cap ? Math.round((f3.chars || 0) / f3.cap * 100) : null;
      var tip = pct !== null && pct >= 80 ? "\u5BB9\u91CF " + Derive.num(f3.chars) + " / " + Derive.num(f3.cap) + " \u2014\u2014 \u8D85\u8FC7 80% \u65F6\u5728\u6B64\u663E\u793A\u4E00\u884C\u63D0\u793A\uFF1B\u7EA2\u7EBF\u7531 write_gate \u5199\u5165\u65F6\u5F3A\u5236\u3002" : f3.cap ? "\u5BB9\u91CF " + Derive.num(f3.chars) + " / " + Derive.num(f3.cap) + " \u2014\u2014 [\u539F\u5219] / [\u8DEF\u5F84] \u884C\u6570\u5728\u300C\u603B\u89C8 \xB7 \u672C\u6708\u6210\u957F\u300D\u6309\u6708\u8DDF\u8E2A\u3002" : "\u6682\u65E0\u5BB9\u91CF\u95E8\u3002";
      var s4 = el("div", "sc-mem-stat");
      s4.appendChild(el("div", "sc-mem-stat-label", f3.name.replace(".md", "") + " \u6784\u6210"));
      s4.appendChild(el("div", "sc-mem-stat-value", Derive.count(f3.lines) + " \u6761"));
      s4.appendChild(el("div", "sc-mem-stat-sub", Derive.has(parts) ? parts.join(" \xB7 ") : "\uFF08\u6682\u65E0\u6807\u7B7E\u884C\uFF09"));
      s4.appendChild(el("div", "sc-mem-stat-rule", tip));
      statGrid.appendChild(s4);
    });
    view.appendChild(statGrid);
    var mat = data.maturity || {};
    var matBins = Array.isArray(mat.bins) ? mat.bins : [];
    var matTotal = Number(mat.total || 0);
    var matGate = Number(mat.gate || 0.5);
    var matMax = Math.max.apply(null, [1].concat(matBins.map(function(n6) {
      return Number(n6) || 0;
    })));
    var matCard = UI.card("\u6210\u719F\u5EA6\u5206\u5E03", {
      sub: "v4 \u65B0\u589E \xB7 \u6309 0.2 \u5206\u6863\u7EDF\u8BA1\u5E93\u5185\u5C0F\u8282\u6570",
      right: [el("span", "sc-src", "/memory/overview")]
    });
    var histWrap = el("div", "sc-hist-wrap");
    var hist = el("div", "sc-hist");
    ["0\u2013.2", ".2\u2013.4", ".4\u2013.6", ".6\u2013.8", ".8\u20131"].forEach(function(b3, bi) {
      var n6 = Number(matBins[bi] || 0);
      var bar = el("i");
      if (n6 > 0) bar.style.height = Math.round(n6 / matMax * 100) + "%";
      bar.title = b3 + "\uFF1A" + n6 + " \u8282";
      bar.appendChild(el("b", null, b3));
      hist.appendChild(bar);
    });
    histWrap.appendChild(hist);
    matCard.body.appendChild(histWrap);
    matCard.body.appendChild(el("div", "sc-mem-stat-rule", matTotal ? "\u5171 " + matTotal + " \u8282\uFF1AA \u2265 " + matGate + "\uFF08\u5347\u683C\u7EBF\uFF09\u624D\u5177\u5907\u5347\u683C\u4E3A [\u539F\u5219] / [\u8DEF\u5F84] \u7684\u7A33\u5B9A\u6761\u4EF6\u3002\u53E3\u5F84\uFF1A\u5E93\u5185 audit/maturation.jsonl \u6309 A \u503C 0.2 \u5206\u6863\u7684\u5C0F\u8282\u6570\u3002" : "\u6210\u719F\u5EA6\u53F0\u8D26\u4E3A\u7A7A\uFF1A\u5E93\u5185 audit/maturation.jsonl \u5C1A\u65E0\u8BB0\u5F55\uFF08\u8DD1\u4E00\u6B21\u6210\u719F\u5EA6\u626B\u63CF\u5373\u5199\u5165\uFF09\u3002"));
    view.appendChild(matCard.box);
    pair.forEach(function(f3, idx) {
      totalRows += Derive.count(f3.lines);
      var title = f3.name && f3.label ? String(f3.name) + " \xB7 " + String(f3.label) : f3.label || String(f3.name || "").replace(/\.md$/, "");
      var right = [el("span", "sc-src", "/memory/overview \xB7 " + String(f3.name || ""))];
      if (idx === 0) {
        right.push(UI.button("\u538B\u7F29\u753B\u50CF", function() {
          appState.statusFn("\u753B\u50CF\u538B\u7F29\uFF08\u6DF1\u5EA6\u7761\u7720\u5F52\u7EB3\uFF09\u89E6\u53D1\u4E2D\u2026");
          return appState.api("/deepsleep/trigger", { method: "POST", body: "{}" }).then(function(rr) {
            appState.statusFn(rr && rr.ok ? "\u2713 \u5DF2\u89E6\u53D1\u6DF1\u7761\u5F52\u7EB3\uFF08\u9AD8\u5206\u91CD\u590D\u6761\u76EE\u5C06\u6298\u53E0\u4E3A\u7D22\u5F15\u9879\uFF09" : "\u26A0 \u89E6\u53D1\u5931\u8D25\uFF1A" + (rr && rr.error || ""));
          });
        }, {
          async: true,
          busyText: "\u538B\u7F29\u4E2D\u2026",
          okText: "\u5DF2\u89E6\u53D1\u5F52\u7EB3",
          title: "\u753B\u50CF\u538B\u7F29\uFF1A\u89E6\u53D1\u4E00\u6B21\u6DF1\u5EA6\u7761\u7720\u5F52\u7EB3\uFF0C\u7531\u6811\u6574\u7406\u628A\u9AD8\u5206\u91CD\u590D\u6761\u76EE\u6298\u53E0\u4E3A\u7D22\u5F15\u9879\uFF08\u65E0\u72EC\u7ACB\u7AEF\u70B9\uFF09",
          confirm: "\u300C\u538B\u7F29\u753B\u50CF\u300D= \u89E6\u53D1\u4E00\u6B21\u6DF1\u5EA6\u7761\u7720\u5F52\u7EB3\uFF0C\u7531\u6DF1\u7761\u6811\u6574\u7406\u6298\u53E0\u9AD8\u5206\u91CD\u590D\u6761\u76EE\u3002\u7ACB\u5373\u6267\u884C\uFF1F"
        }));
      }
      var c5 = UI.card(title, {
        sub: Derive.count(f3.lines) + " \u6761",
        right
      });
      view.appendChild(c5.box);
      if (!Derive.has(f3.lines)) {
        c5.body.appendChild(el("div", "sc-mem-empty", "\uFF08\u6682\u65E0\u6307\u9488\u884C\uFF09"));
        return;
      }
      var list = el("div", "sc-idx-list");
      renderIndexRows(list, f3.lines, renderPersona);
      c5.body.appendChild(list);
    });
    view.appendChild(el("div", "sc-note", "\u6CE8\uFF1A\u5BB9\u91CF\u767E\u5206\u6BD4\u4E0E\u5BB9\u91CF\u6761\u6309 write_gate \u7684\u5B9E\u9645\u4E0A\u9650\u8BA1\u7B97\uFF1B\u6307\u9488\u884C\u70B9\u51FB\u53EF\u76F4\u8FBE notes/ \u5BF9\u5E94\u5C0F\u8282\u3002"));
    appState.statusFn("\u753B\u50CF \xB7 " + totalRows + " \u6761\u6307\u9488");
  }

  // src-client/panes-config.js
  function renderViewRoots(view, rootListWrap) {
    view.textContent = "";
    UI.pageHead("\u5B88\u85CF\u6839\u76EE\u5F55", "\u6307\u5411\u542B shoucang.config.yaml \u7684\u5DE5\u4F5C\u533A\u76EE\u5F55\u3002\u8BE5\u76EE\u5F55\u672C\u8EAB\u5373\u4E3A Obsidian \u517C\u5BB9 vault\uFF08Markdown + frontmatter + [[\u53CC\u94FE]]\uFF09\uFF0C\u53EF\u7528 Obsidian \u76F4\u63A5\u6253\u5F00\u3002", { routes: ["/roots", "/get_root", "/root/bootstrap"] });
    var listWrap = el("div");
    rootListWrap(listWrap);
    view.appendChild(listWrap);
    var addItem = el("div", "setting-item");
    var info = el("div", "setting-item-info");
    info.appendChild(el("div", "setting-item-name", "\u6DFB\u52A0\u6839\u76EE\u5F55"));
    info.appendChild(el("div", "setting-item-desc", "\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u987B\u5305\u542B shoucang.config.yaml"));
    var input = el("input", "sc-input");
    input.placeholder = "\u8BF7\u8F93\u5165 vault \u7684\u7EDD\u5BF9\u8DEF\u5F84";
    var btn = el("button", "sc-btn", "\u6DFB\u52A0\u5E76\u542F\u7528");
    btn.onclick = function() {
      var p4 = input.value.trim();
      if (!p4) return;
      appState.api("/set_root", { method: "POST", body: JSON.stringify({ path: p4 }) }).then(function() {
        input.value = "";
        appState.statusFn("\u2713 \u6839\u76EE\u5F55\u5DF2\u542F\u7528");
        appState.refreshView();
      }).catch(appState.failFn);
    };
    addItem.appendChild(info);
    addItem.appendChild(input);
    addItem.appendChild(btn);
    view.appendChild(addItem);
    function draw(r7) {
      listWrap.textContent = "";
      if (!Derive.has(r7.roots)) {
        var empty = el("div", "setting-item");
        empty.appendChild(el("div", "setting-item-desc", "\u5C1A\u672A\u767B\u8BB0\u4EFB\u4F55\u6839\u76EE\u5F55\u2014\u2014\u5728\u4E0A\u65B9\u8F93\u5165\u8DEF\u5F84\u6DFB\u52A0\u3002"));
        listWrap.appendChild(empty);
        return;
      }
      r7.roots.forEach(function(root) {
        var item = el("div", "setting-item sc-rootitem" + (root.id === r7.active ? " active" : ""));
        var dot = el("span", "sc-dot" + (root.id === r7.active ? " on" : ""));
        void dot;
        item.appendChild(dot.cloneNode ? dot : dot);
        item.appendChild(el("span", "sc-rootname", root.name));
        item.appendChild(el("span", "sc-rootpath", root.path)).title = root.path;
        var useBtn = el("button", "sc-btn subtle", root.id === r7.active ? "\u5F53\u524D" : "\u542F\u7528");
        if (root.id === r7.active) useBtn.disabled = true;
        else useBtn.onclick = function() {
          appState.api("/set_root", { method: "POST", body: JSON.stringify({ path: root.path }) }).then(function() {
            appState.statusFn("\u2713 \u5DF2\u542F\u7528 " + root.name);
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
    UI.pageHead("\u914D\u7F6E\u539F\u6587", "\u76F4\u63A5\u7F16\u8F91 shoucang.config.yaml \u5168\u6587\u3002\u4FDD\u5B58\u65F6\u539F\u6587\u4EF6\u81EA\u52A8\u5907\u4EFD\u4E3A .bak-\u65F6\u95F4\u6233\u3002", { routes: ["/config", "/save"] });
    ta.id = "sc-yaml";
    ta.spellcheck = false;
    view.appendChild(ta);
    saveRow.className = "setting-item";
    var spacer = el("div", "setting-item-info");
    saveRow.appendChild(spacer);
    saveRow.appendChild(saveRow._btn = el("button", "sc-btn", "\u4FDD\u5B58"));
    view.appendChild(saveRow);
    view.appendChild(el("div", "sc-mem-group-title", "\u6700\u8FD1\u6539\u52A8\uFF085 \u6761\uFF09"));
    var recentBox = el("div", "sc-recent");
    recentBox.appendChild(el("div", "sc-recent-row", "\u8BFB\u53D6\u4E2D\u2026"));
    view.appendChild(recentBox);
    appState.api("/config/recent").then(function(r7) {
      recentBox.textContent = "";
      var cfg = r7 && r7.configMtime ? "\u914D\u7F6E\u6587\u4EF6\u6539\u52A8\uFF1A" + fmtTime(r7.configMtime) : "\u914D\u7F6E\u6587\u4EF6\u5C1A\u65E0\u8BB0\u5F55";
      recentBox.appendChild(el("div", "sc-recent-row", cfg));
      var items = r7 && r7.recent || [];
      if (!Derive.has(items)) {
        recentBox.appendChild(el("div", "sc-recent-row", "\u8BB0\u5FC6\u5E93\u5C1A\u65E0 git \u5FEB\u7167\uFF08\u5199\u5165\u4E00\u6B21\u5373\u51FA\u73B0\uFF09"));
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
      recentBox.appendChild(el("div", "sc-recent-row", "\u8BFB\u53D6\u5931\u8D25\uFF08/config/recent\uFF09"));
    });
  }
  function renderConfigRaw(host) {
    var rootSection = el("div");
    var yamlSection = el("div");
    var ta = document.createElement("textarea");
    appState.refs.ta = ta;
    var saveRow = el("div");
    renderViewRoots(rootSection, function(w2) {
      appState.refs.rootListWrap = w2;
    });
    renderViewYaml(yamlSection, ta, saveRow);
    host.appendChild(rootSection);
    host.appendChild(yamlSection);
    appState.api("/roots").then(function(r7) {
      if (renderViewRoots._draw) renderViewRoots._draw(r7);
    }).catch(appState.failFn);
    if (saveRow._btn) {
      saveRow._btn.onclick = function() {
        appState.api("/save", { method: "POST", body: JSON.stringify({ text: ta.value }) }).then(function() {
          appState.statusFn("\u2713 \u5DF2\u4FDD\u5B58\uFF0C\u539F\u6587\u4EF6\u5DF2\u5907\u4EFD\u4E3A .bak-*");
        }).catch(appState.failFn);
      };
    }
    appState.api("/config").then(function(r7) {
      ta.value = r7.text || "";
      if (!r7.text) appState.statusFn(r7.error === "no-active-root" ? "\u672A\u6FC0\u6D3B\u6839\u76EE\u5F55\u2014\u2014\u8BF7\u5728\u300C\u9AD8\u7EA7 \xB7 \u6839\u76EE\u5F55\u300D\u533A\u6DFB\u52A0\u3002" : r7.error || "");
    }).catch(appState.failFn);
  }

  // src-client/panes-arch.js
  function renderFacts(host, obj, depth) {
    var d3 = depth || 0;
    if (obj === null || obj === void 0) {
      host.appendChild(el("div", "sc-desc", "\u2014"));
      return;
    }
    if (typeof obj !== "object") {
      host.appendChild(el("div", "sc-desc", String(obj)));
      return;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        host.appendChild(el("div", "sc-desc", "\uFF08\u7A7A\uFF09"));
        return;
      }
      var rows = obj.slice(0, 12);
      rows.forEach(function(it) {
        if (it && typeof it === "object") {
          var sub = el("div", "sc-facts-row");
          var line = Object.keys(it).slice(0, 6).map(function(k2) {
            return k2 + "=" + String(it[k2]).slice(0, 40);
          }).join(" \xB7 ");
          sub.appendChild(el("div", "sc-desc", line));
          host.appendChild(sub);
        } else host.appendChild(el("div", "sc-desc", "\xB7 " + String(it)));
      });
      if (obj.length > rows.length) host.appendChild(el("div", "sc-desc", "\u2026 \u53E6\u6709 " + (obj.length - rows.length) + " \u6761"));
      return;
    }
    var pairs = [];
    Object.keys(obj).forEach(function(k2) {
      var v2 = obj[k2];
      if (v2 === null || v2 === void 0) pairs.push([k2, "\u2014"]);
      else if (typeof v2 === "object") {
        if (Array.isArray(v2)) pairs.push([k2, "[" + v2.length + " \u6761]"]);
        else pairs.push([k2, "{" + Object.keys(v2).length + " \u952E}"]);
      } else pairs.push([k2, String(v2)]);
    });
    try {
      host.appendChild(UI.kv(pairs));
    } catch (e8) {
      host.appendChild(el("div", "sc-desc", JSON.stringify(obj).slice(0, 400)));
    }
    if (d3 < 1) {
      Object.keys(obj).forEach(function(k2) {
        var v2 = obj[k2];
        if (v2 && typeof v2 === "object" && !Array.isArray(v2)) {
          host.appendChild(el("div", "sc-sub", k2));
          renderFacts(host, v2, d3 + 1);
        } else if (Array.isArray(v2) && v2.length && typeof v2[0] === "object") {
          host.appendChild(el("div", "sc-sub", k2 + "\uFF08" + v2.length + " \u6761\uFF09"));
          renderFacts(host, v2, d3 + 1);
        }
      });
    }
  }
  function rawDetails(host, obj) {
    var det = document.createElement("details");
    det.appendChild(el("summary", "sc-desc", "\u539F\u59CB JSON"));
    var pre = el("pre", "sc-code", JSON.stringify(obj, null, 2));
    det.appendChild(pre);
    host.appendChild(det);
  }
  function renderViewArch(view) {
    view.textContent = "";
    var safeFail = function(e8) {
      var msg = e8 && (e8.message || e8.error) ? String(e8.message || e8.error) : "\u53D6\u6570\u5931\u8D25\uFF08\u7AEF\u70B9\u4E0D\u53EF\u8FBE\u6216\u8FD4\u56DE\u975E JSON\uFF09";
      try {
        host.appendChild(el("div", "sc-desc", "\u26A0 " + msg));
      } catch (_2) {
      }
    };
    var guard = function(path) {
      return function() {
        try {
          host.appendChild(el("div", "sc-desc", "\u26A0 " + path + " \u53D6\u6570\u5931\u8D25\uFF08\u7AEF\u70B9\u4E0D\u53EF\u8FBE\uFF09"));
        } catch (_2) {
        }
      };
    };
    var host = view;
    try {
      renderArchBody(view, safeFail);
    } catch (e8) {
      view.appendChild(el("div", "sc-desc", "\u26A0 \u67B6\u6784\u89C6\u56FE\u6E32\u67D3\u5931\u8D25\uFF1A" + String(e8 && e8.message || e8)));
    }
  }
  function renderArchBody(view, safeFail) {
    var fail = safeFail;
    var fail = function() {
    };
    UI.pageHead("\u67B6\u6784", "\u91CD\u6784\u540E\u7684\u4E8B\u5B9E\u9762\u4E0E\u65CB\u94AE\uFF1A\u5185\u5BB9\u73AF KPI \xB7 \u8BB0\u5F55\u5C42\u5BF9\u8D26\u4E0E\u81EA\u8BC1 \xB7 \u7EDF\u4E00\u53F0\u8D26\u4E0E legacy \u6D41 \xB7 \u88C5\u914D\u6839\u5C31\u7EEA\u5EA6 \xB7 \u65AD\u8A00\u56FE \xB7 \u8BA4\u77E5\u73AF\u53C2\u6570\u3002\u6570\u636E\u5168\u90E8\u6765\u81EA\u53EA\u8BFB\u7AEF\u70B9\uFF0C\u552F\u4E00\u5199\u5165\u53E3\u662F\u8BA4\u77E5\u73AF\u65CB\u94AE\uFF08\u767D\u540D\u5355\u8865\u4E01\uFF09\u3002", {
      routes: ["/rings", "/arch/records", "/arch/graph", "/arch/observability", "/arch/assembly", "/mcl/config"],
      refresh: true
    });
    var ops = el("div", "sc-opgrid");
    ops.appendChild(appState.opCard("\u5185\u5BB9\u73AF\u4E0E\u53F0\u8D26", "\u4E94\u73AF KPI \u4E0E\u73AF\u4E8B\u4EF6\u5BF9\u8D26 + \u7EDF\u4E00\u53F0\u8D26\u6309 type \u5206\u5E03\uFF08\u7F3A `at` \u884C\u6570 = \u4FE1\u5C01\u5B8C\u6574\u6027\uFF09\u3002", "GET /rings \xB7 /arch/observability", "\u770B\u89C2\u6D4B", function() {
      tb.select("obs");
      return Promise.resolve();
    }, { icon: "M3 12h4l2.5-6 4 13L16 12h5", okText: "\u5DF2\u5207\u5230\u300C\u89C2\u6D4B\u300D" }));
    ops.appendChild(appState.opCard("\u8BA4\u77E5\u73AF\u65CB\u94AE", "\u719F\u6089\u5EA6\u9608\u503C / \u518D\u5F15\u5BFC\u4E0A\u9650 / \u6750\u6599\u9884\u7B97 / topK / \u6750\u6599\u53BB\u5411\uFF08P2b\uFF09/ REM \u2014\u2014 \u767D\u540D\u5355\u8865\u4E01\u5199 scheduler.json\u3002", "GET|POST /mcl/config", "\u53BB\u8C03\u53C2", function() {
      tb.select("mcl");
      return Promise.resolve();
    }, { icon: "M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M2 14h4|M10 8h4|M18 16h4", okText: "\u5DF2\u5207\u5230\u300C\u8BA4\u77E5\u73AF\u65CB\u94AE\u300D" }));
    ops.appendChild(appState.opCard("\u91CD\u53D6\u67B6\u6784\u5FEB\u7167", "\u91CD\u65B0\u62C9\u53D6\u8BB0\u5F55\u5C42 / \u65AD\u8A00\u56FE / \u89C2\u6D4B / \u88C5\u914D\u56DB\u4E2A\u53EA\u8BFB\u7AEF\u70B9\uFF08\u5404\u9875\u7B7E\u540C\u65F6\u5237\u65B0\uFF09\u3002", "GET /arch/*", "\u5237\u65B0", function() {
      renderArchBody(view, safeFail);
      return Promise.resolve();
    }, { icon: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1", busyText: "\u53D6\u6570\u4E2D\u2026", okText: "\u5DF2\u5237\u65B0" }));
    view.appendChild(ops);
    var kpis = el("div", "sc-kpis");
    var kRec = UI.kpi("\u8BB0\u5FC6\u8BB0\u5F55", { val: "\u2014", sub: "store census", pct: 0, kind: "ended" });
    var kPar = UI.kpi("\u8F7D\u4F53\u5BF9\u8D26", { val: "\u2014", sub: "md \u2194 store \u9010\u4EF6", pct: 0, kind: "ended" });
    var kSelf = UI.kpi("\u5199\u65F6\u81EA\u8BC1", { val: "\u2014", sub: "\u53EF\u8FD8\u539F / \u5206\u6B67", pct: 0, kind: "ended" });
    var kAsm = UI.kpi("\u88C5\u914D\u9762", { val: "\u2014", sub: "\u60F0\u6027\u6865 / \u65B0\u67B6\u6784\u6A21\u5757", pct: 0, kind: "ended" });
    [kRec, kPar, kSelf, kAsm].forEach(function(c5) {
      kpis.appendChild(c5.box);
    });
    view.appendChild(kpis);
    var pane = function(text) {
      var p4 = el("div");
      p4.appendChild(el("div", "sc-desc", text));
      return p4;
    };
    var pRings = pane("\u8BFB\u53D6\u4E2D\u2026\u82E5\u957F\u671F\u5982\u6B64\u8BF4\u660E /rings \u7AEF\u70B9\u4E0D\u53EF\u8FBE");
    var pRec = pane("\u8BFB\u53D6\u4E2D\u2026\u82E5\u957F\u671F\u5982\u6B64\u8BF4\u660E /arch/records \xB7 /arch/graph \u7AEF\u70B9\u4E0D\u53EF\u8FBE");
    var pObs = pane("\u8BFB\u53D6\u4E2D\u2026\u82E5\u957F\u671F\u5982\u6B64\u8BF4\u660E /arch/observability \u7AEF\u70B9\u4E0D\u53EF\u8FBE");
    var pAsm = pane("\u8BFB\u53D6\u4E2D\u2026\u82E5\u957F\u671F\u5982\u6B64\u8BF4\u660E /arch/assembly \u7AEF\u70B9\u4E0D\u53EF\u8FBE");
    var pMcl = pane("\u8BFB\u53D6\u4E2D\u2026\u82E5\u957F\u671F\u5982\u6B64\u8BF4\u660E /mcl/config \u7AEF\u70B9\u4E0D\u53EF\u8FBE");
    var tb = UI.tabs("arch", [
      { id: "rings", label: "\u5185\u5BB9\u73AF", pane: pRings },
      { id: "rec", label: "\u8BB0\u5F55\u4E0E\u56FE", pane: pRec },
      { id: "obs", label: "\u89C2\u6D4B", pane: pObs },
      { id: "asm", label: "\u88C5\u914D", pane: pAsm },
      { id: "mcl", label: "\u8BA4\u77E5\u73AF\u65CB\u94AE", pane: pMcl }
    ]);
    view.appendChild(tb.box);
    appState.api("/rings").then(function(r7) {
      pRings.textContent = "";
      var c5 = UI.card("\u4E94\u73AF KPI \u4E0E\u73AF\u4E8B\u4EF6\u5BF9\u8D26");
      pRings.appendChild(c5.box);
      renderFacts(c5.body, r7, 0);
      rawDetails(c5.body, r7);
    }).catch(appState.failFn);
    appState.api("/arch/records").then(function(r7) {
      pRec.textContent = "";
      var c1 = UI.card("\u8BB0\u5F55\u5C42\uFF08Record \u4E8B\u5B9E\u6E90\uFF09");
      pRec.appendChild(c1.box);
      var st = r7.store || {};
      kRec.set(String(st.records || 0), "\u65E0\u6807\u7B7E " + String(st.untagged || 0) + " \u6761");
      c1.body.appendChild(UI.kv([
        ["\u8BB0\u5F55\u6570", String(st.records || 0)],
        ["\u65E0\u6807\u7B7E\u5F85\u5F52\u7C7B", String(st.untagged || 0)],
        ["md\u2194store \u5BF9\u8D26", String(r7.carriersOk || 0) + " / " + String(r7.carriersTotal || 0) + " \u8F7D\u4F53\u4E00\u81F4"]
      ]));
      var sh = r7.shadow || {};
      kPar.set(String(r7.carriersOk || 0) + " / " + String(r7.carriersTotal || 0), "md \u2194 store \u9010\u4EF6\u4E00\u81F4");
      if (r7.carriersTotal) kPar.fill(Math.round((r7.carriersOk || 0) / r7.carriersTotal * 100), r7.carriersOk === r7.carriersTotal ? "ended" : "suspect");
      kSelf.set(String(sh.verified || 0) + " / " + String(sh.diverged || 0), "\u5199 " + String(sh.writes || 0) + " \u6B21 \xB7 \u53EF\u8FD8\u539F / \u5206\u6B67");
      kSelf.fill(sh.diverged ? 0 : 100, sh.diverged ? "stalled" : "ended");
      c1.body.appendChild(UI.kv([
        ["\u5199\u65F6\u81EA\u8BC1", "\u5199 " + String(sh.writes || 0) + " \xB7 \u53EF\u8FD8\u539F " + String(sh.verified || 0) + " \xB7 **\u5206\u6B67 " + String(sh.diverged || 0) + "**"],
        ["\u672B\u6B21", String(sh.lastAt || "\u2014") + "\uFF08" + String(sh.lastFile || "\u2014") + "\uFF09"]
      ]));
      c1.body.appendChild(el("div", "sc-sub", "\u8F7D\u4F53\u9010\u4EF6\u5BF9\u8D26"));
      renderFacts(c1.body, (r7.carriers || []).map(function(x2) {
        return { \u6587\u4EF6: x2.file, md: x2.mdBytes, store: x2.storeBytes, \u4E00\u81F4: x2.ok ? "\u662F" : "\u5426", \u539F\u56E0: x2.reason || "" };
      }), 1);
      c1.body.appendChild(el("div", "sc-sub", "\u8DE8\u6587\u4EF6\u9010\u5B57\u8282\u540C\u6587\uFF08\u53EA\u62A5\u544A\u4E0D\u5220\u2014\u2014\u5185\u5BB9\u5C5E\u7528\u6237\uFF09"));
      var dups = r7.dups || [];
      if (dups.length === 0) c1.body.appendChild(el("div", "sc-desc", "\u65E0\uFF08\u9664\u7D22\u5F15/\u8BE6\u60C5\u540C\u540D\u6807\u9898\u8FD9\u7C7B\u7ED3\u6784\u6027\u91CD\u540D\uFF09"));
      dups.slice(0, 8).forEach(function(dd) {
        var box = el("div", "sc-facts-row");
        box.appendChild(el("div", "sc-desc", "\xD7" + dd.count + " " + JSON.stringify(String(dd.text || "").slice(0, 60))));
        box.appendChild(el("div", "sc-desc", (dd.files || []).map(function(f3) {
          return f3.file + "#" + f3.order;
        }).join("  |  ")));
        c1.body.appendChild(box);
      });
      c1.body.appendChild(el("div", "sc-desc", r7.address && r7.address.note || ""));
      appState.api("/arch/graph").then(function(g2) {
        pObs.textContent = "";
        var c22 = UI.card("\u65AD\u8A00\u56FE\uFF08\u5173\u7CFB\u5373\u4E8B\u5B9E\uFF09");
        pRec.appendChild(c22.box);
        c22.body.appendChild(UI.kv([
          ["\u8282\u70B9", String(g2.nodes || 0) + "\uFF08\u8BB0\u5F55 " + String(g2.recordNodes || 0) + " + \u951A " + String(g2.anchors || 0) + "\uFF09"],
          ["\u8FB9", String(g2.edges || 0)],
          ["\u60AC\u7A7A\u8BC1\u636E", String(g2.danglingEvidence || 0)],
          ["\u6D3B\u8DC3 / \u5931\u6548", String(g2.live || 0) + " / " + String(g2.expired || 0)]
        ]));
        c22.body.appendChild(UI.kv([
          ["answers", String(g2.answers || 0)],
          ["collision", String(g2.collision || 0)],
          ["commitment", String(g2.commitment || 0)],
          ["relation", String(g2.relation || 0)],
          ["pointsTo", String(g2.pointsTo || 0)],
          ["provenance", String(g2.provenance || 0)],
          ["supersede", String(g2.supersede || 0)]
        ]));
      }).catch(appState.failFn);
    }).catch(appState.failFn);
    appState.api("/arch/observability").then(function(r7) {
      pObs.textContent = "";
      var c5 = UI.card("\u7EDF\u4E00\u53F0\u8D26\u4E0E\u89C2\u6D4B\u9762");
      pObs.appendChild(c5.box);
      var lg = r7.ledger || {};
      c5.body.appendChild(UI.kv([
        ["\u53F0\u8D26\u884C\u6570", String(lg.lines || 0)],
        ["\u7F3A at \u884C\uFF08\u4FE1\u5C01\u5B8C\u6574\u6027\uFF09", String(lg.missingAt || 0) + (r7.envelope && r7.envelope.ok ? " \u2713" : " \u26A0")],
        ["\u53F0\u8D26\u8DEF\u5F84", String(lg.path || "")]
      ]));
      c5.body.appendChild(el("div", "sc-sub", "\u6309 type \u5206\u5E03"));
      renderFacts(c5.body, lg.byType || [], 1);
      c5.body.appendChild(el("div", "sc-sub", "audit \u76EE\u5F55\u5B9E\u51B5"));
      renderFacts(c5.body, r7.files || [], 1);
      c5.body.appendChild(el("div", "sc-sub", "legacy \u6D41\uFF08\u5DF2\u5E76\u5165\u53F0\u8D26\uFF0C\u4EC5\u5B58\u5386\u53F2\uFF09"));
      renderFacts(c5.body, (r7.legacy || []).map(function(x2) {
        return { \u6D41: x2.name, \u4ECD\u5728: x2.present ? "\u662F" : "\u5426" };
      }), 1);
      var reg = r7.registry || {};
      c5.body.appendChild(el("div", "sc-sub", "\u53E3\u5F84\uFF08\u65CF \xD7 \u57DF\uFF09"));
      c5.body.appendChild(el("div", "sc-desc", "\u65CF\uFF1A" + (reg.families || []).join(" \xB7 ")));
      c5.body.appendChild(el("div", "sc-desc", "\u57DF\uFF1A" + (reg.domains || []).join(" \xB7 ")));
      c5.body.appendChild(el("div", "sc-desc", "\u6743\u5A01\uFF1A" + String(reg.authority || "") + "\uFF08suite \u57DF\u4E8B\u4EF6\u6D41\u76EE\u6807 = " + String((reg.baseline || {}).suiteEventStreams) + "\uFF09"));
    }).catch(appState.failFn);
    appState.api("/arch/assembly").then(function(r7) {
      pAsm.textContent = "";
      var c5 = UI.card("\u88C5\u914D\u6839\uFF08composition root\uFF09\u4E0E\u5DF2\u88C5\u80FD\u529B");
      pAsm.appendChild(c5.box);
      var cp = r7.composition || {};
      c5.body.appendChild(UI.kv([
        ["\u60F0\u6027\u6865\u8FB9\u6570", String(cp.bridges) + (cp.bridges === 0 ? " \u2713\uFF08\u4E09\u6761\u6865\u5DF2\u9000\u5F79\uFF09" : " \u26A0")],
        ["\u5951\u7EA6\u8DEF\u7531\u6570", String((r7.routes || {}).declared || 0)]
      ]));
      var st2 = r7.store || {};
      c5.body.appendChild(UI.item(
        "\u5B58\u50A8\u6A21\u5F0F storeMode",
        "md = \u53EA\u5199 md \u6295\u5F71\uFF1Bdual = md \u2194 Record \u53CC\u5199\uFF08\u5199\u65F6\u81EA\u8BC1\uFF1A\u53EF\u8FD8\u539F / \u5206\u6B67\uFF09\u3002" + (st2.note ? "\u26A0 " + st2.note : ""),
        UI.select(
          [{ value: "md", label: "md\uFF08\u53EA\u7528 md \u6295\u5F71\uFF09" }, { value: "dual", label: "dual\uFF08md \u2194 Record \u53CC\u5199\uFF09" }],
          st2.mode === "dual" ? "dual" : "md",
          function(v2) {
            appState.api("/set", { method: "POST", body: JSON.stringify({ key: "storeMode", value: v2 }) }).then(function(res) {
              appState.statusFn(res && res.ok ? "\u2713 storeMode = " + v2 + "\uFF08\u5DF2\u5199 scheduler.json\uFF09" : "\u26A0 \u672A\u751F\u6548");
              renderArchBody(view, safeFail);
            }).catch(function() {
              appState.statusFn("\u26A0 storeMode \u5199\u5165\u5931\u8D25\uFF08\u679A\u4E3E\u6216\u767D\u540D\u5355\u62D2\u7EDD\uFF09", "error");
            });
          },
          "\u5B58\u50A8\u6A21\u5F0F"
        ),
        {}
      ));
      renderFacts(c5.body, cp.handles || [], 1);
      var pl = r7.plugin || {};
      var mods = pl.modules || [];
      var modsOk = mods.filter(function(m3) {
        return m3.present;
      }).length;
      kAsm.set(String(cp.bridges) + " \u6865", modsOk + " / " + mods.length + " \u65B0\u67B6\u6784\u6A21\u5757\u5728");
      kAsm.fill(cp.bridges === 0 && modsOk === mods.length ? 100 : 0, cp.bridges === 0 && modsOk === mods.length ? "ended" : "suspect");
      c5.body.appendChild(UI.kv([["\u63D2\u4EF6\u7248\u672C", String(pl.version || "")], ["lib \u6587\u4EF6\u6570", String(pl.libFiles || 0)]]));
      c5.body.appendChild(el("div", "sc-sub", "\u91CD\u6784\u540E\u65B0\u589E\u6A21\u5757\uFF08\u88C5\u4E0A\u53BB\u7684\u90A3\u4EFD\u662F\u5426\u5E26\u7740\uFF09"));
      renderFacts(c5.body, (pl.modules || []).map(function(m3) {
        return { \u6A21\u5757: m3.name, \u5728: m3.present ? "\u2713" : "\u2717" };
      }), 1);
      c5.body.appendChild(el("div", "sc-desc", cp.note || ""));
    }).catch(appState.failFn);
    function renderMclKnobs() {
      pMcl.textContent = "";
      appState.api("/mcl/config").then(function(r7) {
        pMcl.textContent = "";
        var cur = r7.persisted || {};
        var run = r7.running || {};
        var c5 = UI.card("\u8BA4\u77E5\u73AF\uFF08MCL\uFF09\u65CB\u94AE", { desc: "\u767D\u540D\u5355\u8865\u4E01\u5199 `scheduler.json`\uFF1B**\u91CD\u8F7D\u540E\u751F\u6548**\u3002\u5F53\u524D\u8FD0\u884C\u6001\uFF1A" + (r7.active ? "\u5DF2\u88C5\u914D" : "\u672A\u88C5\u914D") });
        pMcl.appendChild(c5.box);
        c5.body.appendChild(UI.kv([
          ["\u8FD0\u884C\u6001\u901A\u9053\u8BA1\u6570", "steps=" + String(run.steps || 0) + " \xB7 slow=" + String(run.slow || 0) + " \xB7 injected=" + String(run.injected || 0)],
          ["\u6750\u6599\u53BB\u5411", (cur.mclMaterialInSystem ? "systemPrompt \u6BB5\uFF08P2b \u5F00\uFF09" : "\u6D88\u606F\u9762") + "\uFF08\u6309\u6301\u4E45\u914D\u7F6E\uFF09"],
          ["\u6750\u6599\u9001\u8FBE\u8BA1\u6570", "sysBlockNonEmpty=" + String(run.sysBlockNonEmpty || 0) + " \xB7 \u672B\u6B21 " + String(run.sysBlockLastChars || 0) + " \u5B57\u7B26"]
        ]));
        var save = function(key, val) {
          var patch = {};
          patch[key] = val;
          appState.api("/mcl/config", { method: "POST", body: JSON.stringify(patch) }).then(function() {
            appState.statusFn("\u2713 " + key + " = " + val + "\uFF08\u5DF2\u5199\u5165 scheduler.json\uFF0C\u91CD\u8F7D\u540E\u751F\u6548\uFF09");
            renderMclKnobs();
          }).catch(appState.failFn);
        };
        var lim = r7.limits || {};
        var defs = lim.defaults || {};
        c5.body.appendChild(UI.item(
          "\u719F\u6089\u5EA6\u9608\u503C mclFamiliarThreshold",
          "\u7EDD\u5BF9\u4F59\u5F26\u53E3\u5F84\uFF1B\u2265 \u9608\u503C\u4E14\u547D\u4E2D\u9AD8\u7F6E\u4FE1\u6807\u7B7E\u624D\u8D70\u5FEB\u901A\u9053\uFF08\u7F3A\u7701 " + String(defs.familiarThreshold) + "\uFF09\u3002\u6570\u636E\u63D0\u793A\uFF1A\u672C\u5E93 936 \u6B65\u5B9E\u6D4B 86% \u7684\u6B65**\u65E0\u53EC\u56DE\u547D\u4E2D**\u2014\u2014\u5148\u67E5\u53EC\u56DE\uFF0C\u518D\u8C03\u6B64\u503C\u3002",
          UI.input(cur.mclFamiliarThreshold != null ? cur.mclFamiliarThreshold : defs.familiarThreshold, function(v2) {
            var n6 = parseFloat(v2);
            if (!isNaN(n6)) save("mclFamiliarThreshold", n6);
          }, { type: "number", width: "120px", ariaLabel: "\u719F\u6089\u5EA6\u9608\u503C" }),
          {}
        ));
        c5.body.appendChild(UI.item(
          "\u518D\u5F15\u5BFC\u4E0A\u9650 mclMaxNudges",
          "\u6162\u901A\u9053\u672A\u5F15\u7528\u6750\u6599\u65F6\u7684\u518D\u5F15\u5BFC\u6B21\u6570\uFF080 = \u53EA\u6CE8\u5165\u4E0D\u5F15\u5BFC\uFF1B\u7F3A\u7701 " + String(defs.maxNudges) + "\uFF09",
          UI.input(cur.mclMaxNudges != null ? cur.mclMaxNudges : defs.maxNudges, function(v2) {
            var n6 = parseInt(v2, 10);
            if (!isNaN(n6)) save("mclMaxNudges", n6);
          }, { type: "number", width: "120px", ariaLabel: "\u518D\u5F15\u5BFC\u4E0A\u9650" }),
          {}
        ));
        c5.body.appendChild(UI.item(
          "\u6750\u6599\u9884\u7B97 mclBudgetChars",
          "\u6162\u901A\u9053\u6750\u6599\u786C\u9884\u7B97\uFF08\u5B57\u7B26\uFF1B\u7F3A\u7701 " + String(defs.budgetChars) + "\uFF09",
          UI.input(cur.mclBudgetChars != null ? cur.mclBudgetChars : defs.budgetChars, function(v2) {
            var n6 = parseInt(v2, 10);
            if (!isNaN(n6)) save("mclBudgetChars", n6);
          }, { type: "number", width: "140px", ariaLabel: "\u6750\u6599\u9884\u7B97" }),
          {}
        ));
        c5.body.appendChild(UI.item(
          "\u6307\u9488\u6761\u6570 mclTopK",
          "\u6162\u901A\u9053\u6CE8\u5165\u7684\u6307\u9488\u6761\u6570\uFF08\u7F3A\u7701 " + String(defs.topK) + "\uFF09",
          UI.input(cur.mclTopK != null ? cur.mclTopK : defs.topK, function(v2) {
            var n6 = parseInt(v2, 10);
            if (!isNaN(n6)) save("mclTopK", n6);
          }, { type: "number", width: "120px", ariaLabel: "\u6307\u9488\u6761\u6570" }),
          {}
        ));
        c5.body.appendChild(UI.item(
          "\u6750\u6599\u5165 systemPrompt \u6BB5\uFF08P2b\uFF09",
          "\u5F00 = \u6750\u6599\u6302\u6CE8\u5165\u9762\u3001\u4E0D\u8FDB\u8F6C\u5F55\uFF08\u5B9E\u6D4B `sysBlockNonEmpty` \u4F1A\u6DA8\uFF09\uFF1B\u5173 = \u8D70\u6D88\u606F\u9762\uFF08\u9001\u8FBE\u6709\u636E\uFF09",
          UI.toggle(cur.mclMaterialInSystem === true, function(v2) {
            save("mclMaterialInSystem", v2);
          }),
          {}
        ));
        c5.body.appendChild(UI.item(
          "\u8BA4\u77E5\u73AF\u5F00\u5173 mclEnabled",
          "\u4E00\u952E\u56DE\u6EDA\u5F00\u5173",
          UI.toggle(cur.mclEnabled !== false, function(v2) {
            save("mclEnabled", v2);
          }),
          {}
        ));
        c5.body.appendChild(UI.item(
          "\u5BA1\u8BA1\u6D41 mclAudit",
          "\u5199\u7EDF\u4E00\u53F0\u8D26\uFF08type=mcl*\uFF09",
          UI.toggle(cur.mclAudit !== false, function(v2) {
            save("mclAudit", v2);
          }),
          {}
        ));
        c5.body.appendChild(UI.item(
          "REM \u76F8 enableRemPass",
          "\u6DF1\u7761\u540C pass \u5185\u505A\u8DE8\u4E3B\u9898\u8054\u60F3\uFF08\u7F3A\u7701\u5173\uFF1B\u4EA7\u7269\u4F1A\u5E76\u5165\u753B\u50CF\uFF0C\u566A\u58F0\u4EE3\u4EF7\u9AD8\uFF09",
          UI.toggle(cur.enableRemPass === true, function(v2) {
            save("enableRemPass", v2);
          }),
          {}
        ));
        c5.body.appendChild(el("div", "sc-desc", "\u63A2\u9488\uFF08\u5B9A\u4F4D P2b \u7528\uFF09\uFF1A\u5BBF\u4E3B\u4F20\u5165 context \u952E = " + String(run.sysBlockCtxKeys || "\u2014") + " \xB7 \u89E3\u6790\u51FA\u7684\u4F1A\u8BDD = " + String(run.sysBlockLastSid || "\u2014")));
        if (run.trace && run.trace.length) {
          c5.body.appendChild(el("div", "sc-sub", "\u65F6\u5E8F\u8F68\u8FF9\uFF08cap \u6355\u83B7 \xB7 set \u5199\u6750\u6599 \xB7 ren \u6E32\u67D3\uFF09"));
          renderFacts(c5.body, run.trace, 1);
        }
        rawDetails(c5.body, r7);
      }).catch(appState.failFn);
    }
    renderMclKnobs();
  }

  // src-client/panes-observe.js
  function renderViewObserve(view) {
    view.textContent = "";
    var logsAll = Store.get("logs") || [];
    UI.pageHead("\u8FD0\u884C\u89C2\u6D4B", "\u6267\u884C\u8FDB\u5EA6\u3001\u8C03\u7528\u65E5\u5FD7\u3001\u9519\u8BEF\u5B9A\u4F4D\u4E0E\u5173\u952E\u6307\u6807\u3002\u65E5\u5FD7\u4FDD\u7559\u6700\u8FD1 500 \u6761\uFF0C\u9519\u8BEF\u5E26\u7AEF\u70B9/\u53C2\u6570/\u5806\u6808\uFF0C\u4FBF\u4E8E\u5B9A\u4F4D\u800C\u975E\u53EA\u5269\u4E00\u884C\u63D0\u793A\u3002", {
      routes: ["/cognition/report", "/selfcheck", "/reconcile", "/embed/test"],
      refresh: true,
      actions: [
        UI.button("\u5BFC\u51FA", function() {
          var blob = new Blob([JSON.stringify({ logs: logsAll, errors: Store.get("errors") || [], metrics: Store.get("metrics") || {} }, null, 2)], { type: "application/json" });
          var a4 = document.createElement("a");
          a4.href = URL.createObjectURL(blob);
          a4.download = "shoucang-observe-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "") + ".json";
          a4.click();
          URL.revokeObjectURL(a4.href);
          appState.statusFn("\u2713 \u89C2\u6D4B\u6570\u636E\u5DF2\u5BFC\u51FA\uFF08" + logsAll.length + " \u6761\u65E5\u5FD7\uFF09");
        }, { title: "\u4E0B\u8F7D\u5F53\u524D\u65E5\u5FD7/\u9519\u8BEF/\u6307\u6807\uFF08JSON\uFF09" }),
        UI.button("\u6E05\u7A7A\u65E5\u5FD7", function() {
          Store.set("logs", []);
          Store.set("errors", []);
          appState.refreshView();
          appState.statusFn("\u5DF2\u6E05\u7A7A\u65E5\u5FD7\u4E0E\u9519\u8BEF\u8BB0\u5F55");
        }, { danger: true, confirm: "\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8\u65E5\u5FD7\u4E0E\u9519\u8BEF\u8BB0\u5F55\uFF1F" })
      ]
    });
    (function() {
      var msList = [];
      var failCount = 0;
      logsAll.forEach(function(l6) {
        var msg = String(l6 && l6.message || "");
        var mt = /(\d+(?:\.\d+)?)\s*ms/.exec(msg);
        if (mt) msList.push(parseFloat(mt[1]));
        if (/✗|error|失败/.test(msg)) failCount++;
      });
      var errCount = Derive.count(Store.get("errors"));
      var total = logsAll.length;
      var okCount = Math.max(0, total - failCount);
      var avgMs = msList.length ? Math.round(msList.reduce(function(a4, b3) {
        return a4 + b3;
      }, 0) / msList.length) : 0;
      var okPct = total ? Math.round(okCount / total * 100) : null;
      var grid2 = el("div", "sc-kpis");
      grid2.appendChild(UI.kpi("\u8BF7\u6C42\u603B\u6570", { val: Derive.num(total), sub: "\u672C\u5730\u4FDD\u7559\uFF08\u4E0A\u9650 500 \u6761\uFF09", plain: true }).box);
      grid2.appendChild(UI.kpi("\u6210\u529F\u7387", { val: total ? Math.round(okCount / total * 1e3) / 10 + "%" : "\u2014", sub: "\u975E\u5931\u8D25\u8BF7\u6C42\u5360\u6BD4", plain: true }).box);
      grid2.appendChild(UI.kpi("\u5E73\u5747\u8017\u65F6", { val: avgMs + "ms", sub: msList.length ? "\u6309 " + msList.length + " \u6761\u5E26\u8017\u65F6\u8BB0\u5F55\u5747\u7B97" : "\u6682\u65E0\u5E26\u8017\u65F6\u7684\u8BB0\u5F55", plain: true }).box);
      grid2.appendChild(UI.kpi("\u9519\u8BEF", { val: Derive.num(errCount), sub: errCount ? "\u89C1\u4E0B\u65B9\u300C\u9519\u8BEF\u5B9A\u4F4D\u300D" : "\u65E0\u8BB0\u5F55", plain: true }).box);
      view.appendChild(grid2);
    })();
    var pc = UI.card("\u6267\u884C\u8FDB\u5EA6", { sub: "\u672C\u6B21\u4F1A\u8BDD\u7684\u6DF1\u7761 / \u84B8\u998F\u8FDB\u5EA6", right: [el("span", "sc-src", "/cognition/report")] });
    var p4 = Store.get("progress") || {};
    var ids = Object.keys(p4);
    if (!Derive.has(ids)) pc.body.appendChild(el("div", "sc-desc", "\u5F53\u524D\u65E0\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1\u3002"));
    else ids.forEach(function(id3) {
      pc.body.appendChild(UI.progress(id3));
    });
    view.appendChild(pc.box);
    var obLogs = el("div");
    var obErrs = el("div");
    var obOps = el("div");
    var obMetrics = el("div");
    var _ob = UI.tabs("observe", [
      { id: "logs", label: "\u8C03\u7528\u65E5\u5FD7 " + Derive.count(Store.get("logs")), pane: obLogs },
      { id: "errors", label: "\u9519\u8BEF\u5B9A\u4F4D " + Derive.count(Store.get("errors")), pane: obErrs },
      { id: "ops", label: "\u8FD0\u7EF4\u64CD\u4F5C", pane: obOps },
      { id: "metrics", label: "\u5173\u952E\u6307\u6807", pane: obMetrics }
    ]);
    view.appendChild(_ob.box);
    var errs = Store.get("errors") || [];
    var ebox = el("div");
    if (!Derive.has(errs)) ebox.appendChild(el("div", "sc-desc", "\u6682\u65E0\u9519\u8BEF\u3002"));
    else {
      var list = el("div");
      errs.slice().reverse().slice(0, 30).forEach(function(r7) {
        var ctx = r7.ctx;
        var where = ctx ? (ctx.method || "") + " " + (ctx.path || "") + (ctx.params ? " " + JSON.stringify(ctx.params) : "") : "\u2014";
        list.appendChild(UI.collapsible(
          new Date(r7.t).toLocaleTimeString() + "  " + r7.message,
          UI.kv([["\u7AEF\u70B9", where], ["\u5806\u6808", r7.stack || "\u2014"]]),
          {}
        ));
      });
      ebox.appendChild(list);
      ebox.appendChild(UI.button("\u6E05\u7A7A\u9519\u8BEF", function() {
        Store.set("errors", []);
        appState.refreshView();
      }, { danger: true, confirm: "\u786E\u8BA4\u6E05\u7A7A\u9519\u8BEF\u8BB0\u5F55\uFF1F" }));
    }
    obErrs.appendChild(ebox);
    var mbox = el("div");
    var m3 = Store.get("metrics") || {};
    var mk = Object.keys(m3);
    if (!Derive.has(mk)) mbox.appendChild(el("div", "sc-desc", "\u6682\u65E0\u6307\u6807\uFF08\u5207\u6362\u5404\u89C6\u56FE\u4F1A\u81EA\u52A8\u91C7\u96C6\uFF09\u3002"));
    else mbox.appendChild(UI.kv(mk.map(function(k2) {
      return [k2, String(m3[k2])];
    })));
    obMetrics.appendChild(mbox);
    appState.renderRunExtras(obMetrics);
    obLogs.appendChild(buildLogPanel(400));
    var ops = el("div");
    var embedRes = el("div", "sc-desc", "\u672A\u6D4B\u8BD5");
    ops.appendChild(UI.item(
      "\u5D4C\u5165\u670D\u52A1\u8FDE\u901A\u6027",
      "POST /embed/test \u2014\u2014 \u9A8C\u8BC1\u5F53\u524D embedding \u914D\u7F6E\u662F\u5426\u53EF\u7528\uFF08\u914D\u5B8C\u5373\u53EF\u9A8C\u8BC1\uFF0C\u4E0D\u5FC5\u7B49\u5B9E\u9645\u8C03\u7528\u5931\u8D25\uFF09\u3002",
      UI.button("\u6D4B\u8BD5\u8FDE\u63A5", function() {
        embedRes.textContent = "\u8BFB\u53D6\u914D\u7F6E\u2026";
        return appState.api("/embed/config").then(function(c5) {
          var g2 = c5 && c5.global || {};
          var baseUrl = String(g2.embedBaseUrl || "").trim();
          if (!baseUrl) {
            embedRes.textContent = "\u2717 \u672A\u914D\u7F6E embedBaseUrl\uFF0C\u8BF7\u5148\u5230\u300C\u53C2\u6570\u8C03\u8282\u300D\u586B\u5199\u3002";
            return;
          }
          embedRes.textContent = "\u6D4B\u8BD5\u4E2D\u2026 " + baseUrl;
          return appState.apiCtx("/embed/test", {
            method: "POST",
            body: JSON.stringify({ baseUrl, apiKey: String(g2.embedApiKey || "").trim() })
          }, "\u5D4C\u5165\u8FDE\u901A\u6027").then(function(r7) {
            var n6 = Derive.count(r7 && r7.models);
            embedRes.textContent = r7 && r7.error ? "\u2717 " + r7.error : "\u2713 \u53EF\u8FBE \xB7 " + n6 + " \u4E2A\u6A21\u578B";
            Log.info("\u5D4C\u5165\u670D\u52A1\u8FDE\u901A\u6027\u6D4B\u8BD5" + (r7 && r7.error ? "\u5931\u8D25\uFF1A" + r7.error : "\u901A\u8FC7"));
          });
        }).catch(function(e8) {
          embedRes.textContent = "\u2717 " + e8.message;
        });
      }, { async: true, busyText: "\u6D4B\u8BD5\u4E2D\u2026", okText: "\u5D4C\u5165\u8FDE\u901A\u6027\u6D4B\u8BD5\u5B8C\u6210" }),
      {}
    ));
    ops.appendChild(embedRes);
    var bootRes = el("div", "sc-desc", "\u672A\u6267\u884C");
    ops.appendChild(UI.item(
      "\u6839\u76EE\u5F55\u5F15\u5BFC",
      "POST /root/bootstrap \u2014\u2014 \u521D\u59CB\u5316/\u4FEE\u590D\u8BB0\u5FC6\u6839\u76EE\u5F55\u7ED3\u6784\u3002",
      UI.button("\u6267\u884C\u5F15\u5BFC", function() {
        bootRes.textContent = "\u6267\u884C\u4E2D\u2026";
        return appState.apiCtx("/root/bootstrap", { method: "POST", body: JSON.stringify({}) }, "\u6839\u76EE\u5F55\u5F15\u5BFC").then(function(r7) {
          bootRes.textContent = "\u2713 " + JSON.stringify(r7).slice(0, 240);
        }).catch(function(e8) {
          bootRes.textContent = "\u2717 " + e8.message;
        });
      }, { async: true, busyText: "\u6267\u884C\u4E2D\u2026", confirm: "\u6267\u884C\u6839\u76EE\u5F55\u5F15\u5BFC\u4F1A\u5C1D\u8BD5\u521B\u5EFA\u7F3A\u5931\u7684\u76EE\u5F55\u7ED3\u6784\uFF0C\u786E\u8BA4\u7EE7\u7EED\uFF1F" }),
      {}
    ));
    ops.appendChild(bootRes);
    obOps.appendChild(ops);
    var adv = el("div");
    adv.appendChild(el("div", "sc-desc", "\u26A0 \u884C\u7EA7\u76F4\u63A5\u6539\u5199\u8BB0\u5FC6\u6587\u4EF6\u3002\u6539\u7D22\u5F15\u884C\u53EF\u80FD\u5BFC\u81F4\u6307\u9488\u4E0E notes \u6B63\u6587\u4E0D\u4E00\u81F4\uFF08\u8BE6\u89C1 R3\uFF09\uFF0C\u5E38\u89C4\u7F16\u8F91\u8BF7\u7528\u300C\u8BB0\u5FC6\u677F\u5757 \u2192 \u5C0F\u8282\u7F16\u8F91\u300D\u3002"));
    var fInp = UI.input("MEMORY.md", null, { placeholder: "\u6587\u4EF6\uFF0C\u5982 MEMORY.md / notes/lessons.md", width: "260px", ariaLabel: "\u8BB0\u5FC6\u6587\u4EF6" });
    var lInp = UI.input("", null, { placeholder: "\u5F85\u5339\u914D\u7684\u539F\u59CB\u884C\u6587\u672C", width: "320px", ariaLabel: "\u539F\u59CB\u884C" });
    var nInp = UI.input("", null, { placeholder: "\u65B0\u884C\u6587\u672C\uFF08\u4EC5\u7F16\u8F91\u9700\u8981\uFF09", width: "320px", ariaLabel: "\u65B0\u884C" });
    adv.appendChild(UI.item("\u76EE\u6807\u6587\u4EF6", "isWritable \u767D\u540D\u5355\u5185\u7684\u8BB0\u5FC6\u6587\u4EF6\u3002", fInp, {}));
    adv.appendChild(UI.item("\u539F\u59CB\u884C", "\u5FC5\u987B\u4E0E\u539F\u6587\u4EF6\u4E2D\u7684\u4E00\u884C\u5B8C\u5168\u4E00\u81F4\uFF08\u540E\u7AEF\u6309\u884C\u5339\u914D\uFF09\u3002", lInp, {}));
    adv.appendChild(UI.item("\u65B0\u884C\u6587\u672C", "\u7F16\u8F91\u65F6\u5FC5\u586B\uFF1B\u5220\u9664\u65F6\u5FFD\u7565\u3002", nInp, {}));
    var advRes = el("div", "sc-desc", "\u672A\u6267\u884C");
    var row = el("div", "sc-toolbar");
    row.appendChild(UI.button("\u6309\u884C\u7F16\u8F91", function() {
      var file = fInp.value.trim(), line = lInp.value.trim(), nt = nInp.value.trim();
      if (!file || !line || !nt) {
        advRes.textContent = "\u2717 \u6587\u4EF6 / \u539F\u59CB\u884C / \u65B0\u884C \u4E09\u9879\u5747\u5FC5\u586B";
        return;
      }
      return appState.apiCtx("/memory/edit", { method: "POST", body: JSON.stringify({ file, line, newText: nt }) }, "\u884C\u7EA7\u7F16\u8F91").then(function() {
        advRes.textContent = "\u2713 \u5DF2\u6539\u5199\u8BE5\u884C";
        Log.warn("\u884C\u7EA7\u7F16\u8F91\u5DF2\u6267\u884C\uFF08\u53EF\u80FD\u9700\u540C\u6B65\u7D22\u5F15\uFF09\uFF1A" + file);
      }).catch(function(e8) {
        advRes.textContent = "\u2717 " + e8.message;
      });
    }, { async: true, busyText: "\u63D0\u4EA4\u4E2D\u2026" }));
    row.appendChild(UI.button("\u6309\u884C\u5220\u9664", function() {
      var file = fInp.value.trim(), line = lInp.value.trim();
      if (!file || !line) {
        advRes.textContent = "\u2717 \u6587\u4EF6\u4E0E\u539F\u59CB\u884C\u5FC5\u586B";
        return;
      }
      if (!confirm("\u786E\u8BA4\u5220\u9664\u8BE5\u884C\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF08\u4F1A\u7531\u5199\u95E8\u5907\u4EFD\uFF09\u3002\n\n" + line)) return;
      return appState.apiCtx("/memory/remove", { method: "POST", body: JSON.stringify({ file, line }) }, "\u884C\u7EA7\u5220\u9664").then(function() {
        advRes.textContent = "\u2713 \u5DF2\u5220\u9664\u8BE5\u884C";
        Log.warn("\u884C\u7EA7\u5220\u9664\u5DF2\u6267\u884C\uFF08\u53EF\u80FD\u9700\u540C\u6B65\u7D22\u5F15\uFF09\uFF1A" + file);
      }).catch(function(e8) {
        advRes.textContent = "\u2717 " + e8.message;
      });
    }, { async: true, busyText: "\u63D0\u4EA4\u4E2D\u2026", danger: true, confirm: "\u786E\u8BA4\u6267\u884C\u884C\u7EA7\u5220\u9664\uFF1F" }));
    adv.appendChild(row);
    adv.appendChild(advRes);
    obOps.appendChild(UI.collapsible("\u9AD8\u7EA7\uFF1A\u884C\u7EA7\u7F16\u8F91 / \u5220\u9664\uFF08\u8C28\u614E\uFF09", adv, { open: false }));
  }
  function buildLogPanel(maxH, opts) {
    var o9 = opts || {};
    var wrap = el("div", "sc-logwrap");
    if (maxH) wrap.style.setProperty("--sc-log-h", maxH + "px");
    if (o9.collapsed) wrap.classList.add("sc-log-collapsed");
    var head = el("div", "sc-log-head");
    var arrow = el("span", "sc-sec-arrow", o9.collapsed ? "\u25B8" : "\u25BE");
    if (o9.collapsible) {
      head.classList.add("sc-log-toggle");
      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");
      head.setAttribute("aria-expanded", o9.collapsed ? "false" : "true");
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
    head.appendChild(el("span", null, "\u65E5\u5FD7"));
    var lvSel = UI.select(
      [{ value: "info", label: "\u5168\u90E8" }, { value: "warn", label: "\u8B66\u544A+" }, { value: "error", label: "\u4EC5\u9519\u8BEF" }],
      Cfg.get("logLevel", "info"),
      function(v2) {
        Cfg.set("logLevel", v2);
        render();
      }
    );
    lvSel.setAttribute("aria-label", "\u65E5\u5FD7\u7EA7\u522B");
    head.appendChild(lvSel);
    var cnt = el("span", null, "");
    head.appendChild(cnt);
    head.appendChild(el("span", "sc-spacer"));
    head.appendChild(UI.button("\u6E05\u7A7A", function() {
      Log.clear();
      render();
    }));
    wrap.appendChild(head);
    var body = el("div");
    wrap.appendChild(body);
    var ORDER = { info: 0, warn: 1, error: 2 };
    function render() {
      var min = ORDER[Cfg.get("logLevel", "info")] || 0;
      var all = (Store.get("logs") || []).filter(function(l6) {
        return (ORDER[l6.level] || 0) >= min;
      });
      cnt.textContent = all.length + " \u6761";
      body.textContent = "";
      if (!Derive.has(all)) {
        body.appendChild(el("div", "sc-log-row", "\uFF08\u65E0\uFF09"));
        return;
      }
      var LVICON = { info: "\xB7", warn: "!", error: "\u2717" };
      all.slice(-200).reverse().forEach(function(l6) {
        var row = el("div", "sc-log-row sc-log-" + l6.level);
        var c5 = l6.ctx || {};
        row.appendChild(el("span", "sc-log-lv", LVICON[l6.level] || "\xB7"));
        if (c5.path) {
          row.appendChild(el("span", "sc-log-m", c5.method || "GET"));
          row.appendChild(el("span", "sc-log-p", String(c5.path)));
          if (c5.ms !== void 0) row.appendChild(el("span", "sc-log-ms", c5.ms + "ms"));
          if (c5.status !== void 0) row.appendChild(el("span", "sc-log-st", String(c5.status)));
        } else {
          row.appendChild(el("span", "sc-log-msg", l6.msg));
        }
        row.appendChild(el("span", "sc-spacer"));
        row.appendChild(el("span", "sc-log-t", new Date(l6.t).toLocaleTimeString()));
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
    var group2 = function(t6) {
      var c5 = UI.card(t6);
      gRoot.appendChild(c5.box);
      gHost = c5.body;
      return c5.body;
    };
    var mk = function(label, value, sub) {
      var card = el("div", "sc-mem-stat");
      card.appendChild(el("div", "sc-mem-stat-label", label));
      card.appendChild(el("div", "sc-mem-stat-value", value));
      if (sub) card.appendChild(el("div", "sc-mem-stat-sub", sub));
      return card;
    };
    group2("\u8D26\u672C\u5BF9\u8D26\u4E0E\u4EA7\u51FA\u5065\u5EB7\uFF08v2.1 M3\uFF09");
    var rw = el("div", "sc-mem-stats");
    rw.appendChild(mk("\u5BF9\u8D26", "\u2026", "\u8BFB\u53D6\u4E2D"));
    gHost.appendChild(rw);
    appState.api("/reconcile").then(function(r7) {
      rw.textContent = "";
      if (!r7 || !r7.active) {
        rw.appendChild(mk("\u5BF9\u8D26", "\u672A\u5C31\u7EEA", r7 && r7.error || "memory-reconcile.mjs \u672A\u90E8\u7F72"));
        return;
      }
      var cl = r7.closure || {};
      var h3 = r7.health || {};
      var ly = (r7.layers || {}).counts || {};
      var P2 = ly.P || { index: 0, profile: 0 }, R2 = ly.R || { index: 0, profile: 0 }, E2 = ly.E || { index: 0, profile: 0 };
      rw.appendChild(mk("\u8D26\u672C\u95ED\u5408", cl.ok === null ? "\u6837\u672C\u4E0D\u8DB3" : cl.ok ? "\u2705 \u5DEE\u5F02 0" : "\u26A0 \u6709\u5DEE\u5F02", "\u53F0\u8D26 " + ((r7.window || {}).ledgerRows || 0) + " \u884C \xB7 \u5199\u4E8B\u4EF6 " + (h3.writeEvents || 0) + " \u6B21"));
      rw.appendChild(mk("\u4E0A\u6B21\u6709\u6548\u6DF1\u7761", h3.lastSuccessfulWrite ? fmtTime(h3.lastSuccessfulWrite) : "\uFF08\u65E0\uFF09", "\u8FDE\u7EED\u7A7A\u8F6C " + (h3.idleStreak || 0) + " \u8F6E \xB7 \u6DF1\u7761\u8F6E\u6B21 " + (h3.deepSleepRounds || 0)));
      rw.appendChild(mk("\u5199\u5165\u88AB\u62D2\u7387", h3.rejectRate === null || h3.rejectRate === void 0 ? "n/a" : (h3.rejectRate * 100).toFixed(0) + "%", "\u62D2 " + (h3.rejectedWrites || 0) + " / \u5199\u4E8B\u4EF6 " + (h3.writeEvents || 0) + " \xB7 \u5C1D\u8BD5 " + (h3.attemptedTotal || 0) + " \u6761"));
      rw.appendChild(mk("\u4E09\u5C42\u5360\u6BD4", "P " + (P2.index + P2.profile) + " \xB7 R " + R2.index + " \xB7 E " + (E2.index + E2.profile), "P=\u6052\u5E38\uFF08\u7D22\u5F15+P \u5C42\u753B\u50CF\u884C \u2264" + ((r7.layers || {}).profileCap || 3) + "/\u6863\uFF09\xB7 R=\u4EFB\u52A1\u95E8\u63A7 \xB7 E=\u76F8\u5173\u6027\u95E8\u63A7"));
    }).catch(function() {
      rw.textContent = "";
      rw.appendChild(mk("\u5BF9\u8D26", "\u8BFB\u53D6\u5931\u8D25", "/reconcile"));
    });
  }

  // src-client/panes-suite.js
  function renderSuite(view, data) {
    view.textContent = "";
    UI.pageHead("\u63D2\u4EF6\u96C6\u5408", "suite \u88C5\u914D\u77E9\u9635\u7531 targets.ts \u7684 suiteAssemblyMatrix() \u5355\u4E00\u5B9E\u73B0\uFF1B\u9762\u677F\u4E0E scheduler \u5171\u7528\u3002", {
      routes: ["/suite"],
      routesInline: true,
      actions: [UI.button("\u91CD\u65B0\u88C5\u914D", function() {
        appState.refreshView();
        appState.statusFn("\u5DF2\u6309\u6CE8\u5165\u5668 registry + profiles \u91CD\u65B0\u6838\u88C5\u914D");
      }, { title: "\u91CD\u53D6\u88C5\u914D\u77E9\u9635\uFF08/suite\uFF09" })]
    });
    var members = data && data.members || [];
    var grid = el("div", "sc-pgrid");
    var iconOf = function(m3) {
      var k2 = String(m3 && (m3.id || m3.package) || "").toLowerCase();
      if (k2.indexOf("memory") >= 0 || k2.indexOf("skill") >= 0) return "vault";
      if (k2.indexOf("core") >= 0) return "persona";
      if (k2.indexOf("sched") >= 0) return "sleep";
      if (k2.indexOf("panel") >= 0) return "overview";
      return "suite";
    };
    members.forEach(function(m3) {
      var st = Derive.suiteStatus(m3.status);
      var c5 = el("div", "sc-pcard");
      var ph = el("div", "ph");
      var ic = el("span", "ic");
      ic.appendChild(svg(ICONS2[iconOf(m3)] || ICONS2.suite));
      ph.appendChild(ic);
      ph.appendChild(el("b", null, String(m3.id || m3.name || m3.package || "?")));
      c5.appendChild(ph);
      c5.appendChild(el("div", "pd", String(m3.role || m3.desc || m3.description || m3.detail || "\u2014")));
      var meta = el("div", "pmeta");
      meta.appendChild(el("span", null, String(m3.repo || m3.package || "")));
      var stSpan = el("span", null, st.text);
      if (st.tip) stSpan.title = st.tip;
      meta.appendChild(stSpan);
      c5.appendChild(meta);
      grid.appendChild(c5);
    });
    var add = el("div", "sc-pcard is-add");
    var aph = el("div", "ph");
    var aic = el("span", "ic");
    aic.appendChild(svg(ICONS2.suite));
    aph.appendChild(aic);
    aph.appendChild(el("b", null, "\u6DFB\u52A0\u76EE\u6807\u5E93"));
    add.appendChild(aph);
    add.appendChild(el("div", "pd", "\u9700\u5728\u767D\u540D\u5355\u5185\u767B\u8BB0\uFF08target-registry / members \u914D\u7F6E\uFF09"));
    grid.appendChild(add);
    view.appendChild(grid);
    var mtx = UI.card("suite \u88C5\u914D\u77E9\u9635", { sub: "\u5355\u4E00\u5B9E\u73B0\uFF1Atargets.ts \xB7 suiteAssemblyMatrix()", right: [el("span", "sc-src", "GET /suite")] });
    view.appendChild(mtx.box);
    var tbl = el("table", "sc-table");
    var thead = el("thead");
    var htr = el("tr");
    ["\u76EE\u6807\u5E93", "\u5BB9\u91CF", "\u5DF2\u7528", "\u88C5\u914D\u5185\u5BB9", "\u72B6\u6001"].forEach(function(h3) {
      htr.appendChild(el("th", null, h3));
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el("tbody");
    tbl.appendChild(tbody);
    mtx.body.appendChild(tbl);
    var CONTENT = { "MEMORY.md": "\u539F\u5219 + \u8DEF\u5F84", "USER.md": "\u753B\u50CF + \u504F\u597D", "AGENT.md": "\u7ECF\u9A8C + \u53CD\u4F8B" };
    var pill = function(ok, text) {
      return el("span", "pill" + (ok ? " ok" : " warn"), text);
    };
    var addRow = function(name, used, content, ok) {
      var tr = el("tr");
      tr.appendChild(el("td", "tgt", name));
      tr.appendChild(el("td", "num", "\u4E0D\u9650"));
      tr.appendChild(el("td", "num", used));
      tr.appendChild(el("td", null, content));
      var td = el("td");
      td.appendChild(pill(ok !== false, ok === false ? "\u6C34\u4F4D\u504F\u9AD8" : "\u6B63\u5E38"));
      tr.appendChild(td);
      tbody.appendChild(tr);
    };
    var fill = function(idx) {
      tbody.textContent = "";
      if (!Derive.has(idx)) {
        tbody.appendChild(el("tr", null, "\uFF08\u65E0\u5BB9\u91CF\u6CE8\u518C\u8868\u6570\u636E\uFF09"));
        return;
      }
      idx.forEach(function(f3) {
        var pct = f3.cap ? Math.round((f3.chars || 0) / f3.cap * 100) : null;
        var kind = pct === null ? "ended" : Derive.capKind(pct);
        var tr = el("tr");
        tr.appendChild(el("td", "tgt", String(f3.name || "").replace(/\.md$/i, "")));
        tr.appendChild(el("td", "num", f3.cap ? Derive.num(f3.cap) : "\u4E0D\u9650"));
        tr.appendChild(el("td", "num", Derive.num(f3.chars || 0)));
        tr.appendChild(el("td", null, CONTENT[f3.name] || "\u2014"));
        var td = el("td");
        td.appendChild(pill(kind === "ended", kind === "ended" ? "\u6B63\u5E38" : kind === "stalled" ? "\u8D85\u9608" : "\u6C34\u4F4D\u504F\u9AD8"));
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
    };
    fill(data && data.indexes || null);
    if (data && data.summary) mtx.body.appendChild(el("div", "sc-note", String(data.summary)));
    appState.api("/memory/overview").then(function(r7) {
      fill(r7 && r7.indexes || null);
      var n6 = Derive.count(r7 && r7.notes);
      if (n6) addRow("notes/", n6 + " \u6761", "\u4FBF\u7B7E", true);
    }).catch(function() {
    });
    appState.api("/cognition/report").then(function(r7) {
      var ar = r7 && r7.archive || [];
      if (!r7 || !r7.ok || !Derive.has(ar)) return;
      addRow("archive/", ar.length + " \u6761", "\u5F52\u6863", true);
    }).catch(function() {
    });
  }
  function renderDeepSleep(view) {
    view.textContent = "";
    UI.pageHead("\u6DF1\u5EA6\u7761\u7720 \xB7 \u4F1A\u8BDD\u72B6\u6001\u673A", "\u5168\u90E8\u6839\u4F1A\u8BDD\u505C\u6EDE \u2265 \u9608\u503C\u540E\u81EA\u52A8\u56DE\u60F3\u5F53\u5929\u8BB0\u5FC6\u3001\u63D0\u70BC\u539F\u5219\u5C42 PRINCIPLES.md\u3002\u72B6\u6001\u673A\u533A\u5206\u300C\u6B63\u5E38\u957F\u4EFB\u52A1 / \u5361\u4F4F / \u5F02\u5E38\u9000\u51FA\u300D\uFF1A\u4EC5\u957F\u4EFB\u52A1\u6B63\u5728\u63A8\u8FDB\u624D\u62E6\u7761\uFF0C\u5176\u4F59\u6B63\u5E38\u7761\u3002", { routes: ["/deepsleep", "/deepsleep/trigger", "/deepsleep/config"] });
    var smSlot = el("div");
    view.appendChild(smSlot);
    var distSlot = el("div");
    view.appendChild(distSlot);
    var cogSlot = el("div", "sc-stack");
    view.appendChild(cogSlot);
    appState.api("/deepsleep").then(function(r7) {
      if (!r7.active) {
        view.appendChild(el("div", "sc-desc", "\u6DF1\u5EA6\u7761\u7720\u5F52\u7EB3\u5668\u5F53\u524D\u672A\u6FC0\u6D3B\uFF08\u84B8\u998F\u5668 enableDistill \u672A\u542F\u7528\u6216\u5C1A\u672A\u5C31\u7EEA\uFF09\u3002"));
        return;
      }
      (function() {
        var now = Date.now();
        var idleMs = Number(r7.idleMs) || 0;
        var probeMs = Number(r7.probeAfterMs) || idleMs;
        var act = Number(r7.lastActivityAt) || 0;
        var stalled = act ? Math.max(0, now - act) : 0;
        var stage = idleMs > 0 && stalled >= idleMs ? 3 : probeMs > 0 && stalled >= probeMs ? 2 : 1;
        var mMin = function(ms) {
          return Math.round(Number(ms) / 6e4);
        };
        var smCard = UI.card("\u72B6\u6001\u673A", {
          sub: "\u505C\u6EDE \u2265 " + mMin(idleMs) + " \u5206\u949F\u89E6\u53D1\u4E00\u6B21\u7ED3\u6784\u6574\u7406\uFF08\u5224\u5B9A\u7EBF " + mMin(probeMs) + " \u5206\u949F\uFF09" + (r7.lastDeepSleepAt ? " \xB7 \u4E0A\u6B21\u5165\u7761 " + dsFmtTime(r7.lastDeepSleepAt) : ""),
          right: [el("span", "sc-src", "/deepsleep")]
        });
        smSlot.appendChild(smCard.box);
        var sm = el("div", "sc-sm");
        [
          ["\u6E05\u9192", "M20 6L9 17l-5-5", "\u4F1A\u8BDD\u6709\u6D3B\u52A8\uFF0C\u4E0D\u89E6\u53D1\u6574\u7406"],
          ["\u5224\u5B9A\u4E2D", "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", "\u5DF2\u505C\u6EDE \u2265 " + mMin(probeMs) + " \u5206\u949F\uFF0C\u7B49\u5F85\u5224\u5B9A\u662F\u957F\u4EFB\u52A1\u8FD8\u662F\u5361\u4F4F"],
          ["\u53EF\u5165\u7761", "M12 3v12|M6 9l6 6 6-6|M5 21h14", "\u505C\u6EDE \u2265 " + mMin(idleMs) + " \u5206\u949F\uFF0C\u6EE1\u8DB3\u81EA\u52A8\u5F52\u7EB3\u6761\u4EF6"]
        ].forEach(function(n6, i7) {
          var idx = i7 + 1;
          var node = el("div", "sc-sm-node" + (idx < stage ? " done" : idx === stage ? " on" : ""));
          node.title = n6[2];
          var cir = el("div", "sc-sm-circle");
          cir.appendChild(svg(n6[1]));
          node.appendChild(cir);
          node.appendChild(el("div", "sc-sm-label", idx === stage ? n6[0] + " \xB7 \u5F53\u524D" : n6[0]));
          sm.appendChild(node);
          if (i7 < 2) sm.appendChild(el("div", "sc-sm-seg" + (idx < stage ? " done" : "")));
        });
        smCard.body.appendChild(sm);
        var water = el("div", "sc-prog");
        var wbar = document.createElement("wa-progress-bar");
        wbar.className = "sc-prog-bar";
        wbar.setAttribute("max", "100");
        wbar.setAttribute("value", String(idleMs ? Math.min(100, Math.round(stalled / idleMs * 100)) : 0));
        water.appendChild(wbar);
        water.appendChild(el(
          "div",
          "sc-prog-txt",
          "\u7761\u7720\u6C34\u4F4D \xB7 \u5DF2\u505C\u6EDE " + mMin(stalled) + " / " + mMin(idleMs) + " \u5206\u949F" + (idleMs ? "\uFF08" + Math.min(100, Math.round(stalled / idleMs * 100)) + "%\uFF09" : "")
        ));
        smCard.body.appendChild(water);
      })();
      (function() {
        var segs = [["running", r7.running], ["ended", r7.ended], ["probing", r7.probing], ["suspect", r7.suspect], ["stalled", r7.stalled]];
        var sum = segs.reduce(function(a4, s4) {
          return a4 + (Number(s4[1]) || 0);
        }, 0);
        if (!sum) return;
        var idleMin = Math.round((r7.idleMs || 0) / 6e4);
        var distCard = UI.card("\u7761\u7720\u72B6\u6001\u5206\u5E03", {
          sub: "idle " + idleMin + " \u5206\u949F \xB7 \u4E0B\u6B21\u53EF\u7761 " + (r7.nextEligibleAt ? dsFmtTime(r7.nextEligibleAt) : "\u2014"),
          right: [el("span", "sc-src", "GET /deepsleep"), UI.button("\u7ACB\u5373\u8FDB\u5165\u6DF1\u7761", function() {
            appState.statusFn("\u6DF1\u5EA6\u7761\u7720\u5F52\u7EB3\u4E2D\u2026");
            return appState.api("/deepsleep/trigger", { method: "POST", body: "{}" }).then(function(rr) {
              appState.statusFn(rr.ok ? "\u2713 \u5DF2\u89E6\u53D1\u5F52\u7EB3\uFF08\u89C1\u65E5\u5FD7\uFF09" : "\u26A0 \u89E6\u53D1\u5931\u8D25\uFF1A" + (rr.error || ""));
            });
          }, { primary: true, async: true, busyText: "\u5F52\u7EB3\u4E2D\u2026", okText: "\u5DF2\u89E6\u53D1\u5F52\u7EB3", confirm: "\u7ACB\u5373\u89E6\u53D1\u4E00\u6B21\u6DF1\u5EA6\u7761\u7720\u5F52\u7EB3\uFF1F\u5C06\u8C03\u7528\u5F52\u7EB3\u5B50\u4EE3\u7406\u56DE\u987E\u5F53\u5929\u8BB0\u5FC6\u75D5\u8FF9\u3002" })]
        });
        distSlot.appendChild(distCard.box);
        var byLabel = {};
        segs.forEach(function(s4) {
          var k2 = DS_STATE_TEXT[s4[0]] || s4[0];
          byLabel[k2] = (byLabel[k2] || 0) + Number(s4[1] || 0);
        });
        var merged = Object.keys(byLabel).map(function(k2) {
          return [k2, byLabel[k2]];
        });
        var bar = el("div", "sc-dseg");
        merged.forEach(function(s4) {
          if (Number(s4[1]) > 0) {
            var i7 = el("i", s4[0] === "\u505C\u6EDE" ? "stalled" : "running");
            i7.style.flex = String(s4[1]);
            bar.appendChild(i7);
          }
        });
        distCard.body.appendChild(bar);
        var legend = el("div", "sc-dlegend");
        merged.forEach(function(s4) {
          var it = el("span", "sc-dlegend-i");
          it.appendChild(el("i", "sc-segdot " + (s4[0] === "\u505C\u6EDE" ? "stalled" : "running")));
          it.appendChild(el("span", null, s4[0] + " " + String(s4[1] || 0)));
          legend.appendChild(it);
        });
        distCard.body.appendChild(legend);
      })();
      renderCognitionReport(cogSlot, "sleep");
      var scRun = UI.button("\u8FD0\u884C\u81EA\u68C0", function() {
        return appState.api("/selfcheck/run", { method: "POST", body: "{}" }).then(function(rr) {
          appState.statusFn("\u2713 \u81EA\u68C0\u5B8C\u6210\uFF1A" + (rr.verdict || "?"));
          renderDeepSleep(view);
        });
      }, { async: true, busyText: "\u81EA\u68C0\u4E2D\u2026", okText: "\u81EA\u68C0\u5B8C\u6210" });
      var scWrap = UI.card("\u7761\u7720\u671F\u81EA\u68C0\uFF08\u5224\u636E\u95E8 / \u8F7D\u4F53\u95E8 / \u5206\u5C42 / \u6210\u719F\u5EA6 / \u5F71\u5B50 / \u5BF9\u8D26\uFF09", {
        sub: "\u4E0A\u6B21\u7ED3\u679C\u8BFB selfcheck-latest.json\uFF08GET\uFF09\uFF1B\u6267\u884C\u8D70 POST",
        right: [el("span", "sc-src", "GET /selfcheck \xB7 POST /selfcheck/run"), scRun]
      });
      view.appendChild(scWrap.box);
      var scBox = el("div", "sc-mem-stats");
      var scCard = function(label, value, sub) {
        var c5 = el("div", "sc-mem-stat");
        c5.appendChild(el("div", "sc-mem-stat-label", label));
        c5.appendChild(el("div", "sc-mem-stat-value", value));
        if (sub) c5.appendChild(el("div", "sc-mem-stat-sub", sub));
        return c5;
      };
      scBox.appendChild(scCard("\u81EA\u68C0", "\u2026", "\u8BFB\u53D6\u4E2D"));
      scWrap.body.appendChild(scBox);
      appState.api("/selfcheck").then(function(s4) {
        scBox.textContent = "";
        if (!s4 || !s4.active) {
          scBox.appendChild(scCard("\u81EA\u68C0", "\u5C1A\u672A\u8DD1\u8FC7", s4 && s4.error || "\u5B9A\u65F6\u5668/\u6DF1\u7761\u540E\u4F1A\u81EA\u52A8\u6267\u884C"));
        } else {
          var v2 = String(s4.verdict || "?");
          var sm = s4.summary || {};
          var ck = sm.checks || {};
          scBox.appendChild(scCard("\u88C1\u51B3", v2 === "ok" ? "\u2705 ok" : v2 === "adjust" ? "\u{1F527} adjust" : "\u26A0 warn", "\u4E8E " + fmtTime(s4.at)));
          scBox.appendChild(scCard("\u516D\u9879\u68C0\u6D4B", Object.keys(ck).map(function(k2) {
            return (ck[k2] === "pass" ? "\u2705" : ck[k2] === "skipped" ? "\u23ED" : "\u274C") + k2;
          }).join(" "), "\u5F71\u5B50 flipReady=" + sm.flipScoreWeights + " \xB7 \u6210\u719F\u5EA6\u5C31\u7EEA=" + sm.maturationReady + " \xB7 \u95ED\u5408=" + (sm.closureOk === null ? "n/a" : sm.closureOk)));
          scBox.appendChild(scCard("\u767D\u540D\u5355\u8C03\u6574", Derive.has(s4.adjustments) ? s4.adjustments.map(function(a4) {
            return a4.id;
          }).join(" \xB7 ") : "\u65E0", "\u4EC5\u7A84\u52A8\u4F5C\u4E14\u53EF\u56DE\u6EDA\uFF1B\u6539 \u03B1/gate/\u5224\u636E \u4E00\u5F8B\u53EA\u5EFA\u8BAE"));
        }
      }).catch(function() {
        scBox.textContent = "";
        scBox.appendChild(scCard("\u81EA\u68C0", "\u8BFB\u53D6\u5931\u8D25", "/selfcheck"));
      });
      if (Derive.has(r7.sessions)) {
        var sessCard = UI.card("\u6700\u8FD1\u4F1A\u8BDD", { sub: r7.sessions.length + " \u6761\u5728\u518C" });
        view.appendChild(sessCard.box);
        r7.sessions.forEach(function(s4) {
          var sub = dsFmtAgo(s4.state === "ended" ? s4.lastEndAt : s4.lastEventAt);
          if (s4.probeResult) sub += " \xB7 " + (DS_PROBE_TEXT[s4.probeResult] || s4.probeResult);
          var pk = s4.state === "stalled" || s4.state === "suspect" ? "warn" : s4.state === "probing" ? "info" : "ok";
          var ttl = String(s4.title || "");
          if (ttl.length > 14) ttl = ttl.slice(0, 14) + "\u2026";
          var nm = [s4.workspace, ttl, s4.sid].filter(function(x2) {
            return !!x2;
          }).join(" \xB7 ");
          sessCard.body.appendChild(ovCRow(nm, sub, [ovPill(DS_STATE_TEXT[s4.state] || s4.state, pk)]));
        });
      }
      var hasStall = r7.stalled > 0 || (r7.sessions || []).some(function(s4) {
        return s4.probeResult === "stall";
      });
      if (hasStall) {
        view.appendChild(el("div", "sc-ds-alert", "\u26A0 \u68C0\u6D4B\u5230\u7591\u4F3C\u5361\u4F4F\u7684\u4F1A\u8BDD\uFF08\u65E0\u8F93\u51FA\u589E\u957F\u4F46\u4F1A\u8BDD\u4ECD\u5728\uFF09\uFF1A\u5DF2\u6B63\u5E38\u8BA1\u5165\u505C\u6EDE\u5E76\u5B89\u6392\u7761\u7720\uFF0C\u4F46\u5EFA\u8BAE\u4F60\u786E\u8BA4\u8BE5\u4EFB\u52A1\u662F\u5426\u771F\u7684\u5361\u4F4F\u2014\u2014\u5FC5\u8981\u65F6\u624B\u52A8\u91CD\u542F\u8BE5\u4F1A\u8BDD\u3002"));
      }
    }).catch(function(e8) {
      view.appendChild(el("div", "sc-desc", "\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e8 && e8.message ? e8.message : e8)));
    });
  }
  function dsFmtAgo(ts) {
    if (!ts) return "\u2014";
    var s4 = Math.max(0, Math.floor((Date.now() - ts) / 1e3));
    if (s4 < 60) return s4 + " \u79D2";
    var m3 = Math.floor(s4 / 60);
    if (m3 < 60) return m3 + " \u5206\u949F";
    var h3 = Math.floor(m3 / 60);
    if (h3 < 24) return h3 + " \u5C0F\u65F6 " + m3 % 60 + " \u5206";
    return Math.floor(h3 / 24) + " \u5929 " + h3 % 24 + " \u5C0F\u65F6";
  }
  function dsFmtTime(ts) {
    if (!ts) return "\u4ECE\u672A";
    try {
      return new Date(ts).toLocaleString("zh-CN", { hour12: false });
    } catch (e8) {
      return String(ts);
    }
  }
  var DS_STATE_TEXT = { running: "\u5F85\u84B8\u998F", ended: "\u5F85\u84B8\u998F", probing: "\u5F85\u84B8\u998F", suspect: "\u5F85\u84B8\u998F", stalled: "\u505C\u6EDE" };
  var DS_PROBE_TEXT = {
    "long-run": "\u957F\u4EFB\u52A1\u8FDB\u884C\u4E2D",
    "suspect": "\u5F85\u4E0B\u8F6E\u590D\u6838",
    "conflict": "\u72B6\u6001\u6D3B\u8DC3\u4F46\u65E0\u8F93\u51FA\u589E\u957F",
    "stall": "\u5DF2\u786E\u8BA4\u65E0\u8F93\u51FA",
    "exit": "\u4F1A\u8BDD\u5DF2\u9000\u51FA",
    "no-transcript": "\u63A2\u9488\u4E0D\u53EF\u7528",
    "error": "\u63A2\u6D4B\u5F02\u5E38"
  };

  // src-client/panes-settings.js
  function makeToggle(key, name, desc, initial, onToggle) {
    var sw = el("input", "checkbox-container");
    sw.type = "checkbox";
    sw.checked = !!initial;
    sw.onchange = function() {
      onToggle(key, sw);
    };
    return UI.item(name, desc, sw, { extra: [appState.metaBadges(key)], wrapControl: false });
  }
  function renderViewSettings(view) {
    view.textContent = "";
    UI.pageHead("\u8BBE\u7F6E", "\u754C\u9762\u504F\u597D\u4E0E\u9AD8\u7EA7\u64CD\u4F5C\u3002\u914D\u7F6E\u539F\u6587\uFF08YAML\uFF09\u4E0E\u884C\u7EA7\u7F16\u8F91\u6536\u5728\u6B64\u5904\uFF0C\u914D\u98CE\u9669\u63D0\u793A\u3002", {
      routes: ["/config", "/save", "/roots", "/memory/edit"],
      actions: [UI.button("\u5BFC\u51FA\u5FEB\u7167", function() {
        return appState.api("/config").then(function(c5) {
          var snap = {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            config: { file: c5 && c5.file || "", text: c5 && c5.text || "" },
            ui: Cfg.get()
          };
          var blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
          var a4 = document.createElement("a");
          a4.href = URL.createObjectURL(blob);
          a4.download = "shoucang-config-snapshot-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "") + ".json";
          a4.click();
          URL.revokeObjectURL(a4.href);
          appState.statusFn("\u2713 \u914D\u7F6E\u5FEB\u7167\u5DF2\u5BFC\u51FA");
        });
      }, { async: true, busyText: "\u5BFC\u51FA\u4E2D\u2026", okText: "\u914D\u7F6E\u5FEB\u7167\u5DF2\u5BFC\u51FA", title: "\u5BFC\u51FA\u914D\u7F6E\u539F\u6587 + \u754C\u9762\u504F\u597D\uFF08JSON\uFF09" })]
    });
    var pLook = el("div");
    var pAdv = el("div");
    var _tb = UI.tabs("settings", [{ id: "pref", label: "\u754C\u9762\u504F\u597D", pane: pLook }, { id: "advanced", label: "\u9AD8\u7EA7", pane: pAdv }]);
    view.appendChild(_tb.box);
    var host = _tb.pane("pref");
    var pref = UI.card(null);
    host.appendChild(pref.box);
    var box = pref.body;
    box.appendChild(UI.item(
      "\u663E\u793A\u5BC6\u5EA6",
      "\u7D27\u51D1\u6A21\u5F0F\u9690\u85CF\u63CF\u8FF0\u6587\u5B57\u3001\u538B\u7F29\u884C\u9AD8\uFF0C\u63D0\u5347\u4FE1\u606F\u5BC6\u5EA6\u3002",
      UI.select(
        [{ value: "comfortable", label: "\u8212\u9002" }, { value: "compact", label: "\u7D27\u51D1" }],
        Cfg.get("density", "comfortable"),
        function(v2) {
          Cfg.set("density", v2);
          applyDensity();
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      "\u5BFC\u822A\u5BBD\u5EA6",
      "\u5DE6\u4FA7\u5BFC\u822A\u50CF\u7D20\u5BBD\u5EA6\uFF08140\u2013320\uFF09\uFF1B\u7A84\u5C4F\uFF08\u2264900px\uFF09\u7531\u54CD\u5E94\u5F0F\u65AD\u70B9\u63A5\u7BA1\u3002",
      UI.input(Cfg.get("navWidth", 216), function(v2) {
        var n6 = parseInt(v2, 10);
        if (isNaN(n6)) return;
        Cfg.set("navWidth", Math.max(140, Math.min(320, n6)));
        applyNavWidth();
      }, { type: "number", width: "120px", ariaLabel: "\u5BFC\u822A\u5BBD\u5EA6" }),
      {}
    ));
    box.appendChild(UI.item(
      "\u6253\u5F00\u65F6\u81EA\u52A8\u5237\u65B0",
      "\u6253\u5F00\u9762\u677F\u5373\u91CD\u65B0\u62C9\u53D6\u5F53\u524D\u89C6\u56FE\u6570\u636E\u3002",
      UI.toggle(Cfg.get("autoRefresh", true), function(v2) {
        Cfg.set("autoRefresh", v2);
      }),
      {}
    ));
    box.appendChild(UI.item(
      "\u8F6E\u8BE2\u95F4\u9694\uFF08\u6BEB\u79D2\uFF09",
      "0 = \u5173\u95ED\u8F6E\u8BE2\u3002\u5F71\u54CD\u8FD0\u884C\u6001\u6570\u636E\u5237\u65B0\u9891\u7387\u3002",
      UI.input(Cfg.get("refreshMs", 6e4), function(v2) {
        var n6 = parseInt(v2, 10);
        if (isNaN(n6)) return;
        Cfg.set("refreshMs", Math.max(0, n6));
        restartPolling();
      }, { type: "number", width: "140px", ariaLabel: "\u8F6E\u8BE2\u95F4\u9694" }),
      {}
    ));
    box.appendChild(UI.item(
      "\u6982\u89C8\u2014\u8BE6\u60C5\u5206\u5C42",
      "\u5217\u8868\u9ED8\u8BA4\u6298\u53E0\u8BE6\u60C5\uFF0C\u5148\u7ED9\u6982\u89C8\u518D\u6309\u9700\u5C55\u5F00\u3002",
      UI.toggle(Cfg.get("overviewMode", true), function(v2) {
        Cfg.set("overviewMode", v2);
      }),
      {}
    ));
    box.appendChild(UI.item(
      "\u957F\u5217\u8868\u6298\u53E0\u9608\u503C",
      "\u8D85\u8FC7\u8BE5\u884C\u6570\u7684\u5217\u8868\u9ED8\u8BA4\u6298\u53E0\u3002",
      UI.input(Cfg.get("maxRows", 50), function(v2) {
        var n6 = parseInt(v2, 10);
        if (isNaN(n6)) return;
        Cfg.set("maxRows", Math.max(5, Math.min(500, n6)));
      }, { type: "number", width: "120px", ariaLabel: "\u6298\u53E0\u9608\u503C" }),
      {}
    ));
    box.appendChild(UI.item(
      "\u663E\u793A\u65E5\u5FD7\u9762\u677F",
      "\u5728\u72B6\u6001\u680F\u4E0A\u65B9\u5E38\u9A7B\u663E\u793A\u8C03\u7528\u65E5\u5FD7\u3002",
      UI.toggle(Cfg.get("showLogs", true), function(v2) {
        Cfg.set("showLogs", v2);
        applyLogPanel();
      }),
      {}
    ));
    box.appendChild(UI.item(
      "\u65E5\u5FD7\u7EA7\u522B",
      "\u8FC7\u6EE4\u65E5\u5FD7\u9762\u677F\u663E\u793A\u7684\u6700\u4F4E\u7EA7\u522B\uFF08\u5168\u90E8 / \u8B66\u544A+ / \u4EC5\u9519\u8BEF\uFF09\u3002",
      UI.select(
        [{ value: "info", label: "\u5168\u90E8" }, { value: "warn", label: "\u8B66\u544A+" }, { value: "error", label: "\u4EC5\u9519\u8BEF" }],
        Cfg.get("logLevel", "info"),
        function(v2) {
          Cfg.set("logLevel", v2);
          Bus.emit("log", null);
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      "\u542F\u52A8\u65F6\u89C6\u56FE",
      "\u6253\u5F00\u9762\u677F\u540E\u9ED8\u8BA4\u843D\u5730\u7684\u9875\u9762\u3002\u4F18\u5148\u7EA7\uFF1A#sc=<\u89C6\u56FE\u540D> \u6DF1\u94FE > \u4E0A\u6B21\u89C6\u56FE\u8BB0\u5FC6 > \u6B64\u9879\u3002",
      UI.select(
        appState.views.map(function(v2) {
          return { value: v2[0], label: v2[1] };
        }),
        Cfg.get("startView", "overview"),
        function(v2) {
          Cfg.set("startView", v2);
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      "\u754C\u9762\u76AE\u80A4",
      "v9 = \u65B9\u6848\u8C03\u8272\u677F\uFF08\u9ED8\u8BA4\uFF09\uFF1B\u5BBF\u4E3B = \u8DDF\u968F DSH \u4E3B\u9898\u4EE4\u724C\uFF08\u4E0E\u5BBF\u4E3B\u540C\u8272\uFF09\u3002",
      UI.select(
        [{ value: "v9", label: "v9 \u65B9\u6848\u76AE\u80A4" }, { value: "host", label: "\u5BBF\u4E3B\u539F\u751F\u76AE\u80A4" }],
        Cfg.get("skin", "v9"),
        function(v2) {
          Cfg.set("skin", v2);
          syncTheme();
          appState.refreshView();
        }
      ),
      {}
    ));
    box.appendChild(UI.item(
      "\u5BFC\u822A\u5206\u7EC4\u663E\u793A",
      "\u6309\u8BED\u4E49\u663E\u793A\u5206\u7EC4\u6807\u9898\uFF08\u5B88\u85CF / \u603B\u89C8 / \u8BB0\u5FC6 / \u8FD0\u884C / \u914D\u7F6E\uFF09\u3002",
      UI.toggle(Cfg.get("navGroups", true), function(v2) {
        Cfg.set("navGroups", v2);
        applyNavGroups();
      }),
      {}
    ));
    box.appendChild(UI.item(
      "\u9875\u811A\u5065\u5EB7\u6761",
      "\u5E38\u9A7B\u663E\u793A\u8BB0\u5FC6\u5E93\u72B6\u6001\u4E0E\u5E93\u8DEF\u5F84\u3002",
      UI.toggle(Cfg.get("footBar", true), function(v2) {
        Cfg.set("footBar", v2);
        applyFootBar();
      }),
      {}
    ));
    var keys = UI.card("\u5FEB\u6377\u952E", { sub: "\u9762\u677F\u5185\u53EF\u7528" });
    keys.body.appendChild(ovCRow("\u6253\u5F00 / \u5173\u95ED\u9762\u677F", "\u5168\u5C40", [ovPill("Ctrl/\u2318 + Shift + S", "", true)]));
    keys.body.appendChild(ovCRow("\u5207\u6362\u65E5\u5FD7\u9762\u677F", "\u9762\u677F\u5185", [ovPill("Ctrl/\u2318 + Shift + L", "", true)]));
    keys.body.appendChild(ovCRow("\u5173\u95ED\u9762\u677F", "\u9762\u677F\u5185", [ovPill("Esc", "", true)]));
    host.appendChild(keys.box);
    var adv = el("div");
    adv.appendChild(el("div", "sc-desc", "\u914D\u7F6E\u539F\u6587\uFF08shoucang.config.yaml\uFF09\u4FDD\u5B58\u540E\u81EA\u52A8\u5907\u4EFD .bak-*\uFF1B\u6839\u76EE\u5F55\u5207\u6362\u4E0E\u65B0\u589E\u5728\u6B64\u3002"));
    renderConfigRaw(adv);
    host = _tb.pane("advanced");
    host.appendChild(UI.collapsible("\u9AD8\u7EA7 \xB7 \u914D\u7F6E\u539F\u6587\u4E0E\u6839\u76EE\u5F55", adv, { open: false }));
    var dsAdv = el("div");
    dsAdv.appendChild(el("div", "sc-desc", "\u5199\u5165 ~/.dsh/suite/scheduler.json\uFF1B\u6539\u540E\u9700\u91CD\u8F7D\u63D2\u4EF6\u751F\u6548\u3002"));
    host.appendChild(UI.collapsible("\u6DF1\u5EA6\u7761\u7720\u9608\u503C", dsAdv, { open: false, key: "settings:dsadv" }));
    appState.api("/deepsleep/config").then(function(cfg) {
      var run = cfg.running || {};
      dsAdv.appendChild(makeToggle("enableDeepSleep", "\u542F\u7528\u6DF1\u5EA6\u7761\u7720\u81EA\u52A8\u5F52\u7EB3 enableDeepSleep", "\u5168\u90E8\u4F1A\u8BDD\u505C\u6EDE \u2265 \u9608\u503C\u540E\u81EA\u52A8\u63D0\u70BC\u539F\u5219\u5C42\uFF08\u5173\u95ED = \u6682\u505C\uFF0C\u7B49\u4E8E\u539F\u300C\u6682\u505C\u5230\u660E\u5929\u300D\uFF09\u3002", !!run.enableDeepSleep, function(key, sw) {
        appState.api("/deepsleep/config", { method: "POST", body: JSON.stringify({ enableDeepSleep: sw.checked }) }).then(function() {
          appState.statusFn("\u2713 \u5DF2\u4FDD\u5B58\uFF08\u91CD\u8F7D\u751F\u6548\uFF09");
        }).catch(function(e8) {
          appState.failFn(e8);
          sw.checked = !sw.checked;
        });
      }));
      dsAdv.appendChild(appState.dsNumber("\u505C\u6EDE\u9608\u503C deepSleepIdleMs", "\u5168\u90E8\u4F1A\u8BDD\u65E0\u6D3B\u52A8\u6301\u7EED\u6EE1\u6B64\u6BEB\u79D2\u6570\u624D\u89E6\u53D1\uFF08\u9ED8\u8BA4 3 \u5C0F\u65F6\uFF09\u3002", Math.round((run.deepSleepIdleMs || 108e5) / 6e4), 10, 720, "\u5206\u949F", function(m3) {
        return m3 * 6e4;
      }, "deepSleepIdleMs"));
      dsAdv.appendChild(appState.dsNumber("\u63A2\u6D4B\u53D1\u8D77\u5EF6\u8FDF deepSleepProbeAfterMs", "running \u65E0\u4E8B\u4EF6\u6301\u7EED\u6B64\u6BEB\u79D2\u540E\u53D1\u8D77\u8F93\u51FA\u589E\u957F\u63A2\u6D4B\uFF08\u9ED8\u8BA4 3 \u5C0F\u65F6\uFF09\u3002", Math.round((run.deepSleepProbeAfterMs || 108e5) / 6e4), 10, 720, "\u5206\u949F", function(m3) {
        return m3 * 6e4;
      }, "deepSleepProbeAfterMs"));
      dsAdv.appendChild(appState.dsNumber("\u63A2\u6D4B\u91C7\u6837\u95F4\u9694 deepSleepProbeWindowMs", "\u4E24\u8F6E\u91C7\u6837\u4E4B\u95F4\u7684\u95F4\u9694\uFF08\u9ED8\u8BA4 60 \u79D2\uFF09\u3002", Math.round((run.deepSleepProbeWindowMs || 6e4) / 1e3), 5, 600, "\u79D2", function(s4) {
        return s4 * 1e3;
      }, "deepSleepProbeWindowMs"));
    }).catch(function(e8) {
      dsAdv.appendChild(el("div", "sc-mem-empty", "\u9608\u503C\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e8 && e8.message ? e8.message : e8)));
    });
    var acts = el("div", "sc-acts");
    acts.appendChild(UI.button("\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E", function() {
      Cfg.reset();
      applyDensity();
      applyNavWidth();
      applyNavGroups();
      applyFootBar();
      applyLogPanel();
      restartPolling();
      appState.refreshView();
      Log.info("\u754C\u9762\u8BBE\u7F6E\u5DF2\u6062\u590D\u9ED8\u8BA4");
    }, { confirm: "\u786E\u8BA4\u6062\u590D\u5168\u90E8\u754C\u9762\u8BBE\u7F6E\u4E3A\u9ED8\u8BA4\u503C\uFF1F" }));
    acts.appendChild(el("span", "sc-acts-note", "\u91CD\u7F6E 10 \u9879\u754C\u9762\u504F\u597D\u5E76\u7ACB\u5373\u91CD\u7ED8\uFF08\u5BC6\u5EA6 / \u5BFC\u822A\u5BBD\u5EA6 / \u65E5\u5FD7\u9762\u677F / \u8F6E\u8BE2\u5168\u90E8\u91CD\u65B0\u5E94\u7528\uFF09"));
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
      var o9 = {};
      o9[key] = encode(range.value);
      appState.api("/deepsleep/config", { method: "POST", body: JSON.stringify(o9) }).then(function() {
        appState.statusFn("\u2713 " + name + " = " + range.value + " " + unit + "\uFF08\u91CD\u8F7D\u751F\u6548\uFF09");
      }).catch(appState.failFn);
    });
    wrap.appendChild(lab);
    wrap.appendChild(range);
    item.appendChild(info);
    item.appendChild(wrap);
    return item;
  }
  function applyDensity() {
    var m3 = document.getElementById("scpanl-modal");
    if (!m3) return;
    m3.classList.toggle("sc-density-compact", Cfg.get("density", "comfortable") === "compact");
  }
  function applyNavWidth() {
    var m3 = document.getElementById("scpanl-modal");
    if (!m3) return;
    var n6 = parseInt(Cfg.get("navWidth", 216), 10);
    if (!n6) n6 = 216;
    m3.style.setProperty("--sc-nav-w", Math.max(140, Math.min(320, n6)) + "px");
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
    var m3 = document.getElementById("scpanl-modal");
    if (m3) m3.classList.toggle("sc-nogroups", !Cfg.get("navGroups", true));
  }
  function applyFootBar() {
    var m3 = document.getElementById("scpanl-modal");
    if (m3) m3.classList.toggle("sc-nofoot", !Cfg.get("footBar", true));
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
    var m3 = {};
    function put(k2, v2) {
      m3[k2] = v2;
      Store.patch("metrics", m3);
    }
    appState.api("/mcl/status").then(function(r7) {
      put("MCL \u72B6\u6001", r7 && (r7.mode || r7.state) || "\u2014");
      if (r7 && r7.familiarity != null) put("\u719F\u6089\u5EA6", String(r7.familiarity));
    }).catch(function() {
      put("MCL \u72B6\u6001", "\u83B7\u53D6\u5931\u8D25");
    });
    appState.api("/vector/status2").then(function(r7) {
      put("\u5411\u91CF\u6863", r7 && r7.present ? String(r7.rows || 0) + " \u884C" : "\u672A\u542F\u7528");
    }).catch(function() {
      put("\u5411\u91CF\u6863", "\u83B7\u53D6\u5931\u8D25");
    });
    appState.api("/inject/stats").then(function(r7) {
      put("\u6CE8\u5165\u7EDF\u8BA1", r7 && typeof r7 === "object" ? JSON.stringify(r7).slice(0, 160) : String(r7));
    }).catch(function() {
      put("\u6CE8\u5165\u7EDF\u8BA1", "\u83B7\u53D6\u5931\u8D25");
    });
    appState.api("/get_root").then(function(r7) {
      put("\u5F53\u524D\u6839", r7 && (r7.root || r7.path || r7.active) || "\u2014");
    }).catch(function() {
      put("\u5F53\u524D\u6839", "\u83B7\u53D6\u5931\u8D25");
    });
  }
  function syncTheme() {
    var root = document.getElementById("scpanl-root");
    if (!root) return;
    var probe = document.querySelector('.hHd-Xa_settingsArea, .hHd-Xa_footerActions, [class*="sidebar"], body');
    var bg = probe ? getComputedStyle(probe).backgroundColor : "";
    var m3 = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg || "");
    var dark = true;
    if (m3) {
      var lum = (Number(m3[1]) * 299 + Number(m3[2]) * 587 + Number(m3[3]) * 114) / 1e3;
      dark = lum < 140;
    }
    var skin = String(Cfg.get("skin", "v9")) === "host" ? "host" : "v9";
    root.classList.toggle("sc-dark", dark);
    root.classList.toggle("sc-light", !dark);
    root.classList.toggle("wa-dark", dark);
    root.classList.toggle("wa-light", !dark);
    root.classList.toggle("sc-skin-v9", skin === "v9");
    root.classList.toggle("sc-skin-host", skin === "host");
    try {
      Cfg.set("theme", dark ? "dark" : "light");
    } catch (e8) {
    }
  }

  // src-client/panes-toggles.js
  function renderViewToggles(view, parsed, global) {
    view.textContent = "";
    UI.pageHead("\u53C2\u6570\u8C03\u8282", "\u6CE8\u5165\u53C2\u6570\uFF08\u5168\u5C40\uFF0C\u5199 ~/.dsh/suite/scheduler.json\uFF09\u4E0E\u8FD0\u884C\u65F6\u901A\u9053\u3002\u6539\u52A8\u5373\u65F6\u5199\u56DE\uFF08scheduler.json \u5907\u4EFD\u5148\u884C\uFF09\u3002\u6CE8\u5165\u914D\u7F6E\u5DF2\u8FC1\u5168\u5C40\uFF0C\u4E0D\u518D\u968F root \u5207\u6362\u53D8\u5316\uFF08root YAML \u4EC5\u5269\u300C\u914D\u7F6E\u539F\u6587\u300D\u9875\u53EF\u76F4\u63A5\u7F16\u8F91\uFF09\u3002", { routes: ["/config", "/save", "/toggle"] });
    var pT1 = el("div");
    var pT2 = el("div");
    var pT3 = el("div");
    var pT4 = el("div");
    var _tb = UI.tabs("toggles", [{ id: "inject", label: "\u2460 \u6CE8\u5165\u4E0E\u753B\u50CF", pane: pT1 }, { id: "cap", label: "\u2461 \u8BB0\u5FC6\u4E0E\u5BB9\u91CF", pane: pT2 }, { id: "model", label: "\u2462 \u6A21\u578B\u4E0E\u5411\u91CF", pane: pT3 }, { id: "sched", label: "\u2463 \u540E\u53F0\u4E0E\u8C03\u5EA6", pane: pT4 }]);
    view.appendChild(_tb.box);
    var g2 = global || {};
    renderTogglesInject(UI.cardIn(_tb.pane("inject")), view, parsed, g2);
    renderTogglesCap(UI.cardIn(_tb.pane("cap")), g2);
    renderTogglesModel(UI.cardIn(_tb.pane("model")));
    renderTogglesSched(UI.cardIn(_tb.pane("sched")), g2);
    appState.flushFolds();
  }
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
      var v2 = String(isFloat ? Math.max(0, parseFloat(inp.value) || 0) : Math.max(0, parseInt(inp.value, 10) || 0));
      appState.api("/set", { method: "POST", body: JSON.stringify({ key, value: v2 }) }).then(function() {
        appState.statusFn("\u2713 " + key + " = " + v2);
      }).catch(appState.failFn);
    };
    wrap.appendChild(inp);
    wrap.appendChild(unitEl);
    return UI.item(name, desc, null, { children: [appState.metaBadges(key), wrap] });
  }
  function renderTogglesInject(host, view, parsed, g2) {
    function gVal(key, fallback2) {
      return g2[key] !== void 0 && g2[key] !== null ? g2[key] : fallback2;
    }
    (function() {
      var bar = el("div", "sc-search-bar");
      var q = el("input", "sc-input");
      q.type = "search";
      q.placeholder = "\u68C0\u7D22\u53C2\u6570\uFF08\u540D\u79F0 / \u952E\u540D / \u8BF4\u660E\uFF09\u2026";
      var cnt = el("span", "sc-search-count", "");
      bar.appendChild(q);
      bar.appendChild(cnt);
      q.oninput = function() {
        var kw = String(q.value || "").trim().toLowerCase();
        var items = view.querySelectorAll(".setting-item");
        var hit = 0;
        items.forEach(function(it) {
          var t6 = (it.textContent || "").toLowerCase();
          var show = !kw || t6.indexOf(kw) > -1;
          it.classList.toggle("sc-filtered", !show);
          if (show) hit++;
        });
        cnt.textContent = kw ? "\u5339\u914D " + hit + " / " + items.length + " \u9879" : "";
      };
      host.appendChild(bar);
    })();
    host.appendChild(el("div", "sc-desc", "\u5373\u65F6\u751F\u6548\uFF1A\u6539\u52A8\u76F4\u63A5\u5199 ~/.dsh/suite/scheduler.json\uFF08\u5199\u524D\u5907\u4EFD\uFF09\u3002"));
    var personaMode = String(gVal("persona", "both"));
    var PERSONA_TIERS = [["off", "\u5173\u95ED"], ["me", "\u4EC5\u6CE8\u5165\u6211"], ["you", "\u4EC5\u6CE8\u5165\u4F60"], ["both", "\u5168\u6CE8\u5165"]];
    var slider = el("div", "sc-persona-slider");
    PERSONA_TIERS.forEach(function(tier, i7) {
      var cell = el("button", "sc-persona-cell" + (tier[0] === personaMode ? " active" : ""));
      cell.type = "button";
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", tier[0] === personaMode ? "true" : "false");
      cell.textContent = tier[1];
      cell.onclick = function() {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "injection.persona", value: tier[0] }) }).then(function() {
          appState.statusFn("\u2713 persona \u6863\u4F4D = " + tier[1]);
          slider.querySelectorAll(".sc-persona-cell").forEach(function(c5) {
            c5.classList.remove("active");
            c5.setAttribute("aria-checked", "false");
          });
          cell.classList.add("active");
          cell.setAttribute("aria-checked", "true");
        }).catch(appState.failFn);
      };
      slider.appendChild(cell);
    });
    host.appendChild(UI.item("\u753B\u50CF persona \u6CE8\u5165\u6863\u4F4D injection.persona", "v17 \u5DF2\u751F\u6548\uFF1A\u5173\u95ED=\u4E0D\u6CE8\u5165\u753B\u50CF\uFF1B\u4EC5\u6CE8\u5165\u6211=\u53EA\u6CE8\u5165 agent \u753B\u50CF AGENT.md\uFF08\u542B [\u539F\u5219] \u4E60\u5F97\u539F\u5219\u4E0E [\u8DEF\u5F84] \u4EFB\u52A1\u8DEF\u5F84\uFF09\uFF1B\u4EC5\u6CE8\u5165\u4F60=\u53EA\u6CE8\u5165\u7528\u6237\u753B\u50CF USER.md\uFF1B\u5168\u6CE8\u5165=\u53CC\u753B\u50CF\uFF08\u9ED8\u8BA4\uFF09", null, { children: [appState.metaBadges("injection.persona"), slider] }));
    appState.switchKeys.forEach(function(it) {
      var cur = it[0] === "injection.hot_memory" ? gVal("hot_memory", true) : parsed.flags[it[0]];
      if (typeof cur !== "boolean") return;
      host.appendChild(appState.makeToggle(it[0], it[1], it[2], cur, function(key, sw) {
        appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
          appState.statusFn("\u2713 \u5DF2\u5207\u6362 " + key);
        }).catch(function(e8) {
          appState.failFn(e8);
          sw.checked = !sw.checked;
        });
      }));
    });
    var levelMode = String(gVal("level", "smart"));
    var LEVEL_TIERS = [["off", "off"], ["low", "low"], ["medium", "medium"], ["high", "high"], ["smart", "smart"]];
    var lSlider = el("div", "sc-persona-slider");
    LEVEL_TIERS.forEach(function(tier, i7) {
      var cell = el("button", "sc-persona-cell" + (tier[0] === levelMode ? " active" : ""));
      cell.type = "button";
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", tier[0] === levelMode ? "true" : "false");
      cell.textContent = tier[1];
      cell.title = "injection.level = " + tier[0];
      cell.onclick = function() {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "injection.level", value: tier[0] }) }).then(function() {
          appState.statusFn("\u2713 injection.level = " + tier[0]);
          lSlider.querySelectorAll(".sc-persona-cell").forEach(function(c5) {
            c5.classList.remove("active");
            c5.setAttribute("aria-checked", "false");
          });
          cell.classList.add("active");
          cell.setAttribute("aria-checked", "true");
        }).catch(appState.failFn);
      };
      lSlider.appendChild(cell);
    });
    host.appendChild(UI.item("\u70ED\u8BB0\u5FC6\u6CE8\u5165\u5F3A\u5EA6 injection.level", "off=\u4E0D\u6CE8\u5165 / low(2 \u6761) / medium(4 \u6761) / high(8 \u6761) / smart=\u667A\u80FD\u4E0A\u9650(10 \u6761)\uFF1B\u5F53\u524D\uFF1A" + levelMode + "\uFF1B\u6539\u52A8\u5373\u65F6\u751F\u6548\uFF08\u7F13\u5B58\u4F5C\u5E9F\uFF09", null, { children: [appState.metaBadges("injection.level"), lSlider] }));
    host.appendChild(appState.makeToggle("injectRelevance", "\u6CE8\u5165\u76F8\u5173\u6027\u91CD\u6392 injectRelevance", "\u5F00=\u6309\u76F8\u5173\u6027\u9009\u884C\uFF08\u7F3A\u7701\uFF09\uFF1B\u5173=\u56DE\u843D\u300C\u57FA\u7EBF + \u65B0\u9C9C\u5EA6\u300D\u9009\u884C\u3002\u5373\u65F6\u751F\u6548\uFF08\u4E0B\u6B21\u6CE8\u5165\u5373\u7528\uFF09", gVal("injectRelevance", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn("\u2713 \u5DF2\u5207\u6362 " + key + "\uFF08\u5373\u65F6\uFF09");
      }).catch(function(e8) {
        appState.failFn(e8);
        sw.checked = !sw.checked;
      });
    }));
    host.appendChild(numSetting("\u65B0\u9C9C\u5EA6\u4FDD\u5E95\u69FD injectFreshSlots", "\u6CE8\u5165\u65F6\u4F18\u5148\u4FDD\u7559\u300C\u6700\u8FD1\u65B0\u589E\u6761\u76EE\u300D\u7684\u69FD\u4F4D\u6570\uFF080\u20136\uFF0C\u7F3A\u7701 2\uFF09", gVal("injectFreshSlots", 2), "injectFreshSlots", "\u6761", 1));
  }
  function renderTogglesCap(host, g2) {
    function gVal(key, fallback2) {
      return g2[key] !== void 0 && g2[key] !== null ? g2[key] : fallback2;
    }
    host.appendChild(el("div", "sc-desc", "\u5BB9\u91CF\u95E8 = \u8BB0\u5FC6\u5E93\u80FD\u957F\u591A\u5927\uFF08\u5199\u5165\u8D85\u9650\u88AB write_gate \u62D2\u5199\uFF09\uFF1B\u6D3B\u6027/\u9057\u5FD8\u4E3A\u5929\u7EA7\u9608\u503C\u3002"));
    var actualChars = g2 && g2.actual || { agent: 0, user: 0, memory: 0 };
    host.appendChild(numSetting("AGENT.md \u5BB9\u91CF\u95E8 cap_agent", "agent \u753B\u50CF\u8BB0\u5FC6\u5E93\u5BB9\u91CF\uFF08\u5B57\u7B26\uFF09\uFF1A\u84B8\u998F/\u6DF1\u7761\u5199\u5165\u8D85\u9650\u4F1A\u88AB write_gate \u62D2\uFF08AGENT.md \u5F53\u524D\u5B9E\u9645 " + (actualChars.agent || 0) + " \u5B57\u7B26\uFF09\u3002**\u4E0D\u5F71\u54CD\u4EFB\u52A1\u6267\u884C\u6CE8\u5165**\u2014\u2014\u6CE8\u5165\u603B\u770B\u5B8C\u6574\u753B\u50CF", gVal("cap_agent", 3e3), "injection.cap_agent", "\u5B57\u7B26"));
    host.appendChild(numSetting("USER.md \u5BB9\u91CF\u95E8 cap_user", "\u7528\u6237\u753B\u50CF\u8BB0\u5FC6\u5E93\u5BB9\u91CF\uFF08\u5B57\u7B26\uFF09\uFF1A\u5199\u5165\u8D85\u9650\u88AB\u62D2\uFF08\u5F53\u524D\u5B9E\u9645 " + (actualChars.user || 0) + " \u5B57\u7B26\uFF09\u3002\u4E0D\u5F71\u54CD\u4EFB\u52A1\u6267\u884C\u6CE8\u5165", gVal("cap_user", 3e3), "injection.cap_user", "\u5B57\u7B26"));
    host.appendChild(numSetting("MEMORY.md \u5BB9\u91CF\u95E8 cap_memory", "\u77E5\u8BC6\u7D22\u5F15\u8BB0\u5FC6\u5E93\u5BB9\u91CF\uFF08\u5B57\u7B26\uFF09\uFF1A\u5199\u5165\u8D85\u9650\u88AB\u62D2\uFF08\u5F53\u524D\u5B9E\u9645 " + (actualChars.memory || 0) + " \u5B57\u7B26\uFF09\u3002\u6CE8\u5165\u6309\u6863\u4F4D\u884C\u6570\u4E0D\u53D7\u6B64\u9650", gVal("cap_memory", 5e3), "injection.cap_memory", "\u5B57\u7B26"));
    host.appendChild(el("div", "sc-h3", "\u6D3B\u6027 / \u9057\u5FD8\u9608\u503C\uFF08v7\uFF09"));
    host.appendChild(el("div", "sc-desc", "\u8BB0\u5FC6\u6761\u76EE\u6D3B\u6027\u72B6\u6001\u673A\uFF08active\u2192warm\u2192cold\uFF09\u4E0E\u9057\u5FD8/\u52A0\u6DF1\u5019\u9009\u7684\u5224\u5B9A\u9608\u503C\uFF0C\u4EE5\u53CA\u878D\u5408\u53EC\u56DE\u5BF9 cold/retired \u6761\u76EE\u7684\u964D\u6743\u7CFB\u6570\u3002\u6539\u52A8\u7ECF /set \u5373\u65F6\u5199\u56DE scheduler.json\uFF08\u4E0E\u6CE8\u5165/\u84B8\u998F\u914D\u7F6E\u540C\u901A\u9053\uFF0C\u91CD\u8F7D\u540E\u6309\u65B0\u9608\u503C\u8FD0\u884C\uFF09\u3002"));
    host.appendChild(numSetting("\u6D3B\u6027\u964D\u7EA7 warm \u9608\u503C activityWarmDays", "active\u2192warm \u65E0\u547D\u4E2D\u5929\u6570\uFF08\u7F3A\u7701 14\uFF09", gVal("activityWarmDays", 14), "activityWarmDays", "\u5929"));
    host.appendChild(numSetting("\u9057\u5FD8\u51B7\u964D cold \u9608\u503C activityColdDays", "warm\u2192cold \u65E0\u547D\u4E2D\u5929\u6570\uFF08\u7F3A\u7701 44 = warm+30\uFF09", gVal("activityColdDays", 44), "activityColdDays", "\u5929"));
    host.appendChild(numSetting("\u9057\u5FD8\u5019\u9009 archive \u9608\u503C activityArchiveDays", "cold \u540E\u8D85\u6B64\u5929\u6570\u672A\u547D\u4E2D \u2192 \u9057\u5FD8\u5019\u9009\u6E05\u5355\uFF08\u7F3A\u7701 90\uFF0C\u53EA\u5EFA\u8BAE\u4E0D\u5220\u9664\uFF09", gVal("activityArchiveDays", 90), "activityArchiveDays", "\u5929"));
    host.appendChild(numSetting("\u52A0\u6DF1\u5019\u9009\u547D\u4E2D\u6570 activityHotHits", "\u8FD1 30 \u5929\u547D\u4E2D \u2265 \u6B64\u503C \u2192 \u52A0\u6DF1\u5019\u9009 B\uFF08\u7F3A\u7701 5\uFF0C\u5582\u6DF1\u7761\u5F52\u7EB3\uFF09", gVal("activityHotHits", 5), "activityHotHits", "\u6B21"));
    var pctItem = el("div", "setting-item");
    var pctInfo = el("div", "setting-item-info");
    pctInfo.appendChild(el("div", "setting-item-name", "\u53EC\u56DE\u51B7\u6761\u76EE\u964D\u6743 recallColdFactorPercent"));
    pctInfo.appendChild(el("div", "setting-item-desc", "cold/retired \u5C0F\u8282\u5728\u878D\u5408\u53EC\u56DE\u4E2D\u7684\u964D\u6743\u7CFB\u6570\uFF08\u767E\u5206\u6BD4 \u2192 /100\uFF1B\u7F3A\u7701 35%\uFF0C\u540E\u7AEF\u8303\u56F4\u6821\u9A8C [5,95] \u515C\u5E95\uFF09"));
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
      var v2 = Math.max(5, Math.min(95, raw));
      pctInp.value = String(v2);
      appState.api("/set", { method: "POST", body: JSON.stringify({ key: "recallColdFactorPercent", value: String(v2) }) }).then(function() {
        appState.statusFn("\u2713 recallColdFactorPercent = " + v2 + "%");
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
    appState.api("/inject/preview").then(function(r7) {
      var txt = r7 && r7.text || "";
      if (!txt) {
        injectInfo.textContent = "\u5F53\u524D\u6CE8\u5165\uFF1A\u7A7A\uFF08hot_memory \u5173\u6216\u753B\u50CF/\u8BB0\u5FC6\u4E3A\u7A7A\uFF09";
        return;
      }
      var chars = txt.replace(/\s+/g, "").length;
      var tokens = Math.ceil(chars / 2);
      var lineCount = txt.split("\n").filter(function(l6) {
        return l6.trim().indexOf("- [") === 0;
      }).length;
      injectInfo.textContent = "\u5F53\u524D\u76F4\u63A5\u6CE8\u5165 \u2248 " + tokens + " token\uFF08" + chars + " \u5B57\u7B26 \xB7 \u53CC\u753B\u50CF+\u8BB0\u5FC6\u6307\u9488 " + lineCount + " \u6761\uFF09\u2014\u2014\u6BCF\u8F6E\u968F\u63D0\u793A\u8BCD\u6CE8\u5165";
    }).catch(function() {
      injectInfo.textContent = "";
    });
    host.appendChild(el("div", "sc-h3", "\u6DF1\u7761\u672A\u6D88\u5316\u7B56\u7565"));
    host.appendChild(el("div", "sc-desc", "\u6DF1\u7761\u6BCF\u8F6E\u7528 deepSleepLanded \u5224\u5B9A\u672C\u8F6E\u662F\u5426\u300C\u5DF2\u6D88\u5316\u300D\u3002\u672A\u6D88\u5316\u65F6\u7684\u4E24\u79CD\u53D6\u5411\u5728\u6B64\u5207\u6362\u2014\u2014\u5168\u91CD\u635E\u4FDD\u8BC1\u4E0D\u4E22\u6599\u4F46\u53EF\u80FD\u65E0\u9650\u91CD\u8BD5\uFF1B\u5206\u7EA7\u5728\u8FDE\u8D25\u8FBE\u4E0A\u9650\u540E\u653E\u884C\u5E76\u544A\u8B66\uFF0C\u907F\u514D\u65E0\u9650\u91CD\u8BD5\u70E7 LLM\u3002"));
    host.appendChild(UI.item(
      "\u6DF1\u7761\u672A\u6D88\u5316\u7B56\u7565 deepSleep.failPolicy",
      "\u5168\u91CD\u635E\uFF08retry\uFF09= \u6C38\u4E0D\u653E\u5F03\uFF0C\u672A\u6D88\u5316\u5C31\u4E00\u76F4\u91CD\u635E\u672C\u6279\uFF08\u4FDD\u8BC1\u4E0D\u4E22\u6599\uFF1B\u6750\u6599\u6C38\u4E45\u5931\u8D25\u65F6\u6BCF\u8F6E\u90FD\u4F1A\u91CD\u8BD5\uFF09\uFF1B\u5206\u7EA7\uFF08graded\uFF09= \u8FDE\u7EED\u5931\u8D25\u8FBE N \u8F6E\u540E\u653E\u884C\u6C34\u4F4D\u5E76\u8BB0\u5BA1\u8BA1\u544A\u8B66\uFF08\u907F\u514D\u65E0\u9650\u91CD\u8BD5\u70E7 LLM\uFF09\u3002\u7F3A\u7701 graded\u3002",
      UI.select([
        { value: "retry", label: "\u5168\u91CD\u635E\uFF08\u4E0D\u4E22\u6599\uFF0C\u6C38\u4E0D\u653E\u5F03\uFF09" },
        { value: "graded", label: "\u5206\u7EA7\uFF08\u8FDE\u8D25 N \u8F6E\u540E\u653E\u884C\u5E76\u544A\u8B66\uFF09" }
      ], String(gVal("deepSleepFailPolicy", "graded")), function(v2) {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "deepSleep.failPolicy", value: v2 }) }).then(function() {
          appState.statusFn("\u2713 \u6DF1\u7761\u672A\u6D88\u5316\u7B56\u7565 = " + v2);
        }).catch(appState.failFn);
      }, "deepSleep.failPolicy")
    ));
    var roundsInput = UI.input(String(gVal("deepSleepFailMaxRounds", 3)), function(raw) {
      var n6 = parseInt(raw, 10);
      if (isNaN(n6)) n6 = 3;
      n6 = Math.max(1, Math.min(100, n6));
      roundsInput.value = String(n6);
      appState.api("/set", { method: "POST", body: JSON.stringify({ key: "deepSleep.failPolicyMaxRounds", value: String(n6) }) }).then(function() {
        appState.statusFn("\u2713 \u5206\u7EA7\u7B56\u7565\u8FDE\u8D25\u4E0A\u9650 = " + n6 + " \u8F6E");
      }).catch(appState.failFn);
    }, { type: "number", width: "120px", ariaLabel: "deepSleep.failPolicyMaxRounds" });
    roundsInput.min = "1";
    roundsInput.max = "100";
    roundsInput.step = "1";
    host.appendChild(UI.item(
      "\u5206\u7EA7\u7B56\u7565\u8FDE\u8D25\u4E0A\u9650 deepSleep.failPolicyMaxRounds",
      "\u4EC5\u5728\u300C\u5206\u7EA7\u300D\u7B56\u7565\u4E0B\u751F\u6548\uFF081\u2013100\uFF0C\u7F3A\u7701 3\uFF09\uFF1A\u8FDE\u7EED\u5931\u8D25\u8FBE\u6B64\u8F6E\u6570\u540E\u653E\u884C\u6DF1\u7761\u6C34\u4F4D\u5E76\u8BB0\u4E00\u6761\u5BA1\u8BA1\u544A\u8B66\uFF1B\u5168\u91CD\u635E\u7B56\u7565\u4E0B\u6B64\u9879\u4E0D\u53C2\u4E0E\u5224\u5B9A\u3002",
      roundsInput
    ));
  }
  function renderTogglesModel(host) {
    renderTogglesModelVec(host);
    renderTogglesModelLlm(host);
  }
  function renderTogglesModelVec(host) {
    host.appendChild(el("div", "sc-desc", "\u94FE\u8DEF\u4E0E\u6A21\u578B\u9009\u62E9\uFF1B\u672C\u7EC4\u6539\u52A8\u5199\u5165\u81EA\u6301\u914D\u7F6E\uFF0C\u9700\u91CD\u8F7D\u63D2\u4EF6\u540E\u751F\u6548\u3002"));
    host.appendChild(el("div", "sc-h3", "\u5411\u91CF\u4E0E\u6A21\u578B \xB7 \u5F53\u524D\u94FE\u8DEF"));
    host.appendChild(el("div", "sc-desc", "\u8BED\u4E49\u53EC\u56DE\uFF08vec.ts + bge-m3\uFF09\u8FD0\u884C\u6001\u4E0E\u5F00\u5173\u3002\u6539\u52A8\u5199 ~/.dsh/suite/scheduler.json\uFF0C**\u9700\u91CD\u8F7D\u63D2\u4EF6\u540E\u751F\u6548**\u3002\u672C\u5730 GPU \u96F6 token\uFF1B\u6362\u4E91\u7AEF\u5728\u4E0B\u65B9\u586B baseUrl/model\u3002"));
    var vzone = el("div");
    function refreshVecZone() {
      appState.api("/vector/status2").then(function(s22) {
        vzone.textContent = "";
        var vb = el("div", "sc-ds-badges");
        var st = s22.provider || "off";
        vb.appendChild(UI.dsBadge("provider " + st, Derive.providerKind(st, ["DmlExecutionProvider"])).box);
        vb.appendChild(UI.dsBadge("\u53EC\u56DE\u6A21\u5F0F " + Derive.vecLabel(st), "ended").setTitle("provider \u2192 \u4E2D\u6587\u6A21\u5F0F\u540D\uFF1Afusion=\u878D\u5408 / lexical=\u8BCD\u6CD5 / gpu-ready=\u5C31\u7EEA / off=\u5173").box);
        vb.appendChild(UI.dsBadge("\u7F13\u5B58 " + String(s22.cache && s22.cache.lines || 0) + " \u884C", "ended").box);
        if (s22.stats && s22.stats.queries) {
          vb.appendChild(UI.dsBadge(
            "\u53EC\u56DE " + String(s22.stats.queries) + " \u6B21 \xB7 " + String(s22.stats.lastMode || "") + " \xB7 " + String(s22.stats.lastMs || 0) + "ms",
            "ended"
          ).setTitle("\u6700\u8FD1\u67E5\u8BE2: " + String(s22.stats.lastQuery || "")).box);
        }
        vzone.appendChild(vb);
        var sw = el("input");
        sw.type = "checkbox";
        sw.className = "checkbox-container";
        sw.checked = !!(s22.running && s22.running.enabled);
        sw.addEventListener("change", function() {
          appState.api("/embed/config", { method: "POST", body: JSON.stringify({ embedEnabled: sw.checked }) }).then(function() {
            appState.statusFn("\u2713 \u5411\u91CF " + (sw.checked ? "\u5F00" : "\u5173") + "\uFF08\u91CD\u8F7D\u540E\u751F\u6548\uFF09");
          }).catch(function(e8) {
            appState.failFn(e8);
            sw.checked = !sw.checked;
          });
        });
        vzone.appendChild(UI.item("\u8BED\u4E49\u53EC\u56DE\u5F00\u5173 embedEnabled", "\u5F00=\u878D\u5408\u53EC\u56DE\uFF08dense0.7+lexical0.3\uFF09\uFF1B\u5173=\u7EAF\u8BCD\u6CD5\u3002\u5199 scheduler.json", sw));
        var curUrl = s22.running && s22.running.baseUrl || "http://127.0.0.1:11434/v1";
        var curModel = s22.running && s22.running.model || "bge-m3";
        var curKeyEnv = s22.running && s22.running.apiKeyEnv || "EMBED_API_KEY";
        var EMBED_PROVIDERS = [
          { id: "ollama", name: "Ollama\uFF08\u672C\u673A\u7F3A\u7701\uFF09", base: "http://127.0.0.1:11434/v1" },
          { id: "bge", name: "\u81EA\u5EFA bge-m3 \u6865\uFF08\u53EF\u9009\uFF09", base: "http://127.0.0.1:9915/v1", noEnum: true },
          { id: "lmstudio", name: "LM Studio", base: "http://127.0.0.1:1234/v1" },
          { id: "custom", name: "\u81EA\u5B9A\u4E49 OpenAI \u517C\u5BB9\uFF08\u4E91\u7AEF\uFF09", base: "" }
        ];
        var provWrap = el("div", "sc-prov-btns");
        EMBED_PROVIDERS.forEach(function(p4) {
          var card = el("button", "sc-btn" + (curUrl.indexOf(p4.base) === 0 && p4.base ? " on" : ""), p4.name);
          card.type = "button";
          card.addEventListener("click", function() {
            uInp.value = p4.base;
            var all = provWrap.querySelectorAll("button");
            all.forEach(function(b3) {
              b3.classList.remove("on");
            });
            card.classList.add("on");
            if (p4.id === "custom") {
              uInp.value = "";
              uInp.focus();
            }
            enumModels();
          });
          provWrap.appendChild(card);
        });
        vzone.appendChild(UI.item("\u8BED\u4E49\u68C0\u7D22\u6765\u6E90", "\u9009\u670D\u52A1 \u2192 \u81EA\u52A8\u586B\u5730\u5740 \u2192 \u4E0B\u65B9\u81EA\u52A8\u63A2\u6D4B\u5E76\u5217\u51FA\u53EF\u7528\u6A21\u578B\uFF08\u6D4F\u89C8\u5668\u76F4\u8FDE\uFF09\u3002\u6362\u670D\u52A1/\u6A21\u578B\u540E\u8BF7\u70B9\u300C\u6E05\u7F13\u5B58\u91CD\u5EFA\u300D\u3002", null, { children: [provWrap] }));
        var urlWrap = el("div", "sc-col-end");
        var uInp = el("input", "sc-input sc-w-xl");
        uInp.value = curUrl;
        uInp.placeholder = "http://127.0.0.1:11434/v1";
        var dlist = el("datalist");
        dlist.id = "sc-embed-endpoints";
        ["http://127.0.0.1:11434/v1", "http://localhost:11434/v1", "http://127.0.0.1:9915/v1", "http://127.0.0.1:1234/v1", "https://api.openai.com/v1", "https://api.deepseek.com/v1"].forEach(function(ep) {
          var o9 = el("option");
          o9.value = ep;
          dlist.appendChild(o9);
        });
        document.body.appendChild(dlist);
        uInp.setAttribute("list", "sc-embed-endpoints");
        var mSel = el("select", "sc-input sc-w-xl");
        mSel.title = "embedModel";
        var kInp = el("input", "sc-input sc-w-md");
        kInp.value = curKeyEnv;
        kInp.title = "embedApiKeyEnv";
        kInp.placeholder = "key \u73AF\u5883\u53D8\u91CF\u540D\uFF08\u672C\u5730\u514D\u586B\uFF09";
        var probeHint = el("div", "sc-mem-sub muted");
        probeHint.classList.add("sc-max-xl");
        urlWrap.appendChild(uInp);
        urlWrap.appendChild(mSel);
        urlWrap.appendChild(kInp);
        urlWrap.appendChild(probeHint);
        vzone.appendChild(UI.item("\u670D\u52A1\u5730\u5740\uFF08OpenAI \u517C\u5BB9 /v1 \u6839\uFF09", "\u5982 http://127.0.0.1:11434/v1\uFF08Ollama\uFF09\u6216 http://127.0.0.1:9915/v1\uFF08\u81EA\u5EFA\u6865\uFF09\uFF1B\u6539\u5B8C\u56DE\u8F66\u81EA\u52A8\u63A2\u6D4B\u3002", null, { children: [urlWrap] }));
        var saveWrap = el("div", "sc-vec-actions");
        var probeBtn = el("button", "sc-btn subtle", "\u91CD\u65B0\u63A2\u6D4B");
        probeBtn.type = "button";
        probeBtn.classList.add("sc-btn-xs");
        probeBtn.addEventListener("click", enumModels);
        var saveBtn = el("button", "sc-btn", "\u4FDD\u5B58\u914D\u7F6E");
        saveBtn.type = "button";
        saveBtn.classList.add("sc-btn-xs");
        saveBtn.addEventListener("click", function() {
          saveBtn.disabled = true;
          saveBtn.textContent = "\u4FDD\u5B58\u4E2D\u2026";
          appState.api("/embed/config", { method: "POST", body: JSON.stringify({ embedBaseUrl: uInp.value.trim(), embedModel: mSel.value || curModel, embedApiKeyEnv: kInp.value.trim() || "EMBED_API_KEY" }) }).then(function() {
            appState.statusFn("\u2713 \u5DF2\u4FDD\u5B58\uFF08\u91CD\u8F7D\u540E\u751F\u6548\u2014\u2014\u82E5\u6362\u4E86\u670D\u52A1/\u6A21\u578B\u8BF7\u70B9\u300C\u6E05\u7F13\u5B58\u91CD\u5EFA\u300D\uFF09");
            saveBtn.disabled = false;
            saveBtn.textContent = "\u4FDD\u5B58\u914D\u7F6E";
          }).catch(function(e8) {
            saveBtn.disabled = false;
            saveBtn.textContent = "\u4FDD\u5B58\u914D\u7F6E";
            appState.failFn(e8);
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
          opt.textContent = placeholder || "\u9009\u62E9\u6A21\u578B\u2026";
          mSel.appendChild(opt);
        }
        function enumModels() {
          var b3 = uInp.value.trim().replace(/\/+$/, "");
          var root = b3.replace(/\/v1$/, "");
          probeDone = false;
          if (!root) {
            setSelectState(true, "\u5148\u586B\u5199\u670D\u52A1\u5730\u5740");
            probeHint.textContent = "";
            return;
          }
          try {
            var u4 = new URL(root);
            if (u4.protocol !== "http:" && u4.protocol !== "https:") throw new Error("x");
          } catch (e8) {
            setSelectState(true, "URL \u65E0\u6548");
            probeHint.textContent = "\u9700 http(s):// \u5F00\u5934";
            return;
          }
          if (probing) return;
          probing = true;
          setSelectState(true, "\u52A0\u8F7D\u53EF\u7528\u6A21\u578B\u4E2D\u2026");
          probeHint.textContent = "";
          var finish = function(models, mode, note) {
            if (probeDone) return;
            probeDone = true;
            probing = false;
            if (Derive.has(models)) {
              mSel.disabled = false;
              mSel.textContent = "";
              models.forEach(function(md) {
                var o9 = el("option");
                o9.value = md.id;
                o9.textContent = md.id + (isEmbedLike(md.id) ? "\uFF08\u5D4C\u5165\uFF09" : "");
                if (md.id === curModel) o9.selected = true;
                mSel.appendChild(o9);
              });
              probeHint.textContent = "\u2713 " + models.length + " \u4E2A\u6A21\u578B \xB7 " + (mode || "") + (note ? " \xB7 " + note : "");
            } else {
              setSelectState(true, "\uFF08\u65E0\u53EF\u679A\u4E3E\u6A21\u578B\uFF09");
              probeHint.textContent = note || "\u672A\u63A2\u6D4B\u5230\u6A21\u578B";
            }
          };
          fetch(root + "/v1/models", { signal: AbortSignal.timeout(6e3) }).then(function(r7) {
            if (!r7.ok) throw new Error("HTTP " + r7.status);
            return r7.json();
          }).then(function(j2) {
            var models = (j2 && j2.data || []).map(function(m3) {
              return { id: m3.id };
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
        function isEmbedLike(id3) {
          return /embed|bge|m3|nomic|e5|text-embed/i.test(String(id3));
        }
        function probeHealth(root, finish) {
          fetch(root + "/health", { signal: AbortSignal.timeout(5e3) }).then(function(r7) {
            if (!r7.ok) throw new Error("x");
            return r7.json();
          }).then(function(j2) {
            var fixed = j2 && j2.model || "bge-m3";
            finish([{ id: fixed }], "health-fixed", "\u670D\u52A1\u5728\u4F46\u65E0 /models\u2014\u2014\u7528\u56FA\u5B9A " + fixed + (j2 && j2.dims ? "\uFF08" + j2.dims + "d\uFF09" : ""));
          }).catch(function() {
            if (!probeDone) {
              probeDone = true;
              probing = false;
            }
            setSelectState(true, "\uFF08\u8FDE\u63A5\u5931\u8D25\uFF09");
            probeHint.textContent = "\u65E0\u6CD5\u8FDE\u63A5\u8BE5\u670D\u52A1\uFF08/v1/models \u4E0E /health \u5747\u65E0\u54CD\u5E94\uFF09\u2014\u2014\u68C0\u67E5\u5730\u5740/\u670D\u52A1\u662F\u5426\u5728\u8DD1/CORS";
          });
        }
        uInp.addEventListener("change", function() {
          enumModels();
        });
        probeHint.textContent = curModel ? "\u5F53\u524D\uFF1A" + curModel + " @ " + curUrl : "";
        enumModels();
        var clearRow = el("div", "setting-item");
        var clearInfo = el("div", "setting-item-info");
        clearInfo.appendChild(el("div", "setting-item-name", "\u5411\u91CF\u7F13\u5B58"));
        clearInfo.appendChild(el("div", "setting-item-desc", "\u7F13\u5B58\u6309 \u6A21\u578B+\u884C\u6587\u672C+\u5730\u5740 \u6307\u7EB9\u547D\u4E2D\uFF1B\u6362\u6A21\u578B/\u6539\u4E91\u7AEF\u540E\u70B9\u300C\u6E05\u7F13\u5B58\u91CD\u5EFA\u300D\uFF0C\u4E0B\u6B21\u53EC\u56DE\u6309\u65B0\u6A21\u578B\u81EA\u52A8\u91CD\u5D4C\uFF08\u5F53\u524D " + String(s22.cache && s22.cache.lines || 0) + " \u884C\u8584\u884C\uFF0C~\u79D2\u7EA7\uFF09"));
        clearRow.appendChild(clearInfo);
        var clearBtn = UI.button("\u6E05\u7F13\u5B58\u91CD\u5EFA", function() {
          return appState.api("/vector/cache/clear", { method: "POST", body: "{}" }).then(function(r7) {
            appState.statusFn("\u2713 \u5411\u91CF\u7F13\u5B58\u5DF2\u6E05" + (r7 && r7.removed ? "\uFF08\u5220\u9664 " + r7.removed + "\uFF09" : "") + "\u2014\u2014\u4E0B\u6B21\u53EC\u56DE\u6309\u5F53\u524D\u6A21\u578B\u81EA\u52A8\u91CD\u5D4C");
          });
        }, { danger: true, async: true, busyText: "\u6E05\u7406\u4E2D\u2026", okText: "\u5411\u91CF\u7F13\u5B58\u5DF2\u6E05", confirm: "\u6E05\u7A7A\u5411\u91CF\u7F13\u5B58\u5E76\u91CD\u5EFA\uFF1F\u6362\u6A21\u578B\u540E\u5FC5\u987B\u6267\u884C\uFF08\u5426\u5219\u65E7\u5411\u91CF\u6DF7\u7528\u5BFC\u81F4\u8BED\u4E49\u5931\u771F\uFF09\u3002" });
        var clearCtl = el("div", "setting-item-control");
        clearCtl.appendChild(clearBtn);
        clearRow.appendChild(clearCtl);
        vzone.appendChild(clearRow);
        if (Derive.providerDown(st)) {
          var guide = el("div");
          guide.appendChild(el("div", "sc-mem-group-title", "\u5982\u4F55\u542F\u7528\u8BED\u4E49\u68C0\u7D22"));
          var g1 = el("div", "setting-item");
          var g1i = el("div", "setting-item-info");
          g1i.appendChild(el("div", "setting-item-name", "\u65B9\u6848 A \xB7 \u672C\u5730 GPU \u670D\u52A1\uFF08\u63A8\u8350\uFF0C\u96F6 token \u6210\u672C\uFF09"));
          g1i.appendChild(el("div", "setting-item-desc", "\u9700\u81EA\u5907\u5D4C\u5165\u670D\u52A1\uFF08OpenAI \u517C\u5BB9 /v1/embeddings\uFF09\uFF1AOllama\uFF08ollama pull bge-m3\uFF0C:11434\uFF09\u6216\u81EA\u5EFA bge-m3 \u6865\uFF08:9915\uFF09\u3002\u5F53\u524D\u68C0\u6D4B\u4E0D\u53EF\u8FBE\u3002"));
          g1.appendChild(g1i);
          guide.appendChild(g1);
          var g2 = el("div", "setting-item");
          var g2i = el("div", "setting-item-info");
          g2i.appendChild(el("div", "setting-item-name", "\u65B9\u6848 B \xB7 \u4E91\u7AEF API"));
          g2i.appendChild(el("div", "setting-item-desc", "\u624B\u5199 ~/.dsh/suite/scheduler.json\uFF1AembedBaseUrl=\u4E91\u7AEF\u7AEF\u70B9 + embedModel=\u6A21\u578B\u540D + embedApiKeyEnv=key \u73AF\u5883\u53D8\u91CF\u540D\uFF1B\u6539\u540E\u91CD\u8F7D\u5E76\u300C\u6E05\u7F13\u5B58\u91CD\u5EFA\u300D\u3002"));
          g2.appendChild(g2i);
          guide.appendChild(g2);
          guide.appendChild(el("div", "sc-desc", "\u672A\u914D\u7F6E\u65F6\u81EA\u52A8\u8BCD\u6CD5\u53EC\u56DE\uFF08\u53EF\u7528\u4F46\u65E0\u8BED\u4E49\uFF09\uFF1B\u914D\u7F6E\u540E\u672C\u9875 provider \u53D8\u5C31\u7EEA\u3002"));
          vzone.appendChild(guide);
        }
      }).catch(function(e8) {
        vzone.textContent = "";
        vzone.appendChild(el("div", "sc-desc", "\u5411\u91CF\u72B6\u6001\u4E0D\u53EF\u7528: " + e8.message));
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
      } catch (e8) {
      }
    }, 3e4);
  }
  function renderTogglesModelLlm(host) {
    host.appendChild(el("div", "sc-h3", "\u84B8\u998F / \u6DF1\u7761\u6A21\u578B"));
    host.appendChild(el("div", "sc-desc", "\u84B8\u998F\u4E0E\u6DF1\u5EA6\u7761\u7720\u5404\u81EA\u53EF\u9009\u5BBF\u4E3B\u6A21\u578B\uFF08\u76F4\u63A5\u7528 DeepSeek Harness \u6A21\u578B\u2014\u2014\u5148\u5728 Harness \u914D\u7F6E\u597D\u6A21\u578B\uFF0C\u8FD9\u91CC\u4E0B\u62C9\u9009\u5373\u53EF\uFF09\u3002\u300C\u7EE7\u627F\u4E3B\u4F1A\u8BDD\u300D= \u4E0D\u6307\u5B9A\uFF0C\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\u3002\u6539\u52A8\u5199 scheduler.json\uFF0C\u9700\u91CD\u8F7D\u751F\u6548\u3002"));
    var llmCard = el("div");
    var hostModels = null;
    var llmVal = {};
    function renderLlmSelect(container, keyP, keyM, label, desc) {
      var item = el("div", "setting-item");
      var info = el("div", "setting-item-info");
      info.appendChild(el("div", "setting-item-name", label));
      info.appendChild(el("div", "setting-item-desc", desc));
      item.appendChild(info);
      var wrap = el("div", "sc-row");
      var sel = el("select", "sc-input sc-w-lg");
      sel.title = keyP + "/" + keyM;
      var inherit = (llmVal[keyP] || "") === "";
      function rebuild() {
        sel.textContent = "";
        var optMain = el("option");
        optMain.value = "";
        optMain.textContent = "\u8DDF\u968F\u4E3B\u6A21\u578B\uFF08\u9ED8\u8BA4\uFF09";
        optMain.selected = inherit;
        sel.appendChild(optMain);
        var seen = {};
        (hostModels || []).forEach(function(m3) {
          var combo = m3.provider + "/" + m3.id;
          if (!seen[combo]) {
            seen[combo] = 1;
            var o9 = el("option");
            o9.value = combo;
            o9.textContent = combo;
            if (!inherit && m3.provider === llmVal[keyP] && m3.id === llmVal[keyM]) o9.selected = true;
            sel.appendChild(o9);
          }
        });
        if (!sel.value) sel.value = "";
      }
      sel.addEventListener("change", function() {
        var v2 = sel.value;
        var patch = {};
        if (!v2) {
          patch[keyP] = "";
          patch[keyM] = "";
          llmVal[keyP] = "";
          llmVal[keyM] = "";
        } else {
          var sp = v2.indexOf("/");
          var prov = v2.slice(0, sp), model = v2.slice(sp + 1);
          patch[keyP] = prov;
          patch[keyM] = model;
          llmVal[keyP] = prov;
          llmVal[keyM] = model;
        }
        appState.api("/distill/config", { method: "POST", body: JSON.stringify(patch) }).then(function() {
          appState.statusFn("\u2713 " + label + " \u5DF2\u8BBE" + (v2 ? "\uFF1A" + v2 : "\uFF08\u8DDF\u968F\u4E3B\u6A21\u578B\uFF09") + "\u2014\u2014\u91CD\u8F7D\u540E\u751F\u6548");
        }).catch(appState.failFn);
      });
      rebuild();
      wrap.appendChild(sel);
      item.appendChild(wrap);
      container.appendChild(item);
    }
    function renderLlmCard() {
      llmCard.textContent = "";
      renderLlmSelect(llmCard, "distillProvider", "distillModel", "\u84B8\u998F\u6A21\u578B", "\u4E8B\u4EF6\u84B8\u998F\uFF08\u4F1A\u8BDD\u95F2\u7F6E\u63D0\u70BC\u53EF\u590D\u7528\u77E5\u8BC6\uFF09\u7528\u7684\u6A21\u578B\u3002\u7EE7\u627F=\u8DDF\u968F\u4E3B\u4F1A\u8BDD\u3002");
      renderLlmSelect(llmCard, "sleepProvider", "sleepModel", "\u6DF1\u7761\u5F52\u7EB3\u6A21\u578B", "\u6DF1\u5EA6\u7761\u7720\uFF08\u79BB\u7EBF\u56DE\u60F3\u63D0\u70BC [\u539F\u5219]/[\u8DEF\u5F84] \u753B\u50CF\u6210\u957F\uFF09\u7528\u7684\u6A21\u578B\u3002\u7EE7\u627F=\u8DDF\u968F\u4E3B\u4F1A\u8BDD\u3002");
      var note = el("div", "sc-mem-sub muted");
      note.textContent = hostModels ? "\u5BBF\u4E3B\u53EF\u7528 " + hostModels.length + " \u4E2A\u6A21\u578B" : "\u8BFB\u53D6\u5BBF\u4E3B\u6A21\u578B\u2026";
      llmCard.appendChild(note);
    }
    appState.api("/llm/models").then(function(r7) {
      hostModels = r7 && r7.models || [];
      llmCard.textContent = "";
      return appState.api("/distill/config").then(function(d3) {
        var run = d3 && d3.running || {}, p4 = d3 && d3.persisted || {};
        llmVal.distillProvider = run.distillProvider != null ? run.distillProvider : p4.distillProvider || "";
        llmVal.distillModel = run.distillModel != null ? run.distillModel : p4.distillModel || "";
        llmVal.sleepProvider = run.sleepProvider != null ? run.sleepProvider : p4.sleepProvider || "";
        llmVal.sleepModel = run.sleepModel != null ? run.sleepModel : p4.sleepModel || "";
        renderLlmCard();
      });
    }).catch(function() {
      llmCard.appendChild(el("div", "sc-desc", "\u26A0 \u5BBF\u4E3B\u6A21\u578B\u4E0D\u53EF\u7528"));
    });
    host.appendChild(llmCard);
  }
  function renderTogglesSched(host, g2) {
    function gVal(key, fallback2) {
      return g2[key] !== void 0 && g2[key] !== null ? g2[key] : fallback2;
    }
    host.appendChild(el("div", "sc-desc", "\u9AD8\u7EA7\u9879\uFF1A\u84B8\u998F\u8282\u6D41 / \u53EC\u56DE\u4E0E\u5E93\u7248\u672C / \u8BA4\u77E5\u73AF\uFF1B\u6539\u540E\u9700\u91CD\u8F7D\u751F\u6548\u3002"));
    host.appendChild(el("div", "sc-h3", "\u84B8\u998F\u8282\u6D41\uFF08\u8FD0\u884C\u65F6\u901A\u9053\uFF09"));
    var dDesc = el("div", "sc-desc", "\u5199\u5165\u81EA\u6301\u914D\u7F6E ~/.dsh/suite/scheduler.json\uFF08\u6DF1\u5EA6\u7761\u7720\u540C\u901A\u9053\uFF09\u3002\u6539\u52A8\u4E0D\u4F1A\u7ACB\u523B\u4F5C\u7528\u5230\u5728\u8DD1\u7684\u4F1A\u8BDD\u2014\u2014**\u9700\u91CD\u8F7D\u63D2\u4EF6\u540E\u751F\u6548**\u3002\u5F53\u524D\u503C\u8BFB\u53D6\u4E2D\u2026");
    host.appendChild(dDesc);
    var dZone = el("div");
    dZone.appendChild(el("div", "sc-desc", "\u8BFB\u53D6\u4E2D\u2026"));
    host.appendChild(dZone);
    host.appendChild(el("div", "sc-h3", "\u53EC\u56DE\u4E0E\u5E93\u7248\u672C"));
    var fusRow = el("div", "setting-item");
    var fusInfo = el("div", "setting-item-info");
    fusInfo.appendChild(el("div", "setting-item-name", "\u53EC\u56DE\u878D\u5408\u7B56\u7565 recallFusion"));
    fusInfo.appendChild(el("div", "setting-item-desc", "rrf=\u6392\u540D\u878D\u5408\uFF08\u7F3A\u7701\uFF0C\u5BF9\u79BB\u7FA4\u5206\u7A33\u5065\uFF09\uFF1Bweighted=\u65E7 min-max \u52A0\u6743\uFF08\u56DE\u6EDA\u7528\uFF09\u3002\u9608\u503C\u53E3\u5F84\u4E0E\u878D\u5408\u89E3\u8026\u2014\u2014\u59CB\u7EC8\u7528\u7EDD\u5BF9\u4F59\u5F26\uFF08ACT-024\uFF09"));
    fusInfo.appendChild(appState.metaBadges("recallFusion"));
    var fusRowCtrl = el("div", "sc-persona-slider");
    var FUS_TIERS = [["rrf", "RRF"], ["weighted", "\u52A0\u6743"]];
    var fusMode = String(gVal("recallFusion", "rrf"));
    FUS_TIERS.forEach(function(tier) {
      var cell = el("button", "sc-persona-cell" + (tier[0] === fusMode ? " active" : ""));
      cell.type = "button";
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", tier[0] === fusMode ? "true" : "false");
      cell.textContent = tier[1];
      cell.title = "recallFusion = " + tier[0] + "\uFF08\u9700\u91CD\u8F7D\u751F\u6548\uFF09";
      cell.onclick = function() {
        appState.api("/set", { method: "POST", body: JSON.stringify({ key: "recallFusion", value: tier[0] }) }).then(function() {
          appState.statusFn("\u2713 recallFusion = " + tier[0] + "\uFF08\u9700\u91CD\u8F7D\u63D2\u4EF6\u751F\u6548\uFF09");
          fusRowCtrl.querySelectorAll(".sc-persona-cell").forEach(function(c5) {
            c5.classList.remove("active");
            c5.setAttribute("aria-checked", "false");
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
    host.appendChild(appState.makeToggle("bankGit", "\u8BB0\u5FC6\u5E93 git \u7248\u672C\u5316 bankGit", "\u6BCF\u6B21\u6210\u529F\u5199\u5165\u540E\u63D0\u4EA4\u5E93\u5FEB\u7167\uFF08\u53EF diff/revert\uFF1B\u5E93\u5728 ~/.dsh \u4E0B\uFF0C\u4E0D\u5165\u516C\u5F00\u6811\uFF09\u3002\u7F3A\u7701\u5F00", gVal("bankGit", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn("\u2713 \u5DF2\u5207\u6362 " + key + "\uFF08\u9700\u91CD\u8F7D\u751F\u6548\uFF09");
      }).catch(function(e8) {
        appState.failFn(e8);
        sw.checked = !sw.checked;
      });
    }));
    host.appendChild(el("div", "sc-h3", "\u8BA4\u77E5\u73AF\uFF08MCL \xB7 \u719F\u6089\u5EA6\u5206\u6D41 + \u6709\u754C\u518D\u5F15\u5BFC\uFF09"));
    host.appendChild(appState.makeToggle("mclEnabled", "\u542F\u7528\u8BA4\u77E5\u73AF mclEnabled", "\u6162\u901A\u9053\u9996\u6B65\u6CE8\u5165\u300C\u8584\u5951\u7EA6 + top-k \u6307\u9488\u300D\u5E76\u6309\u9700\u518D\u5F15\u5BFC\u4E00\u6B21\uFF1B\u5FEB\u901A\u9053\u96F6\u989D\u5916\u5F80\u8FD4\u3002\u7F3A\u7701\u5F00\uFF08false = \u4E00\u952E\u56DE\u6EDA\uFF09", gVal("mclEnabled", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn("\u2713 \u5DF2\u5207\u6362 " + key + "\uFF08\u9700\u91CD\u8F7D\u751F\u6548\uFF09");
      }).catch(function(e8) {
        appState.failFn(e8);
        sw.checked = !sw.checked;
      });
    }));
    host.appendChild(numSetting("\u719F\u6089\u5EA6\u9608\u503C mclFamiliarThreshold", "\u300C\u7528\u6237\u6587\u672C \u2194 \u547D\u4E2D\u7D22\u5F15\u884C\u300D\u7684\u7EDD\u5BF9\u4F59\u5F26\u9608\u503C\uFF080\u20131\uFF0C\u7F3A\u7701 0.65\uFF1BACT-024 \u6821\u51C6\uFF1A0.65 \u2192 \u89E6\u53D1\u7387 ~2% \u4E14\u9608\u4E0A\u5168\u4E3A\u771F\u547D\u4E2D\uFF09", gVal("mclFamiliarThreshold", 0.65), "mclFamiliarThreshold", "", 0.01));
    host.appendChild(numSetting("\u518D\u5F15\u5BFC\u4E0A\u9650 mclMaxNudges", "\u6162\u901A\u9053\u6700\u591A\u518D\u5F15\u5BFC\u6B21\u6570\uFF080\u20133\uFF0C\u7F3A\u7701 1\uFF1B\u7EDD\u4E0D\u6B7B\u9501\uFF09", gVal("mclMaxNudges", 1), "mclMaxNudges", "\u6B21", 1));
    host.appendChild(numSetting("\u6750\u6599\u9884\u7B97 mclBudgetChars", "\u6162\u901A\u9053\u6750\u6599\u786C\u9884\u7B97\uFF08120\u20134000 \u5B57\u7B26\uFF0C\u7F3A\u7701 600\uFF1B\u53EA\u4F5C\u7528\u4E8E\u6162\u901A\u9053\u9996\u6B65\uFF09", gVal("mclBudgetChars", 600), "mclBudgetChars", "\u5B57\u7B26", 50));
    host.appendChild(numSetting("\u6307\u9488\u6761\u6570 mclTopK", "\u6162\u901A\u9053\u6CE8\u5165\u7684\u6307\u9488\u6761\u6570\uFF081\u20135\uFF0C\u7F3A\u7701 3\uFF09", gVal("mclTopK", 3), "mclTopK", "\u6761", 1));
    host.appendChild(appState.makeToggle("mclAudit", "\u8BA4\u77E5\u73AF\u5BA1\u8BA1\u6D41 mclAudit", "\u6BCF\u6B65\u4E00\u884C\u5199 suite/knowledge/audit/mcl-audit.jsonl\uFF08\u901A\u9053/\u719F\u6089\u5EA6/\u6CE8\u5165/\u518D\u5F15\u5BFC/\u5408\u89C4\uFF09", gVal("mclAudit", true) !== false, function(key, sw) {
      appState.api("/toggle", { method: "POST", body: JSON.stringify({ key }) }).then(function() {
        appState.statusFn("\u2713 \u5DF2\u5207\u6362 " + key + "\uFF08\u9700\u91CD\u8F7D\u751F\u6548\uFF09");
      }).catch(function(e8) {
        appState.failFn(e8);
        sw.checked = !sw.checked;
      });
    }));
    function distillSave(patch, onFail) {
      return appState.api("/distill/config", { method: "POST", body: JSON.stringify(patch) }).then(function() {
        appState.statusFn("\u2713 \u5DF2\u5199\u5165 " + Object.keys(patch).join(",") + "\uFF08\u91CD\u8F7D\u540E\u751F\u6548\uFF09");
      }).catch(function(e8) {
        appState.failFn(e8);
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
        inp.placeholder = "\u7559\u7A7A=\u7EE7\u627F\u4E3B\u4F1A\u8BDD\u6A21\u578B";
        inp.className = "sc-input sc-w-sm";
      }
      var unitEl = el("span", "sc-range-label", kind === "minutes" ? "\u5206\u949F" : kind === "chars" ? "\u5B57\u7B26" : "");
      inp.onchange = function() {
        var v2;
        if (kind === "text") v2 = inp.value.trim();
        else v2 = Math.max(kind === "minutes" ? min || 1 : 0, parseInt(inp.value, 10) || 0);
        var patch = {};
        patch[key] = kind === "minutes" ? v2 * 6e4 : v2;
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
    appState.api("/distill/config").then(function(d3) {
      var r7 = d3 && d3.running || {};
      var p4 = d3 && d3.persisted || {};
      function val(k2, dflt) {
        return r7[k2] != null ? r7[k2] : p4[k2] != null ? p4[k2] : dflt;
      }
      var curModelTxt = (function() {
        var dp = val("distillProvider", ""), dm = val("distillModel", "");
        return dp && dm ? dp + "/" + dm : "\u7EE7\u627F\u4E3B\u4F1A\u8BDD";
      })();
      dDesc.textContent = "\u5199\u5165\u81EA\u6301\u914D\u7F6E ~/.dsh/suite/scheduler.json\uFF08\u6DF1\u5EA6\u7761\u7720\u540C\u901A\u9053\uFF09\u3002\u6539\u52A8\u4E0D\u4F1A\u7ACB\u523B\u4F5C\u7528\u5230\u5728\u8DD1\u7684\u4F1A\u8BDD\u2014\u2014**\u9700\u91CD\u8F7D\u63D2\u4EF6\u540E\u751F\u6548**\u3002\u5F53\u524D\uFF1A\u84B8\u998F " + (val("enableDistill", true) ? "\u5F00" : "\u5173") + " / \u7A7A\u95F2 " + Math.round(val("idleWakeMs", 6e5) / 6e4) + " \u5206\u949F / \u672C\u8F6E\u6700\u5C11 " + val("minTurnChars", 200) + " \u5B57\u7B26 / \u9884\u7B5B " + (val("distillPrescan", true) ? "\u5F00" : "\u5173") + " / \u84B8\u998F\u6A21\u578B " + curModelTxt + "\u3002";
      dZone.textContent = "";
      dZone.appendChild(distillToggle("enableDistill", "\u5B88\u85CF\u84B8\u998F\u5668 enableDistill", "\u5173=\u4E0D\u6CE8\u518C\u84B8\u998F\u5668\uFF08/suite \u7B49\u53EA\u8BFB\u89C6\u56FE\u4ECD\u53EF\u7528\uFF09\uFF1B\u6539\u52A8\u9700\u91CD\u8F7D\u751F\u6548", val("enableDistill", true)));
      dZone.appendChild(distillToggle("distillPrescan", "\u96F6\u6210\u672C\u9884\u7B5B distillPrescan", "spawn \u524D\u5148\u626B\u589E\u91CF\u4FE1\u53F7\u8BCD + pending \u5019\u9009\uFF0C\u7686\u65E0\u5219\u8DF3\u8FC7\uFF08\u4E0D\u5524\u9192 LLM\uFF0C\u7701\u6210\u672C\uFF09", val("distillPrescan", true)));
      dZone.appendChild(distillInput("idleWakeMs", "\u7A7A\u95F2\u5524\u9192 idleWakeMs", "turn \u7ED3\u675F\u540E\u7A7A\u95F2\u6EE1\u6B64\u65F6\u957F\u624D\u84B8\u998F\uFF08\u22651 \u5206\u949F\uFF0C\u9ED8\u8BA4 10 \u5206\u949F\uFF09", Math.round(val("idleWakeMs", 6e5) / 6e4), "minutes", 1));
      dZone.appendChild(distillInput("minTurnChars", "\u672C\u8F6E\u6700\u5C11\u5B57\u7B26 minTurnChars", "\u672C\u8F6E\u65B0\u589E\u6B63\u6587\u5C11\u4E8E\u6B64\u503C\u8DF3\u8FC7\u84B8\u998F\uFF08\u6C34\u4F4D\u4ECD\u63A8\u8FDB\uFF1B0=\u4E0D\u8BBE\u9650\uFF0C\u9ED8\u8BA4 200\uFF09", val("minTurnChars", 200), "chars"));
      var pendRow = el("div", "setting-item");
      var pendInfo = el("div", "setting-item-info");
      pendInfo.appendChild(el("div", "setting-item-name", "\u7ACB\u5373\u5904\u7406 pending \u5019\u9009"));
      pendInfo.appendChild(el("div", "setting-item-desc", "\u624B\u52A8\u89E6\u53D1\u4E00\u8F6E\u84B8\u998F\u2014\u2014\u643A\u5E26 pending/ \u5019\u9009\uFF08\u5982 project-defer \u964D\u7EA7\u5361\uFF09\u91CD\u88C1\u51B3\u5165\u518C\u3002workspace \u53CD\u89E3\u4FEE\u590D\u540E project \u5361\u76F4\u5199\u5DE5\u4F5C\u533A devref\u3002"));
      pendRow.appendChild(pendInfo);
      var pendBtn = el("button", "sc-btn subtle", "\u7ACB\u5373\u84B8\u998F\u4E00\u6B21");
      pendBtn.type = "button";
      pendBtn.classList.add("sc-btn-xs");
      pendBtn.addEventListener("click", function() {
        pendBtn.disabled = true;
        pendBtn.textContent = "\u84B8\u998F\u4E2D\u2026\uFF08\u7EA6 1-2 \u5206\u949F\uFF09";
        appState.api("/distill/run", { method: "POST", body: "{}" }).then(function(rr) {
          pendBtn.disabled = false;
          pendBtn.textContent = "\u7ACB\u5373\u84B8\u998F\u4E00\u6B21";
          if (rr && rr.ok) appState.statusFn("\u2713 " + (rr.note || "\u84B8\u998F\u5B8C\u6210"));
          else appState.statusFn("\u26A0 " + (rr && rr.note || "\u84B8\u998F\u672A\u89E6\u53D1") + "\u2014\u2014\u6839\u4F1A\u8BDD\u6D3B\u8DC3\u4E2D\u4F1A\u8DF3\u8FC7\uFF0C\u7B49\u95F2\u7F6E\u81EA\u52A8\u8DD1");
        }).catch(function(e8) {
          pendBtn.disabled = false;
          pendBtn.textContent = "\u7ACB\u5373\u84B8\u998F\u4E00\u6B21";
          appState.failFn(e8);
        });
      });
      var pendCtl = el("div", "setting-item-control");
      pendCtl.appendChild(pendBtn);
      pendRow.appendChild(pendCtl);
      dZone.appendChild(pendRow);
      if (d3 && d3.active === false) {
        dZone.appendChild(el("div", "sc-desc", "\u26A0 \u8C03\u5EA6\u5668\u672A\u5C31\u7EEA\uFF1A\u663E\u793A\u503C\u4E3A\u6301\u4E45\u6587\u4EF6\u503C\uFF0C\u8FD0\u884C\u65F6\u503C\u9700\u63D2\u4EF6\u6FC0\u6D3B\u540E\u8BFB\u53D6"));
      }
    }).catch(function(e8) {
      dZone.textContent = "";
      dZone.appendChild(el("div", "sc-desc", "\u26A0 \u8BFB\u53D6\u5931\u8D25\uFF1A" + e8.message));
    });
  }

  // src-client/styles.js
  var CSS = window.__SC_CSS__ = [
    /* ══════════ ① 令牌层 ══════════ */
    "#scpanl-root,.sc-trigger,.sc-fab{",
    /* 语义色 */
    "--sc-bg1:var(--dsw-alias-bg-layer-1,#1e1e1e);",
    "--sc-bg-card:#2a2a2f; /* v9 \u5BF9\u9F50\uFF1A\u5361\u9762\u6BD4\u9875\u9762\u4EAE\u4E00\u6863\uFF08\u51F8\u5361\u4F53\u7CFB\uFF09\uFF1Bsc-dark/sc-light \u4F1A\u8986\u76D6 */",
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
    "#scpanl-mask{position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.55);display:none;",
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
    "#scpanl-root .sc-ctrl-meta{display:flex;flex-wrap:wrap;gap:var(--sc-sp-1);margin-top:var(--sc-sp-1);}",
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
    "/* ---------- \u5206\u6BB5 Tab\uFF08P2\uFF09 ---------- */",
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
    ".sc-fab{position:fixed;left:var(--sc-sp-4);bottom:var(--sc-sp-4);z-index:9800;width:40px;height:40px;",
    "border-radius:50%;border:none;cursor:pointer;font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);",
    "color:#fff;background:var(--sc-accent);box-shadow:var(--sc-shadow-2);}",
    /* 旧 footer 类名兼容（DSH 宿主演进后多为死代码，保留防回退） */
    ".hHd-Xa_footerActions{padding-left:var(--sc-sp-2);margin:0;}",
    ".hHd-Xa_settingsArea{margin:0;}",
    "/* ---------- \u8FD0\u884C\u603B\u89C8\u7EC4\u4EF6\uFF08P1-1\uFF09 ---------- */",
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

  // src-client/body.js
  (function() {
    "use strict";
    window.__ModuleLoader__.load({
      id: "dsh-shoucang-memory",
      factory: function(require2) {
        var module = { exports: {} };
        var exports = module.exports;
        var BASE = "/api/shoucang-panel";
        var inject = ["slots"];
        function contract() {
          return typeof window !== "undefined" && window.__SC_CONTRACT__ || null;
        }
        function contractOf(path) {
          var _a8;
          if (!contract()) return null;
          if (!appState.contractByPath) {
            appState.contractByPath = {};
            (((_a8 = contract()) == null ? void 0 : _a8.routes) || []).forEach(function(r7) {
              appState.contractByPath[r7.path] = r7;
            });
          }
          return appState.contractByPath[path] || null;
        }
        function preflight(path, body) {
          var c5 = contractOf(path);
          if (!c5 || !Derive.has(c5.required)) return null;
          if (!body || typeof body !== "object") return { error: "preflight_missing_body", detail: path + " \u9700\u8981\u8BF7\u6C42\u4F53\uFF08\u5FC5\u586B\uFF1A" + c5.required.join(", ") + "\uFF09" };
          var miss = c5.required.filter(function(k2) {
            var v2 = body[k2];
            return v2 === void 0 || v2 === null || v2 === "";
          });
          return miss.length ? { error: "preflight_missing_field", detail: "\u7F3A\u5C11\u5FC5\u586B\u5B57\u6BB5\uFF1A" + miss.join(", ") } : null;
        }
        function api(path, opts) {
          var o9 = opts || {};
          var t0 = Date.now();
          var ctx = { method: o9.method || "GET", path, params: o9.body || null };
          var pre = preflight(path, o9.body);
          if (pre) {
            var pe = new Error(pre.detail);
            pe.__ctx = ctx;
            pe.preflight = pre.error;
            Log.warn("\u5951\u7EA6\u9884\u68C0\u672A\u901A\u8FC7\uFF1A" + pre.detail + "\uFF08\u672C\u5730\u62E6\u622A\uFF0C\u672A\u53D1\u51FA\u8BF7\u6C42\uFF09", ctx);
            return Promise.reject(pe);
          }
          var busyShown = false;
          var busyTimer = setTimeout(function() {
            busyShown = true;
            setStatusText("\u6267\u884C\u4E2D\u2026 " + path, "info");
          }, 1500);
          function endBusy() {
            clearTimeout(busyTimer);
            if (busyShown) {
              busyShown = false;
              setStatusText("", "info");
            }
          }
          return fetch(BASE + path, Object.assign({ headers: { "content-type": "application/json" } }, o9)).then(function(r7) {
            return r7.json().then(function(j2) {
              if (!r7.ok) {
                var err = new Error(j2 && (j2.detail || j2.error) || "HTTP " + r7.status);
                err.__ctx = ctx;
                err.httpStatus = r7.status;
                if (j2 && j2.detail) err.detail = j2.detail;
                throw err;
              }
              endBusy();
              ctx.ms = Date.now() - t0;
              ctx.status = r7.status;
              Log.info(ctx.method + " " + path + " \u2713 " + ctx.ms + "ms", ctx);
              return j2;
            });
          }).catch(function(e8) {
            if (!e8.__ctx) e8.__ctx = ctx;
            endBusy();
            Log.error(ctx.method + " " + path + " \u2717 " + (e8 && e8.message ? e8.message : String(e8)), ctx);
            throw e8;
          });
        }
        var SC_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAD90lEQVR4Aeybv65NQRTGL52CB6CRkNAIlUKpoPEIGkoFL6D1ACRaCs+gIFErFBQSJBQKHoBE666v2Mnsndmz98yeNd+cc76bWXfP/7XW9ztz/mafPNIfVQEBoMp/dCQAAkBWgOxeJ0AAyAqQ3esECABZAbJ7nQABICtAdn+YJ4AseuheAEI1CHUBIIgeuhSAUA1CXQAIoocuBSBUg1DvEcB/0yE0a2aVcC3qWYtbT+4RQGsNqP4EgCq/fpAhyy8AhwSAnmuXAeg1gIxFAA4QwDvLGe/P58yGR2Vu3lz/aLE15uah/6uNU0urE3DWskTCsJtW76VcskAQE+ya1ZuXFgBeWVa/zHovHy3A5ifCGwAeWXctsV0pOBHfWwbrCWDp0XTHEj1BMvg219FywXr/mTUpngDwaJom8c06BtFfW51V4HuI43ckiFPWh9ctu/gWLwB46plGft86Lpv1Vs5ZQI/NpqXJ65YXgGkyaL/Ev07ticWFU2GXumVpNw8AsUc/jvtSLOzx2OvCH++gPAB4x9xy/9PezloA2IVH/6DzjaHS6toCQKtcavh5X2OTnD0EIEcth7kC4CBqzpYCkKOWw9zaAPAx3iHM/d2yBADe589ZjS+y5vYu7d9Kb8nvpv1LAGxyqMVjBfYTwDjHrlsCQMZTAgCfbOfstkM+2HPOX6y/dggxH2HfJn8lAFIO36YGC8c89iwMpf6y2gDqR7jnOwoAGbAACABZAbJ7nQABICtAdq8TsD8AyJnsqHudADK42gAeOOTzMGPPnfs9ogRA6vvx5xlirZ361CamfIZjNX6PMHejEu4fq48m5zZKAOT60PyEAgKQEKfFkAC0UDnhowRA+F14rJ5wt2ootueWvlVOE5OWfCeWLg+VAFjeVTNWKyAAq6XymSgAG3XdulwAtiq4cb0AjAW8NW76t1oAwKdH/0zqeHhTZ5v1u7QAsD6a/mb+9Q7JAwDeN0/jdr/XauqwoP0isuZMpK9qlweAWIC41+pqbKCTPtw+e48RixeA2Cn4ZAn2+HqAmL5YbNNyftrh0fYCgFhjd6CjHwnDUGcaYoDFYkDsP2MDtfs8AeAO9FS8SJ5pqdiWYk+tzRrzBIBA8FT0AZUdsc8WJ2K2S5viDQBZXLd/dZOyDR0KYrzisG9yyxYAhgCQIGxo93JFTDBKPC0BDAki2ZQN84brI6uk5odjF23utCzdXzCd37TNAJCb4LOMBT8ic7u+v2AXAEQ03Z8uASCzFAABICtAdq8TIABkBcjuezwB4ft61HMlwprQctc3nZ8BoGlcB+NMAMioBUAAyAqQ3esECABZAbJ7nQABICtAdq8TIABkBcjudQIWAHgPHwMAAP//8UoJFgAAAAZJREFUAwBhOrPBP4+UEwAAAABJRU5ErkJggg==";
        function make2(k2, v2) {
          var o9 = {};
          o9[k2] = v2;
          return o9;
        }
        function setStatusText(msg, level) {
          var n6 = document.getElementById("sc-statusbar");
          if (!n6) return;
          n6.textContent = (msg || "") + "";
          n6.className = "sc-statusbar sc-status-" + (level || "info");
        }
        setLogStatusSink(setStatusText);
        function status(msg, level) {
          var lv = level || "info";
          setStatusText(msg, lv);
          if (msg) Log.add(lv, msg);
        }
        function fail(e8, ctx) {
          var err = e8 instanceof Error ? e8 : new Error(String(e8 && e8.message ? e8.message : e8));
          var c5 = ctx || e8 && e8.__ctx || null;
          var where = c5 ? " [" + (c5.method || "") + " " + (c5.path || "") + (c5.params ? " " + JSON.stringify(c5.params) : "") + "]" : "";
          var msg = "\u26A0 " + err.message + where;
          status(msg, "error");
          var rec = { t: Date.now(), message: err.message, ctx: c5, stack: (err.stack || "").split("\n").slice(0, 4).join(" | ") };
          var a4 = (Store.get("errors") || []).concat([rec]);
          Store.set("errors", a4.slice(-100));
          if (!c5) Log.error(err.message, { where: null, stack: rec.stack });
          return rec;
        }
        function apiCtx(path, opts, label) {
          var o9 = opts || {};
          var t0 = Date.now();
          var ctx = { method: o9.method || "GET", path, params: o9.body || null };
          if (label) Prog.start(path, label);
          return api(path, o9).then(function(r7) {
            if (label) Prog.done(path, true, "\u5B8C\u6210 " + Math.round((Date.now() - t0) / 100) / 10 + "s");
            Log.info((o9.method || "GET") + " " + path + " \u2713 " + (Date.now() - t0) + "ms", ctx);
            return r7;
          }).catch(function(e8) {
            if (label) Prog.done(path, false, "\u5931\u8D25");
            throw Object.assign(new Error(e8 && e8.message ? e8.message : String(e8)), { __ctx: ctx });
          });
        }
        var SWITCH_KEYS = [
          ["injection.hot_memory", "\u6CE8\u5165\u70ED\u8BB0\u5FC6\u603B\u95F8 hot_memory", "\u5173=\u4E0D\u6CE8\u5165 agent/\u7528\u6237\u753B\u50CF\u4E0E\u77E5\u8BC6\u7D22\u5F15\u4EFB\u4F55\u6307\u9488\u884C"]
          // 2026-09-10 审查收敛：archive/lifecycle/merge/scheduler 组开关是 v15 单库化前旧 Python 链路的
          // 遗留控件，其消费端（_meta/*.py）已不随包分发——保留只会误导用户"改了有效"。已移除。
          // 2026-09-11 同类遗漏：boards.memory 是「只写不读」死开关（parseView 解析进 out.boards 后全仓零读取点，
          // 注入总闸只读 level/hot_memory/persona），且旧文案宣称其「注入总闸的父开关」= 假依赖。同批移除。
        ];
        var CTRL_META = {
          "injection.hot_memory": { scope: "\u5168\u5C40\u6CE8\u5165", effect: "\u5373\u65F6" },
          "injection.level": { scope: "\u5168\u5C40\u6CE8\u5165", effect: "\u5373\u65F6" },
          "injection.persona": { scope: "\u5168\u5C40\u6CE8\u5165", effect: "\u5373\u65F6" },
          "injection.cap_agent": { scope: "\u5199\u95E8\u5BB9\u91CF", effect: "\u5373\u65F6" },
          "injection.cap_user": { scope: "\u5199\u95E8\u5BB9\u91CF", effect: "\u5373\u65F6" },
          "injection.cap_memory": { scope: "\u5199\u95E8\u5BB9\u91CF", effect: "\u5373\u65F6" },
          recallColdFactorPercent: { scope: "\u53EC\u56DE\u878D\u5408", effect: "\u5373\u65F6" },
          enableDeepSleep: { scope: "\u8C03\u5EA6", effect: "\u9700\u91CD\u8F7D" },
          // U3（B5 能力对齐）：新增控件的作用域与生效态
          injectRelevance: { scope: "\u6CE8\u5165\u9009\u884C", effect: "\u5373\u65F6" },
          injectFreshSlots: { scope: "\u6CE8\u5165\u9009\u884C", effect: "\u5373\u65F6" },
          recallFusion: { scope: "\u53EC\u56DE\u878D\u5408", effect: "\u9700\u91CD\u8F7D" },
          bankGit: { scope: "\u5E93\u7248\u672C\u5316", effect: "\u9700\u91CD\u8F7D" },
          mclEnabled: { scope: "\u8BA4\u77E5\u73AF", effect: "\u9700\u91CD\u8F7D" },
          mclFamiliarThreshold: { scope: "\u8BA4\u77E5\u73AF", effect: "\u9700\u91CD\u8F7D" },
          mclMaxNudges: { scope: "\u8BA4\u77E5\u73AF", effect: "\u9700\u91CD\u8F7D" },
          mclBudgetChars: { scope: "\u8BA4\u77E5\u73AF", effect: "\u9700\u91CD\u8F7D" },
          mclTopK: { scope: "\u8BA4\u77E5\u73AF", effect: "\u9700\u91CD\u8F7D" },
          mclAudit: { scope: "\u8BA4\u77E5\u73AF", effect: "\u9700\u91CD\u8F7D" }
        };
        function metaBadges(key) {
          var m3 = CTRL_META[key] || { scope: "\u5168\u5C40\u6CE8\u5165", effect: "\u5373\u65F6" };
          var box = el("div", "sc-ctrl-meta");
          box.appendChild(el("span", "sc-chip", m3.scope));
          box.appendChild(el("span", "sc-chip" + (m3.effect === "\u9700\u91CD\u8F7D" ? " warn" : ""), m3.effect));
          return box;
        }
        function scheduleFold(host, mark, label, openDefault, key) {
          var nodes = [];
          var n6 = mark.nextSibling;
          while (n6) {
            nodes.push(n6);
            n6 = n6.nextSibling;
          }
          if (!Derive.has(nodes)) {
            if (mark.parentNode) mark.parentNode.removeChild(mark);
            return null;
          }
          var f3 = UI.fold({ key: key || "more:" + label, variant: "more", label, open: !!openDefault });
          nodes.forEach(function(x2) {
            f3.body.appendChild(x2);
          });
          f3.appendTo(host);
          if (mark.parentNode) mark.parentNode.removeChild(mark);
          return f3;
        }
        function deferFold(host, mark, label, openDefault, key) {
          appState.foldQueue.push({ host, mark, label, open: !!openDefault, key });
        }
        function flushFolds() {
          var q = appState.foldQueue;
          appState.foldQueue = [];
          q.forEach(function(t6) {
            try {
              scheduleFold(t6.host, t6.mark, t6.label, t6.open, t6.key);
            } catch (e8) {
              if (t6.mark && t6.mark.parentNode) t6.mark.parentNode.removeChild(t6.mark);
              Log.warn("\u6298\u53E0\u6536\u53E3\u5931\u8D25\uFF1A" + (e8 && e8.message ? e8.message : e8));
            }
          });
          return q.length;
        }
        function opCard(title, desc, ep, btn, run, opts) {
          var o9 = opts || {};
          var c5 = el("div", "sc-opcard");
          var head = el("div", "sc-opcard-head");
          if (o9.icon) {
            var ic = el("span", "sc-opcard-ic");
            ic.appendChild(svg(o9.icon));
            head.appendChild(ic);
          }
          head.appendChild(el("span", "sc-opcard-t", title));
          c5.appendChild(head);
          c5.appendChild(el("div", "sc-opcard-d", desc));
          var f3 = el("div", "sc-opcard-f");
          f3.appendChild(el("span", "sc-src", ep));
          f3.appendChild(el("span", "sc-spacer"));
          f3.appendChild(UI.button(btn, run, {
            primary: true,
            async: true,
            busyText: o9.busyText || "\u6267\u884C\u4E2D\u2026",
            confirm: o9.confirm,
            okText: o9.okText || title + " \u5DF2\u53D1\u8D77"
          }));
          c5.appendChild(f3);
          return c5;
        }
        var VIEWS = [
          ["overview", "\u8FD0\u884C\u603B\u89C8", "overview", "\u603B\u89C8"],
          ["memory", "\u8BB0\u5FC6\u5E93", "memory", "\u8BB0\u5FC6"],
          ["persona", "\u753B\u50CF", "persona", "\u8BB0\u5FC6"],
          ["suite", "\u63D2\u4EF6\u96C6\u5408", "suite", "\u8FD0\u884C"],
          ["deepsleep", "\u6DF1\u5EA6\u7761\u7720", "sleep", "\u8FD0\u884C"],
          ["observe", "\u8FD0\u884C\u89C2\u6D4B", "observe", "\u8FD0\u884C"],
          ["arch", "\u67B6\u6784", "arch", "\u8FD0\u884C"],
          ["toggles", "\u53C2\u6570", "toggles", "\u914D\u7F6E"],
          ["settings", "\u8BBE\u7F6E", "settings", "\u914D\u7F6E"]
        ];
        var refs = {};
        var state = { parsed: null };
        function filterViewRows(q) {
          var host = refs.view;
          if (!host) return 0;
          var rows = host.querySelectorAll(".sc-idx-row,.sc-row,.sc-recent-row");
          var n6 = 0;
          for (var i7 = 0; i7 < rows.length; i7++) {
            var hit = !q || String(rows[i7].textContent || "").toLowerCase().indexOf(q.toLowerCase()) >= 0;
            rows[i7].classList.toggle("sc-filtered", !hit);
            if (hit) n6++;
          }
          return q ? n6 : rows.length;
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
          } catch (e8) {
          }
          if (refs.view) {
            var vv = null;
            for (var i7 = 0; i7 < VIEWS.length; i7++) {
              if (VIEWS[i7][0] === name) {
                vv = VIEWS[i7];
                break;
              }
            }
            refs.view.setAttribute("role", "region");
            if (vv) refs.view.setAttribute("aria-label", vv[1] + "\uFF08" + vv[3] + "\uFF09");
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
            api("/memory/overview").then(function(r7) {
              renderPersona(refs.view, r7);
            }).catch(fail);
          } else if (name === "memory") {
            api("/memory/overview").then(function(r7) {
              renderMemoryExpanded(refs.view, r7);
            }).catch(fail);
          } else if (name === "suite") {
            api("/suite").then(function(r7) {
              renderSuite(refs.view, r7);
            }).catch(fail);
          } else if (name === "toggles") {
            api("/config").then(function(r7) {
              if (!r7.global) {
                status(r7.error === "no-active-root" ? "\u672A\u6FC0\u6D3B\u6839\u76EE\u5F55\u2014\u2014\u8BF7\u5230\u300C\u914D\u7F6E\u539F\u6587\u300D\u9875\u6839\u76EE\u5F55\u533A\u6DFB\u52A0\u3002" : r7.error || "");
                return;
              }
              if (!r7.parsed) status("\u6CE8\u5165\u53C2\u6570\u5DF2\u5168\u5C40\u53EF\u7528\uFF08scheduler.json\uFF09\uFF1Broot \u672A\u767B\u8BB0\u2014\u2014\u300C\u8BB0\u5FC6\u677F\u5757\u663E\u793A\u300D\u5F00\u5173\u5F85\u767B\u8BB0\u540E\u53EF\u7528\u3002");
              else status("\u5DF2\u52A0\u8F7D " + (r7.file || ""));
              renderViewToggles(refs.view, r7.parsed || {}, r7.global);
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
          document.addEventListener("keydown", function(e8) {
            var mod = e8.ctrlKey || e8.metaKey;
            if (mod && e8.shiftKey && (e8.key === "S" || e8.key === "s")) {
              e8.preventDefault();
              togglePanel();
              return;
            }
            if (mod && e8.shiftKey && (e8.key === "L" || e8.key === "l")) {
              e8.preventDefault();
              Cfg.set("showLogs", !Cfg.get("showLogs", true));
              applyLogPanel();
              status("\u65E5\u5FD7\u9762\u677F\u5DF2" + (Cfg.get("showLogs") ? "\u663E\u793A" : "\u9690\u85CF"), "info");
              return;
            }
            if (e8.key === "Escape") {
              var mask = document.getElementById("scpanl-mask");
              if (mask && mask.classList.contains("open")) {
                e8.preventDefault();
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
          modal.setAttribute("aria-label", "\u5B88\u85CF\u8BB0\u5FC6\u9762\u677F");
          var nav = el("div", "sc-nav");
          nav.appendChild(el("div", "sc-nav-title", "\u5B88\u85CF SHOUCANG"));
          refs.navItems = [];
          var lastGroup = null;
          VIEWS.forEach(function(v2) {
            if (v2[3] && v2[3] !== lastGroup) {
              nav.appendChild(el("div", "sc-nav-group", v2[3]));
              lastGroup = v2[3];
            }
            var item = el("div", "sc-nav-item");
            item.appendChild(svg(ICONS2[v2[2]]));
            item.appendChild(el("span", null, v2[1]));
            item.setAttribute("role", "button");
            item.setAttribute("tabindex", "0");
            item.setAttribute("aria-label", v2[1]);
            item.onclick = function() {
              show(v2[0]);
            };
            item.onkeydown = function(e8) {
              if (e8.key === "Enter" || e8.key === " ") {
                e8.preventDefault();
                show(v2[0]);
              }
            };
            refs.navItems.push({ name: v2[0], el: item });
            nav.appendChild(item);
          });
          nav.appendChild(el("div", "sc-nav-spacer"));
          var foot = el("div", "sc-nav-foot");
          var health = el("div", "sc-nav-health");
          var fdot = el("span", "sc-dot ok");
          health.appendChild(fdot);
          health.appendChild(el("b", null, "\u8BB0\u5FC6\u5E93"));
          var fstate = el("span", null, "\u2014");
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
          var navClose = el("button", "sc-nav-close", "\u2715");
          navClose.type = "button";
          navClose.title = "\u5173\u95ED\u9762\u677F";
          navClose.setAttribute("aria-label", "\u5173\u95ED\u9762\u677F");
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
            if (hm && VIEWS.some(function(v2) {
              return v2[0] === hm[1];
            })) startView = hm[1];
            else if (Cfg.get("lastView")) {
              var lv = String(Cfg.get("lastView"));
              if (VIEWS.some(function(v2) {
                return v2[0] === lv;
              })) startView = lv;
            }
          } catch (e8) {
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
          try {
            if (window.__SC_VENDOR_CSS__ && !document.getElementById("scpanl-vendor-css")) {
              var vstyle = el("style");
              vstyle.id = "scpanl-vendor-css";
              vstyle.textContent = window.__SC_VENDOR_CSS__;
              rootEl.appendChild(vstyle);
            }
          } catch (e8) {
            Log.warn("\u7EC4\u4EF6\u5E93\u4E3B\u9898\u6CE8\u5165\u5931\u8D25\uFF1A" + (e8 && e8.message));
          }
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
          btn.title = "\u5B88\u85CF\u9762\u677F";
          var ic = el("img", "sc-ic-lg");
          ic.src = SC_ICON;
          ic.alt = "\u5B88";
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
            settingsBtn = document.querySelector('[class*="triggerRow"] button') || [...document.querySelectorAll("button")].find(function(b3) {
              return (b3.textContent || "").trim() === "\u8BBE\u7F6E";
            });
          } catch (e8) {
            settingsBtn = null;
          }
          if (settingsBtn && settingsBtn.cloneNode) {
            try {
              btn = settingsBtn.cloneNode(true);
              btn.id = "scpanl-btn";
              btn.removeAttribute("aria-haspopup");
              btn.removeAttribute("aria-expanded");
              btn.title = "\u5B88\u85CF\u9762\u677F";
              var lab = btn.querySelector("span, [data-slot] span");
              if (lab) lab.textContent = "\u5B88\u85CF";
              btn.onclick = openPanel;
            } catch (e8) {
              btn = null;
            }
          }
          if (!btn) {
            btn = el("button");
            btn.id = "scpanl-btn";
            btn.type = "button";
            btn.title = "\u5B88\u85CF\u9762\u677F";
            btn.className = "sc-trigger";
            var icF = el("img", "sc-ic-sm");
            icF.src = SC_ICON;
            icF.alt = "\u5B88";
            btn.appendChild(icF);
            btn.appendChild(el("span", "sc-trigger-label", "\u5B88\u85CF"));
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
          } catch (e8) {
            Log.warn("\u8BBE\u7F6E\u751F\u6548\u5931\u8D25\uFF08" + key + "\uFF09\uFF1A" + (e8 && e8.message));
          }
        }
        function ShoucangSettingsSection() {
          var h3 = appState.slotReact.createElement;
          function row(key, title, desc, control) {
            return h3(
              "div",
              { className: "setting-item", key },
              h3(
                "div",
                { className: "setting-item-info" },
                h3("div", { className: "setting-item-name" }, title),
                h3("div", { className: "setting-item-desc" }, desc)
              ),
              h3("div", { className: "setting-item-control" }, control)
            );
          }
          function sel(key, opts, fallback2) {
            return h3("select", {
              value: String(Cfg.get(key, fallback2)),
              onChange: function(ev) {
                Cfg.set(key, ev.target.value);
                applyCfgSideEffect(key);
              }
            }, (opts || []).map(function(o9) {
              return h3("option", { value: String(o9.value), key: String(o9.value) }, o9.label);
            }));
          }
          function num(key, fallback2, min, max, step) {
            return h3("input", {
              type: "number",
              value: String(Cfg.get(key, fallback2)),
              step: step || 1,
              onChange: function(ev) {
                var n6 = parseInt(ev.target.value, 10);
                if (isNaN(n6)) return;
                Cfg.set(key, Math.max(min, Math.min(max, n6)));
                applyCfgSideEffect(key);
              }
            });
          }
          function tgl(key, fallback2) {
            return h3("input", {
              type: "checkbox",
              checked: !!Cfg.get(key, fallback2),
              onChange: function(ev) {
                Cfg.set(key, ev.target.checked);
                applyCfgSideEffect(key);
              }
            });
          }
          return h3(
            "div",
            { className: "sc-host-settings" },
            h3("div", { className: "setting-item-desc" }, "\u5B88\u85CF\u9762\u677F\u7684\u754C\u9762\u504F\u597D\uFF08\u4E0E\u9762\u677F\u5185\u300C\u8BBE\u7F6E\u300D\u9875\u540C\u6E90\uFF0C\u6539\u540E\u7ACB\u5373\u751F\u6548\uFF1B\u4FDD\u5B58\u5728\u6D4F\u89C8\u5668 localStorage\uFF09\u3002"),
            row(
              "density",
              "\u663E\u793A\u5BC6\u5EA6",
              "\u7D27\u51D1\u6A21\u5F0F\u9690\u85CF\u63CF\u8FF0\u3001\u538B\u7F29\u884C\u9AD8",
              sel("density", [{ value: "comfortable", label: "\u8212\u9002" }, { value: "compact", label: "\u7D27\u51D1" }], "comfortable")
            ),
            row("navWidth", "\u5BFC\u822A\u5BBD\u5EA6", "\u9762\u677F\u5DE6\u5BFC\u822A\u50CF\u7D20\u5BBD\u5EA6\uFF08140\u2013320\uFF09", num("navWidth", 216, 140, 320)),
            row("refreshMs", "\u8F6E\u8BE2\u95F4\u9694", "\u6BEB\u79D2\uFF1B0 = \u5173\u95ED\u8F6E\u8BE2", num("refreshMs", 6e4, 0, 36e5, 1e3)),
            row("showLogs", "\u663E\u793A\u65E5\u5FD7\u9762\u677F", "\u72B6\u6001\u680F\u4E0A\u65B9\u5E38\u9A7B\u65E5\u5FD7\uFF08\u5173\u95ED\u5373\u6298\u53E0\u6210\u4E00\u884C\uFF09", tgl("showLogs", false)),
            row(
              "skin",
              "\u754C\u9762\u76AE\u80A4",
              "v9 = \u65B9\u6848\u8C03\u8272\u677F\uFF08\u9ED8\u8BA4\uFF09\uFF1B\u5BBF\u751F = \u8DDF\u968F DSH \u4E3B\u9898\u4EE4\u724C",
              sel("skin", [{ value: "v9", label: "v9 \u65B9\u6848\u76AE\u80A4" }, { value: "host", label: "\u5BBF\u4E3B\u539F\u751F\u76AE\u80A4" }], "v9")
            ),
            row(
              "startView",
              "\u542F\u52A8\u65F6\u89C6\u56FE",
              "\u6253\u5F00\u9762\u677F\u9ED8\u8BA4\u843D\u5730\u9875\uFF08\u6DF1\u94FE > \u4E0A\u6B21\u89C6\u56FE > \u6B64\u9879\uFF09",
              sel("startView", VIEWS.map(function(v2) {
                return { value: v2[0], label: v2[1] };
              }), "overview")
            ),
            row(
              "openPanel",
              "\u6253\u5F00\u9762\u677F",
              "\u5BBF\u4E3B\u8BBE\u7F6E\u91CC\u4E5F\u80FD\u76F4\u63A5\u5524\u8D77\u5B88\u85CF\u9762\u677F",
              h3("button", { type: "button", className: "sc-btn sc-btn-primary", onClick: function() {
                openPanel();
              } }, "\u6253\u5F00\u5B88\u85CF\u9762\u677F")
            )
          );
        }
        function apply(ctx) {
          mount();
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
              } catch (e8) {
              }
            };
            window.addEventListener("focus", focusRefresh);
            document.addEventListener("visibilitychange", function() {
              if (!document.hidden) focusRefresh();
            });
          }
          var reactEl = null;
          try {
            reactEl = require2("react");
          } catch (e8) {
            reactEl = null;
          }
          appState.slotReact = reactEl;
          var SLOT_OK = !!(reactEl && typeof reactEl.createElement === "function" && ctx && typeof ctx.effect === "function" && ctx.slots && typeof ctx.slots.inject === "function" && typeof ctx.slots.register === "function");
          if (SLOT_OK) {
            ctx.effect(function() {
              return ctx.slots.inject("sidebar.footer.action", function() {
                var open = openPanel;
                var ShoucangToggle = function() {
                  if (!reactEl || typeof reactEl.createElement !== "function") return null;
                  return reactEl.createElement(
                    "button",
                    { type: "button", title: "\u5B88\u85CF\u9762\u677F", className: "sc-trigger", onClick: function() {
                      open();
                    } },
                    reactEl.createElement("img", { src: SC_ICON, alt: "\u5B88", style: { width: 22, height: 22, display: "block", pointerEvents: "none" } }),
                    reactEl.createElement("span", { className: "sc-trigger-label" }, "\u5B88\u85CF")
                  );
                };
                return ctx.slots.register({
                  name: "sidebar.footer.action",
                  id: "shoucang-panel-toggle",
                  label: function() {
                    return "\u5B88\u85CF\u9762\u677F";
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
                    return "\u5B88\u85CF";
                  }
                }, ShoucangSettingsSection);
              });
            }, "shoucang-panel: settings section");
          }
          if (SLOT_OK) {
            Log.info("\u4FA7\u680F\u5165\u53E3\uFF1A\u5DF2\u6CE8\u518C\u5BBF\u4E3B\u63D2\u69FD sidebar.footer.action\uFF08\u4E0D\u6302 DOM \u76F4\u63D2\u5165\u53E3\uFF09");
          } else {
            Log.info("\u4FA7\u680F\u5165\u53E3\uFF1A\u5BBF\u4E3B\u63D2\u69FD\u4E0D\u53EF\u7528\uFF08" + (reactEl ? "slots \u670D\u52A1\u7F3A\u5931" : "require('react') \u4E0D\u53EF\u7528") + "\uFF09\uFF0C\u56DE\u9000 DOM \u76F4\u63D2");
            if (!document.getElementById("scpanl-btn")) mountSidebarEntry();
          }
          return function() {
            if (appState.sidebarObserver) {
              try {
                appState.sidebarObserver.disconnect();
              } catch (e8) {
              }
            }
            var n6 = document.getElementById("scpanl-root");
            if (n6) n6.remove();
            var b3 = document.getElementById("scpanl-btn");
            if (b3) b3.remove();
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
        appState.switchKeys = SWITCH_KEYS;
        appState.metaBadges = metaBadges;
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
