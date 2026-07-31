# Three Scirra engine bugs in r494 (DOM SDK)

Status: **not reported yet.**

Found while analysing DOM addon support. See [dom-addon-support.md](dom-addon-support.md) for the
surrounding context and for what CAW has to do about them.

All three files ship minified as a single line, so locations are "line 1" plus a 1-based character
column. Columns were computed with Python `str.find` + 1 over the file read as UTF-8. Source read at
`/Users/ossama/Downloads/C3-r494-2/r494-2/`.

None of these are CAW bugs. Two of them block features for v1 and v2 addons alike.

---

## Bug 1 — `ISDKDOMInstanceBase` calls a method that does not exist

**File:** `preview/interfaces/sdk/ISDKDOMInstanceBase.js`, line 1, starting at column 3166.

```js
setElementCSSStyle(e,t){this.postToDOMElement("set-css-style",{"prop":C3.CSSToCamelCase(e),"val":t})}setElementAttribute(e,t){this.postToDOMElement("set-attribute",{"name":e,"val":t})}removeElementAttribute(e){this.postToDOMElement("remove-attribute",{"name":e})}
```

| Method | Column of bad call | Bad name | Correct name |
|---|---|---|---|
| `setElementCSSStyle` | 3190 | `this.postToDOMElement` | `this._postToDOMElement` |
| `setElementAttribute` | 3292 | `this.postToDOMElement` | `this._postToDOMElement` |
| `removeElementAttribute` | 3376 | `this.postToDOMElement` | `this._postToDOMElement` |

There is no `postToDOMElement` anywhere on `ISDKDOMInstanceBase`, `ISDKWorldInstanceBase`,
`ISDKInstanceBase`, `IWorldInstance` or `IInstance`. The declared and defined name is
`_postToDOMElement`, declared at `ISDKDOMInstanceBase.d.ts:7` and defined in the same JS file at
column 654.

All three throw `TypeError: this.postToDOMElement is not a function` on every call.

The DOM-side handlers are fine (`preview/workers/domElementHandler.js:1` defines `_OnSetCssStyle`,
`_OnSetAttribute`, `_OnRemoveAttribute`). Only the runtime entry points are broken, so the fix is one
character in each of three places.

**Sibling methods checked, all correct** (same file, line 1): `_release` (~470),
`_getElementInDOMMode` (call at 833), `_createElement` (~1400), `setElementVisible` (call at 1526),
`_updatePosition` (call at 2707), `focusElement` (call at 2954), `blurElement` (call at 3022),
`_updateElementState` (call at 3511). Exactly three methods are affected and they are contiguous.

**Report text:**

> In r494, `ISDKDOMInstanceBase.setElementCSSStyle()`, `setElementAttribute()` and
> `removeElementAttribute()` in `preview/interfaces/sdk/ISDKDOMInstanceBase.js` call
> `this.postToDOMElement(...)`. That method does not exist on any class in the prototype chain.
> The correct name, used by every other method in the same class and declared in
> `ISDKDOMInstanceBase.d.ts`, is `this._postToDOMElement(...)`. All three methods therefore throw
> `TypeError: this.postToDOMElement is not a function`. The corresponding DOM-side handlers
> (`_OnSetCssStyle`, `_OnSetAttribute`, `_OnRemoveAttribute` in `workers/domElementHandler.js`)
> are correct, so the fix is a one-character change in each of the three call sites.
> Knock-on effect: `IDOMInstance.setCssStyle()` is documented to work but cannot, for SDK v2
> addons, for this reason plus bug 3 below.

**Impact on CAW:** no workaround short of monkey-patching `ISDKDOMInstanceBase.prototype`. Any addon
needing to style or set attributes on its element must send its own custom DOM message instead.

---

## Bug 2 — `_addElementMessageHandlers` recurses into itself

**File:** `preview/interfaces/sdk/ISDKDOMPluginBase.js`, line 1, method starts at column 709.

```js
_addElementMessageHandlers(e){C3X.RequireArray(e);for(const[n,t]of e)this._addElementMessageHandlers(n,t)}
```

The loop body should call the **singular** `_addElementMessageHandler(n, t)`, defined immediately
above at column 606:

```js
_addElementMessageHandler(e,n){this.#e.GetRuntime().AddDOMComponentMessageHandler(this.#n,e,e=>{const t=this.#s.get(e["elementId"]);n(t,e)})}
```

As written the plural form calls itself with `(handlerName, func)`, hits
`C3X.RequireArray(handlerName)`, and throws. The documented batch API
(`ISDKDOMPluginBase.d.ts:10`) is unusable.

Every sibling batch helper delegates correctly, which is what makes this look like a copy-paste slip:
- `ISDKInstanceBase.js:1` — `_addDOMMessageHandlers` calls `_addDOMMessageHandler`
- `domHandler.js:1` — `AddRuntimeMessageHandlers` calls `AddRuntimeMessageHandler`
- `domElementHandler.js:1` — `AddDOMElementMessageHandlers` calls `AddDOMElementMessageHandler`

**Report text:**

> In r494, `ISDKDOMPluginBase._addElementMessageHandlers(arr)` in
> `preview/interfaces/sdk/ISDKDOMPluginBase.js` loops over the array and calls
> `this._addElementMessageHandlers(name, func)` — the plural form, recursively — instead of the
> singular `this._addElementMessageHandler(name, func)` defined directly above it. The recursive
> call immediately fails `C3X.RequireArray(name)`. Every sibling batch helper in the SDK
> (`ISDKInstanceBase._addDOMMessageHandlers`, `DOMHandler.AddRuntimeMessageHandlers`,
> `DOMElementHandler.AddDOMElementMessageHandlers`) has the correct singular delegation, so this
> looks like a copy-paste slip. Fix: drop the trailing `s`.

**Impact on CAW:** easy workaround. Call `_addElementMessageHandler` in a loop. Worth a comment in
the DOM scaffold so nobody loses an afternoon to it.

---

## Bug 3 — `IDOMInstance` calls SDK v1 method names

**File:** `preview/interfaces/objects/IDOMInstance.js`, line 1.

It calls `GetSdkInstance()._GetElementInDOMMode()`, `.FocusElement()`, `.BlurElement()` and
`.SetElementCSSStyle()`. Those are the SDK **v1** `C3.SDKDOMInstanceBase` names.

An SDK v2 addon whose instance extends `ISDKDOMInstanceBase` exposes `_getElementInDOMMode`,
`focusElement`, `blurElement` and `setElementCSSStyle` (see `ISDKDOMInstanceBase.d.ts`). So all four
members throw for a v2 addon.

**Report text:**

> `IDOMInstance` in `preview/interfaces/objects/IDOMInstance.js` calls
> `GetSdkInstance()._GetElementInDOMMode()`, `.FocusElement()`, `.BlurElement()` and
> `.SetElementCSSStyle()`. Those are the SDK v1 `C3.SDKDOMInstanceBase` names. An SDK v2 addon
> whose instance extends `ISDKDOMInstanceBase` exposes `_getElementInDOMMode`, `focusElement`,
> `blurElement` and `setElementCSSStyle` (see `ISDKDOMInstanceBase.d.ts`). So a third-party SDK v2
> DOM element plugin cannot use `IDOMInstance` as its script interface base — all four members
> throw. Either `IDOMInstance` needs to support both naming conventions, or SDK v2 needs its own
> DOM instance script interface.

**Impact on CAW:** blocks scaffolding a DOM script interface. Covered as G14 in
[dom-addon-support.md](dom-addon-support.md). Revisit once this is resolved.
