# DOM addon support in CAW — gap analysis and fix plan

Written against Construct 3 **r494** engine source at `/Users/ossama/Downloads/C3-r494-2/r494-2/`.
CAW source read at commit `a1f8be6` of `ConstructFund/construct-addon-wizard-scaffold`.

Analysis only. Nothing in this document has been implemented.

---

## 0. TL;DR

CAW can build **type A** DOM addons (plain plugin + DOM-side script). Six shipped addons prove it.

CAW **cannot** build a **type B** DOM addon (a `PLUGIN_TYPE.DOM` plugin that owns a real HTML element).
The `dom` branches exist in `template/main.js` and `template/editor.js` but have never been executed.
Setting `type = PLUGIN_TYPE.DOM` today produces an addon that throws in the plugin constructor before
anything else happens, and even if that is fixed the DOM side is wired to the wrong base class,
the element is never created, and the scaffold gives the user no hooks to implement.

There are 14 gaps below, plus 3 bugs in Scirra's own r494 engine code that block parts of the
type B path regardless of what CAW does.

---

## 1. The two things people call a "DOM addon"

### Type A — plugin with a DOM-side script

- `addonType = ADDON_TYPE.PLUGIN`, `type = PLUGIN_TYPE.OBJECT` (or `WORLD`), `hasDomside = true`.
- Runtime instance extends `ISDKInstanceBase` (or `ISDKWorldInstanceBase`).
- DOM side extends `self.DOMHandler`.
- Protocol: runtime `_postToDOM` / `_postToDOMAsync` / `_postToDOMMaybeSync` /
  `_addDOMMessageHandler(s)` ↔ DOM `PostToRuntime` / `PostToRuntimeAsync` /
  `AddRuntimeMessageHandler(s)`.
- The addon has no HTML element. It just wants code running on the document thread.
- Engine source: `preview/interfaces/sdk/ISDKInstanceBase.js:1` (single minified line) defines
  `_addDOMMessageHandler`, `_addDOMMessageHandlers`, `_postToDOM`, `_postToDOMAsync`,
  `_postToDOMMaybeSync`, all of which throw `"no DOM component id set"` if `opts.domComponentId`
  was not passed to the constructor. Declared in `preview/interfaces/sdk/ISDKInstanceBase.d.ts:33-38`.
- `preview/workers/domHandler.js:1` defines `window.DOMHandler` with
  `constructor(iRuntime, componentId)`, `PostToRuntime`, `PostToRuntimeAsync`,
  `_PostToRuntimeMaybeSync`, `AddRuntimeMessageHandler`, `AddRuntimeMessageHandlers`,
  `GetRuntimeInterface`, `GetComponentID`, `_StartTicking`, `_StopTicking`, `Tick`, `Attach`.

All six existing CAW DOM-side addons are type A and all are `PLUGIN_TYPE.OBJECT`:

| Project | config file |
|---|---|
| testDomside | `/Users/ossama/Documents/CAW/testDomside/config.caw.js:9` |
| Audio Loader | `/Users/ossama/Documents/CAW/Audio Loader/config.caw.js:9` |
| poki_sdkV2 | `/Users/ossama/Documents/CAW/poki_sdkV2/config.caw.js:9` |
| dedra-sdk-wrapper | `/Users/ossama/Documents/CAW/dedra-sdk-wrapper/config.caw.js:6` |
| dedra_loading_screen | `/Users/ossama/Documents/CAW/dedra_loading_screen/config.caw.js:9` |
| FMOD js | `/Users/ossama/Documents/CAW/FMOD js/config.caw.js:9` |

Every one of them is `export const type = PLUGIN_TYPE.OBJECT;`. A repo-wide grep across
`/Users/ossama/Documents/CAW/` finds zero uses of `PLUGIN_TYPE.DOM`, `ISDKDOMInstanceBase`,
`ISDKDOMPluginBase`, `DOMElementHandler`, `_createElement`, `_getElementState` or
`setElementVisible` outside of copied framework boilerplate.

### Type B — DOM element plugin

- `addonType = ADDON_TYPE.PLUGIN`, `type = PLUGIN_TYPE.DOM`.
- Plugin extends `ISDKDOMPluginBase`, instance extends `ISDKDOMInstanceBase`
  (which extends `ISDKWorldInstanceBase`).
- DOM side extends `self.DOMElementHandler` (which extends `self.DOMHandler`).
- The plugin owns a real HTML element positioned over the canvas by the engine.
- Engine owns a full element lifecycle protocol. Message ids, from
  `preview/workers/domElementHandler.js:1`:
  `create`, `destroy`, `set-visible`, `update-position`, `update-state`, `focus`,
  `set-css-style`, `set-attribute`, `remove-attribute`, `get-element`
  (runtime → DOM), and `elem-focused`, `elem-blurred` (DOM → runtime, registered by
  `ISDKDOMPluginBase`'s constructor).
- Official SDK v2 type declarations for the DOM side:
  `preview/interfaces/sdk/AddonSDK.d.ts:21-49`, which declares `IDOMHandler`,
  `IDOMElementHandler extends IDOMHandler` with `AddDOMElementMessageHandler`,
  `PostToRuntimeElement`, `CreateElement(elementId, e)`, `DestroyElement(elem)`,
  `UpdateState(elem, e)`, and `declare var DOMElementHandler: typeof IDOMElementHandler;`.

Reference implementations (SDK **v1**, but the DOM-side half is identical because
`DOMElementHandler` is shared between v1 and v2):
- `plugins/html-elements/button/dom/domSide.js:1` and `.../button/c3runtime/runtime.js:1`
- `plugins/html-elements/textinput/dom/domSide.js:1` and `.../textinput/c3runtime/runtime.js:1`

Editor-side registration for the built-ins, from `plugins/allEditorPlugins.js:1`
(minified; Button block starts near character offset 25003, TextBox near 34500).
Mangled names decoded against `main.js:1` `window.SDK.IPluginInfo` wrapper
(`Jt` = `SetPluginType`, `Qt` = `SetIsResizable`, `Ds` = `SetDOMSideScripts`,
`fi` = `SetScriptInterfaceNames`, `mi` = `SetTypeScriptDefinitionFiles`,
`ri` = `AddCommonPositionACEs`, `ai` = `AddCommonSizeACEs`,
`ui` = `AddCommonSceneGraphACEs`, `ci` = `AddCommonZOrderACEs`):

```
Button:      t.Jt("world"), t.Qt(!0), t.Ds(["dom/domSide.js"]), t.fi({pi:"IButtonInstance"}),
             t.mi([...]), t.ri(), t.ai(), t.ui(), t.ci(), <4 internal-only calls>
TextBox:     t.Jt("world"), t.Qt(!0), t.Ds(["dom/domSide.js"]), t.fi({pi:"ITextInputInstance"}),
             t.mi([...]), t.ri(), t.ai(), t.ui(), t.ci(), <4 internal-only calls>
HTMLElement: t.Jt("world"), t.Qt(!0), t.ni(!1), t.Ds(["dom/domSide.js"]), ...,
             t.ri(), t.ai(), t.ui(), t.ci(), <2 internal-only calls>
```

Three conclusions that CAW must reproduce:
1. `SetPluginType("world")` is correct for a DOM element plugin. Confirmed by
   `sdk/external/IPluginInfo.d.ts:3` — `type PluginInfoPluginType = "object" | "world";`.
   There is no `"dom"` editor plugin type. CAW's mapping is already right.
2. `SetIsResizable(true)` on all three.
3. Common ACEs: Position, Size, SceneGraph, ZOrder. **Not** Angle, **not** Appearance.

---

## 2. Which repo is canonical, and where a fix belongs

Three candidate trees, and they are not equal.

### `/Users/ossama/Documents/construct-addon-wizard-scaffold/` — CANONICAL TODAY

- git remote: `https://github.com/ConstructFund/construct-addon-wizard-scaffold.git`, HEAD `a1f8be6`.
- The VS Code extension clones it directly:
  `/Users/ossama/Documents/construct-addon-wizard/src/commands/scaffold.ts:296` —
  `const emitter = degit("ConstructFund/construct-addon-wizard-scaffold", {` and
  `:310` — `await emitter.clone(folderPath);`.
- So every new CAW project is a full copy of this repo, including `build/` and `template/`.
  There is no update channel: an existing project's `template/` and `build/` are frozen at the
  commit it was scaffolded from.

**Primary fix target.**

### `/Users/ossama/Documents/caw-package/` — FUTURE, KEEP IN SYNC

- Not a git repo locally. `package.json:2` — `"name": "c3addon"`, `:3` — `"version": "2.0.0"`,
  `:25` — repo `git+ssh://git@github.com/ConstructFund/c3addon.git`.
- A refactor of the same build system into an installable npm package with a `c3addon` CLI
  (`src/cli.js:14-60`) and a `sync` command that copies `src/template/` into the project,
  **always overwriting** (`src/sync.js:62-75`, `copyDirSync(templateSrc, templateDest, { force: true })`).
- `diff -rq` shows `caw-package/src/template/` is **byte-identical** to
  `construct-addon-wizard-scaffold/template/` except that the scaffold also carries
  `en-US.json` and `projectData.json`. `template/domside.js` and `template/main.js` are identical.
- `caw-package/src/build/` differs from `construct-addon-wizard-scaffold/build/` in only
  6 files (`build.js`, `buildDomside.js`, `buildstepWebpack.js`, `exportWebpack.js`, `init.js`,
  `publish.js`) plus a new `projectPaths.js` — all path plumbing, no logic differences relevant
  to DOM.

**Every template change in this document must be applied to BOTH**
`construct-addon-wizard-scaffold/template/` **and** `caw-package/src/template/`,
or the `c3addon sync` path will silently overwrite the fix with the old file.

### `/Users/ossama/Documents/construct-addon-wizard/` — VS Code extension

- git remote `https://github.com/ConstructFund/construct-addon-wizard.git`, HEAD `084cd1b` (v1.0.2).
- Only DOM-relevant code is the scaffold wizard:
  `src/commands/scaffold.ts:122-131` already offers a `DOM (HTML overlay elements)` dropdown option
  with value `'DOM'`, and `:342` / `:349` write it into `config.caw.js`:
  ```ts
  const pluginTypeValue = data.pluginType ? `PLUGIN_TYPE.${data.pluginType}` : 'PLUGIN_TYPE.OBJECT';
  ...
  .replace(/export const type = PLUGIN_TYPE\.\w+;/, `export const type = ${pluginTypeValue};`)
  ```
- So the extension **already lets users pick DOM**, and hands them a project that cannot build.
  This is the reason a fix is urgent rather than optional.
- The extension does not set `hasDomside`, so a user picking DOM gets
  `type = PLUGIN_TYPE.DOM` with `hasDomside = false` — the worst combination (see G2).

---

## 3. What a correct type B addon must do, per r494 engine source

Read `preview/interfaces/sdk/ISDKDOMPluginBase.js` and `ISDKDOMInstanceBase.js`. Both are single
minified lines, so citations below are `file:1` plus a character column.

### Plugin side — `ISDKDOMPluginBase`

```js
self.ISDKDOMPluginBase = class extends self.ISDKPluginBase {
  constructor(e) {
    if (super(), this.#e = C3.AddonManager._GetInitObject2(internalApiToken), !e?.domComponentId)
      throw new Error("no DOM component ID specified");
    this.#n = e.domComponentId,
    this._addElementMessageHandler("elem-focused", e => e._onElemFocused()),
    this._addElementMessageHandler("elem-blurred", e => { e && e._onElemBlurred() })
  }
  _addElement(e) { ... }          // returns an integer element id
  _removeElement(e) { ... }
  _addElementMessageHandler(handler, func) { ... }
  _addElementMessageHandlers(arr) { ... }   // BROKEN, see §5.2
};
```
Declared at `preview/interfaces/sdk/ISDKDOMPluginBase.d.ts:6-11`.

The plugin, not the instance, owns the element id table and the DOM component id.
`ISDKDOMInstanceBase`'s constructor calls `this.plugin._addElement(this)`, so if the plugin base
class is wrong or unconstructed, every instance fails too.

### Instance side — `ISDKDOMInstanceBase`

Constructor: `if (!e?.domComponentId) throw new Error("no DOM component ID specified"); super(e); ...`
then `this.#e = this.plugin._addElement(this)` and `this._setTicking(!0)`.

Public/protected surface, from `preview/interfaces/sdk/ISDKDOMInstanceBase.d.ts:7-27`:

| Member | Direction | Notes |
|---|---|---|
| `_createElement(data?)` | you call it | Injects `elementId`, `isVisible`, `htmlIndex`, `htmlZIndex`, merges `_getElementState()`, posts `create`, then `_updatePosition(true)`. Must be called once, normally from the instance constructor. |
| `_getElementState()` | you override | Base body is empty (`_getElementState(){}` → returns `undefined`). Result is merged into the `create` payload and sent verbatim as the `update-state` payload. |
| `_updateElementState()` | you call it | Microtask-debounced. Posts `update-state` with `_getElementState()`. |
| `_postToDOMElement(handler, data?)` | you call it | Adds `elementId`, forwards to `_postToDOM`. |
| `_postToDOMElementAsync(handler, data?)` | you call it | |
| `_postToDOMElementMaybeSync(handler, data?)` | you call it | |
| `setElementVisible(isVisible)` | you may call it | Also driven automatically by `_updatePosition`. |
| `focusElement()` / `blurElement()` / `isElementFocused()` | you call it | |
| `setElementCSSStyle(prop, val)` | you call it | **THROWS in r494**, see §5.1 |
| `setElementAttribute(name, val)` | you call it | **THROWS in r494**, see §5.1 |
| `removeElementAttribute(name)` | you call it | **THROWS in r494**, see §5.1 |
| `_getElementInDOMMode()` | you call it | Throws in worker mode by design. |
| `_getElementId()` | you call it | Not in the `.d.ts`, but present in the `.js`. |
| `_tick()` | **engine owns it** | Base implementation is `_tick(){this._updatePosition(!1)}`. Overriding it without `super._tick()` silently freezes element positioning. |
| `_release()` | engine owns it | Base does `super._release()`, `this.plugin._removeElement(...)`, `this._postToDOMElement("destroy")`. Any override must call `super._release()`. |
| `_onElemFocused()` / `_onElemBlurred()` | engine owns it | Registered by the plugin base. |

### DOM side — `DOMElementHandler`

From `preview/workers/domElementHandler.js:1`:

- `constructor(iRuntime, componentId)` — registers handlers for `create`, `destroy`, `set-visible`,
  `update-position`, `update-state`, `focus`, `set-css-style`, `set-attribute`,
  `remove-attribute`, plus `AddDOMElementMessageHandler("get-element", e => e)`.
- `CreateElement(elementId, e) { throw new Error("required override") }` — **must** be overridden.
- `UpdateState(elem, e) { throw new Error("required override") }` — **must** be overridden.
- `DestroyElement(elem) {}` — optional.
- `_GetFocusElement(elem) { return elem }` — optional override, used for focus/blur wiring.
- `AddDOMElementMessageHandler(handler, func)` / `AddDOMElementMessageHandlers(arr)` — resolves
  `elementId` to the element before calling `func(elem, e)`.
- `PostToRuntimeElement(handler, elementId, data?)` and
  `_PostToRuntimeElementMaybeSync(handler, elementId, data?)`.
- `SetAutoAttach(bool)`, `GetElementById(id)`.
- `_OnCreate` forces `style.boxSizing = "border-box"` and `style.display = "none"` on the
  returned element, then attaches focus/blur listeners and appends it to
  `GetRuntimeInterface().GetHTMLWrapElement(GetAvailableHTMLIndex(htmlIndex))`.

Both `workers/domHandler.js` and `workers/domElementHandler.js` are always loaded, before any
addon DOM-side script: `projectResources.js:1` lists
`window.I_r=[{src:"workers/domHandler.js"},{src:"workers/domElementHandler.js"},{src:"workers/domSide.js"},...]`.
So `self.DOMElementHandler` is always defined. No conditional loading needed.

DOM-side addon scripts are injected as **ES modules**: `preview/workers/domSide.js:1` (around
character offset 272) builds the script tag with `t.async=!1, t.type="module"`. Vite's default
`es` output format for `generated/domside.js` is therefore correct, not accidental.

The engine only calls DOM-element-specific hooks on handlers that pass
`instanceof window.DOMElementHandler` — see `preview/workers/domSide.js:1` around offsets 14406
(`_OnHTMLLayersChanged`) and 15221 (`_GetAllElementStatesForZOrderUpdate`). A plain `DOMHandler`
subclass is never asked for element state, so type A is safe.

---

## 4. Gaps

Numbering is stable; the implementation order in §7 refers to these ids.

---

### G1 — `ISDKDOMPluginBase` is constructed with no options, so every type B addon throws immediately

**Applies to:** type B only.

**Broken:** `template/main.js:69` builds the plugin class with no way to pass constructor options,
and the scaffolded plugin factory calls `super()` bare.

`/Users/ossama/Documents/construct-addon-wizard-scaffold/template/main.js:69`
```js
const plugin = createPlugin(baseClass[runtimeConfig.addonType]);
```

`/Users/ossama/Documents/construct-addon-wizard-scaffold/src/runtime/plugin.js:1-7`
```js
export default function (parentClass) {
  return class extends parentClass {
    constructor() {
      super();
    }
  };
}
```

**What C3 expects:** `preview/interfaces/sdk/ISDKDOMPluginBase.js:1` —
`if(super(), ..., !e?.domComponentId) throw new Error("no DOM component ID specified")`.

**Consequence:** the plugin class is instantiated by the engine at addon load. `super()` passes
`undefined`, the check fails, the addon dies before any instance exists.

**Fix:** mirror what `main.js` already does for the instance. Wrap the base class in an
intermediate class that supplies the options object, so `src/runtime/plugin.js` (user code) can
keep calling `super()` bare and existing projects do not break.

Change `template/main.js:69` from
```js
const plugin = createPlugin(baseClass[runtimeConfig.addonType]);
```
to
```js
const plugin = createPlugin(
  class extends baseClass[runtimeConfig.addonType] {
    constructor() {
      const superObject = {};
      if (runtimeConfig.hasDomside) {
        superObject.domComponentId = runtimeConfig.id;
      }
      super(superObject);
    }
  }
);
```

Gating on `hasDomside` alone is enough, because G2 makes the schema reject
`type: "dom"` with `hasDomside: false`.

Why the **plugin** needs the id at all, when type A only ever needed it on the instance:
`ISDKDOMPluginBase` owns the component message channel and the elementId to instance routing
table (`#n` = component id, `#s` = `Map<elementId, instance>`, `_addElement`, and
`_addElementMessageHandler`, which registers via
`GetRuntime().AddDOMComponentMessageHandler(this.#n, ...)` and looks the instance up by
`e["elementId"]`). One channel serves N element instances, so it cannot live on the instance.
`ISDKDOMInstanceBase` separately requires the id too, and calls `this.plugin._addElement(this)` in
its constructor to get its own element id. Both throw without it.
`ISDKPluginBase.js:1` is `constructor(){super()}` and `ISDKBehaviorBase.js` takes no args either,
so passing an extra ignored object is harmless for the object/world/behavior paths.

---

### G2 — `type: "dom"` and `hasDomside` are decoupled, and nothing validates the pair

**Applies to:** type B.

**Broken:** the `domComponentId` for the instance is gated on `hasDomside`, not on the plugin type.

`/Users/ossama/Documents/construct-addon-wizard-scaffold/template/main.js:47-61`
```js
const Instance = createInstance(
  class extends instanceClass[runtimeConfig.addonType] {
    constructor() {
      const superObject = {};
      if (runtimeConfig.hasDomside) {
        superObject.domComponentId = runtimeConfig.id;
      }
      ...
      super(superObject);
```

`/Users/ossama/Documents/construct-addon-wizard-scaffold/build/schemas.js:217`
```js
  type: Joi.string().valid("world", "object", "dom").required(),
```
`/Users/ossama/Documents/construct-addon-wizard-scaffold/build/schemas.js:228`
```js
  hasDomside: Joi.boolean().required(),
```
No `.when()` links them anywhere in the file.

`/Users/ossama/Documents/construct-addon-wizard-scaffold/template/plugin.js:88-90`
```js
        if (ADDON_INFO.hasDomside) {
          this._info.SetDOMSideScripts(["c3runtime/domside.js"]);
        }
```

**Consequence:** `type = PLUGIN_TYPE.DOM` + `hasDomside = false` (which is exactly what the
VS Code wizard produces, see §2) builds cleanly and then throws
`"no DOM component ID specified"` from `ISDKDOMInstanceBase`'s constructor, and never registers
a DOM-side script at all. A type B addon without a DOM-side script is meaningless.

**Fix, two parts:**

1. `build/schemas.js:228` — force the pair. Replace
   ```js
   hasDomside: Joi.boolean().required(),
   ```
   with
   ```js
   hasDomside: Joi.boolean().required().when("type", {
     is: "dom",
     then: Joi.valid(true).messages({
       "any.only": "hasDomside must be true when type is PLUGIN_TYPE.DOM",
     }),
   }),
   ```
2. Nothing else needed. Do **not** also add `|| type === "dom"` to `template/main.js:51` or
   `template/plugin.js:88`. It is unreachable: `validateAddonConfig.js` is an early step in both
   `build.js` and `doDev.js`, and the step loop `break`s on the first failure (`build.js:83-88`),
   so a config with `type: "dom"` and `hasDomside: false` never reaches code generation.

Also worth fixing while in `schemas.js`: `hasDomside` is `required()` for behaviors too, yet
`template/plugin.js:66` wraps the `SetDOMSideScripts` call in
`if (ADDON_INFO.addonType === "plugin")`, so a behavior can never register one — while
`build/generateAddonJSON.js:9-11` will still add `c3runtime/domside.js` to the file list.
Behavior + `hasDomside: true` is an accepted-but-broken combination.

---

### G3 — `template/domside.js` hardcodes `self.DOMHandler`

**Applies to:** type B.

**Broken:** `/Users/ossama/Documents/construct-addon-wizard-scaffold/template/domside.js:1-11`
```js
import { id as DOM_COMPONENT_ID } from "../config.caw.js";
import createDomClass from "../src/domside/index.js";
self.RuntimeInterface.AddDOMHandlerClass(
  createDomClass(
    class extends self.DOMHandler {
      constructor(iRuntime) {
        super(iRuntime, DOM_COMPONENT_ID);
      }
    }
  )
);
```
Line 5 is the problem. This file is byte-identical in `caw-package/src/template/domside.js`.

**What C3 expects:** `preview/interfaces/sdk/AddonSDK.d.ts:31-39` declares
`IDOMElementHandler extends IDOMHandler` and `AddonSDK.d.ts:49`
`declare var DOMElementHandler: typeof IDOMElementHandler;`. Every built-in element plugin
uses it, e.g. `plugins/html-elements/button/dom/domSide.js:1`
(`const n=class extends self.DOMElementHandler{constructor(t){super(t,e)}...}`).

**Consequence:** a type B addon's DOM side gets none of the create/destroy/set-visible/
update-position/update-state/focus/set-css-style/set-attribute/remove-attribute/get-element
handlers. Every message the engine sends lands on a component with no handler.

**Fix:** branch on the configured plugin type. Change `template/domside.js` to

```js
import { id as DOM_COMPONENT_ID, type as PLUGIN_TYPE } from "../config.caw.js";
import createDomClass from "../src/domside/index.js";

const DomHandlerBase =
  PLUGIN_TYPE === "dom" ? self.DOMElementHandler : self.DOMHandler;

self.RuntimeInterface.AddDOMHandlerClass(
  createDomClass(
    class extends DomHandlerBase {
      constructor(iRuntime) {
        super(iRuntime, DOM_COMPONENT_ID);
      }
    }
  )
);
```

Note `config.caw.js` for a behavior still exports `type` (it is `required()` in the schema, see
`build/schemas.js:217`), so the import is always valid.

Do not gate this on `self.DOMElementHandler` being present — it always is,
per `projectResources.js:1` (`window.I_r` loads `workers/domElementHandler.js` before
`workers/domSide.js`).

---

### G4 — `src/domside/index.js` scaffold gives no `CreateElement` / `UpdateState`

**Applies to:** type B.

**Broken:** `/Users/ossama/Documents/construct-addon-wizard-scaffold/src/domside/index.js:1-7`
```js
export default function (parentClass) {
  return class extends parentClass {
    constructor(iRuntime) {
      super(iRuntime);
    }
  };
}
```

**What C3 expects:** `preview/workers/domElementHandler.js:1` —
`CreateElement(e,t){throw new Error("required override")}` and
`UpdateState(e,t){throw new Error("required override")}`.

**Consequence:** even with G3 fixed, the first `create` message throws `"required override"`.

**Fix:** the scaffolding step must emit a DOM-element flavoured `src/domside/index.js` when
`type === "dom"`. This belongs in the VS Code extension's scaffold command
(`construct-addon-wizard/src/commands/scaffold.ts`, near the `config.caw.js` rewrite at `:342-349`),
because `build/init.js` runs after the files are already on disk. Suggested content:

```js
export default function (parentClass) {
  return class extends parentClass {
    constructor(iRuntime) {
      super(iRuntime);
      // this.AddDOMElementMessageHandlers([["my-message", (elem, e) => { ... }]]);
    }

    // Required. Return the HTMLElement for this instance.
    CreateElement(elementId, e) {
      const elem = document.createElement("div");
      elem.style.position = "absolute";
      this.UpdateState(elem, e);
      return elem;
    }

    // Required. Apply the payload returned by the runtime's _getElementState().
    UpdateState(elem, e) {
      elem.textContent = e["text"];
    }

    // Optional.
    DestroyElement(elem) {}

    // Optional. Return the child element that should receive focus/blur.
    _GetFocusElement(elem) {
      return elem;
    }
  };
}
```

All payload keys must be **quoted string literals** — see G13.

---

### G5 — `src/runtime/instance.js` scaffold never calls `_createElement` and has no `_getElementState`

**Applies to:** type B.

**Broken:** `/Users/ossama/Documents/construct-addon-wizard-scaffold/src/runtime/instance.js:4-11`
```js
export default function (parentClass) {
  return class extends parentClass {
    constructor() {
      super();
      const properties = this._getInitProperties();
      if (properties) {
      }
    }
```

**What C3 expects:** `_createElement()` is the only way an element ever appears.
`preview/interfaces/sdk/ISDKDOMInstanceBase.js:1` — `_createElement(e)` posts the `create`
message and then calls `_updatePosition(true)`. Nothing calls it for you. Both reference plugins
call it at the end of the instance constructor:
`plugins/html-elements/button/c3runtime/runtime.js:1` —
`this.CreateElement({"id":this._id,"className":this._className,"usesAutoFontSize":this._autoFontSize})`
(v1 name; v2 name is `_createElement`).

**Consequence:** the addon loads, no element is created, nothing renders, no error.

**Fix:** the DOM-flavoured scaffold for `src/runtime/instance.js` should look like:

```js
constructor() {
  super();
  const properties = this._getInitProperties();
  this._text = properties ? properties[0] : "";
  this._createElement({ /* one-time create-only data, quoted keys */ });
}

_getElementState() {
  return { "text": this._text };
}
```
plus a comment block documenting the `_updateElementState()` debounce and the `_tick` hazard (G6).

---

### G6 — `_tick` override hazard is undocumented and unguarded

**Applies to:** type B.

**Broken:** nothing in CAW warns that `_tick` is taken.

**What C3 expects:** `preview/interfaces/sdk/ISDKDOMInstanceBase.js:1` —
the constructor calls `this._setTicking(!0)` and the class defines
`_tick(){this._updatePosition(!1)}`. `_updatePosition` is what keeps the HTML element aligned
with the layout object, handles layer visibility, off-screen hiding, HTML layer index changes,
z-index and auto font size.

**Consequence:** a user who writes `_tick() { ... }` in `src/runtime/instance.js` — a completely
normal thing to do, and the pattern used by many CAW addons — silently pins the element at its
initial position forever.

**Fix:** two mitigations.
1. Document it in `AGENTS.md` / `CLAUDE.md` and in the DOM scaffold comment.
2. Add `_tick` and `_tick2` awareness to `build/validateExposedNames.js`. They are already in
   the `ISDKInstanceBase` reserved list at `build/validateExposedNames.js:41-65`, so an *exposed*
   ACE named `_tick` is caught. What is not caught is the user defining `_tick` directly on the
   instance class. Consider emitting a build **warning** (not an error) when `type === "dom"`
   and `src/runtime/instance.js`'s prototype owns `_tick`, telling them to call `super._tick()`.
   `build/validateExposedNames.js:221` already imports and instantiates the instance factory
   against a `DummyBase`, so the prototype is already in hand at that point.

---

### G7 — `info.Set` schema cannot express what a DOM plugin needs, and defaults are wrong for DOM

**Applies to:** type B (and partly type A).

**Broken:** `build/schemas.js:318-333` is a closed allowlist of booleans:
```js
    Set: Joi.object({
      IsResizable: Joi.boolean().default(false),
      IsRotatable: Joi.boolean().default(false),
      Is3D: Joi.boolean().default(false),
      HasImage: Joi.boolean().default(false),
      IsTiled: Joi.boolean().default(false),
      SupportsZElevation: Joi.boolean().default(false),
      SupportsColor: Joi.boolean().default(false),
      SupportsEffects: Joi.boolean().default(false),
      MustPreDraw: Joi.boolean().default(false),
      IsSingleGlobal: Joi.boolean().default(false),
      CanBeBundled: Joi.boolean().default(true),
      IsDeprecated: Joi.boolean().default(false),
      GooglePlayServicesEnabled: Joi.boolean().default(false),
      IsOnlyOneAllowed: Joi.boolean().default(false),
    }).required(),
```
Joi rejects unknown keys by default, so anything not listed is a config error even though
`template/plugin.js:39-46` would happily dispatch it:
```js
      if (ADDON_INFO.info && ADDON_INFO.info.Set) {
        Object.keys(ADDON_INFO.info.Set).forEach((key) => {
          const value = ADDON_INFO.info.Set[key];
          const fn = this._info[`Set${key}`];
```

**Missing vs `sdk/external/IPluginInfo.d.ts:39-81`:**
`SetIsRotatable3D` (`:41`), `SetHasAnimations` (`:45`), `SetIsFont` (`:47`),
`SetHasTilemap` (`:48`), `SetSupportsChangingSampling` (`:57`),
`SetScriptInterfaceNames` (`:81`), `SetTypeScriptDefinitionFiles` (`:80`).
The last two are exactly what the built-in element plugins use
(`t.fi({pi:"IButtonInstance"})`, `t.mi(["c3runtime/IButtonInstance.d.ts"])` in
`plugins/allEditorPlugins.js:1`).

**Also missing:** `AddCommon3DRotationACEs` (`sdk/external/IPluginInfo.d.ts:62`) has no entry in
`build/schemas.js:334-341`:
```js
    AddCommonACEs: Joi.object({
      Position: Joi.boolean().default(false),
      SceneGraph: Joi.boolean().default(false),
      Size: Joi.boolean().default(false),
      Angle: Joi.boolean().default(false),
      Appearance: Joi.boolean().default(false),
      ZOrder: Joi.boolean().default(false),
    }).required(),
```

**Also:** `defaultImageUrl` is gated on `"world"` only, `build/schemas.js:344-348`, so a DOM plugin
cannot set a default editor image:
```js
    .when(Joi.object({ type: Joi.string().valid("world") }).unknown(), {
      then: Joi.object({
        defaultImageUrl: Joi.string().optional(),
      }),
    }),
```
`template/plugin.js:78-86` also gates the `SetDefaultImageURL` call on
`ADDON_INFO.type === "world"`.

**Fix:**
1. Add `ScriptInterfaceNames: Joi.object({instance: Joi.string(), objectType: Joi.string(), plugin: Joi.string()}).optional()`
   and `TypeScriptDefinitionFiles: Joi.array().items(Joi.string()).optional()` to the `Set` block.
   `template/plugin.js:39-46` needs no change; it already dispatches by name.
   Verify the value shapes against `sdk/external/IPluginInfo.d.ts:80-81`.
2. Add the missing booleans (`IsRotatable3D`, `HasAnimations`, `IsFont`, `HasTilemap`,
   `SupportsChangingSampling`).
3. Add `Rotation3D: Joi.boolean().default(false)` to `AddCommonACEs`.
   `template/plugin.js:71-76` builds the method name as `AddCommon${key}ACEs`, so the key must be
   spelled to produce `AddCommon3DRotationACEs`. A JS identifier cannot start with a digit but an
   object key can be a quoted string, so use `"3DRotation": Joi.boolean().default(false)`.
4. Widen the `defaultImageUrl` gate at `schemas.js:344` to `.valid("world", "dom")` and
   `template/plugin.js:80` to `["world", "dom"].includes(ADDON_INFO.type)`. Low priority.
5. Change the **scaffolded defaults** when the wizard writes `PLUGIN_TYPE.DOM`, to match all three
   built-in element plugins: `IsResizable: true`, and `AddCommonACEs` =
   `{ Position: true, Size: true, SceneGraph: true, ZOrder: true, Angle: false, Appearance: false }`.

---

### G8 — `config.caw.js` comments mislabel DOM-relevant options as "world only"

**Applies to:** type B, documentation.

`/Users/ossama/Documents/construct-addon-wizard-scaffold/config.caw.js:45-46`
```js
  // PLUGIN world only
  // defaultImageUrl: "default-image.png",
```
`/Users/ossama/Documents/construct-addon-wizard-scaffold/config.caw.js:56-65`
```js
    // PLUGIN world only
    IsResizable: false,
    IsRotatable: false,
    Is3D: false,
    HasImage: false,
    ...
```
`IsResizable` is set by every built-in DOM element plugin. The comment tells DOM addon authors to
skip the one option they most need.

**Fix:** change the comment to `// PLUGIN world and dom` for `IsResizable`, and split the block so
that genuinely world-only options (`HasImage`, `IsTiled`, `SupportsEffects`, `MustPreDraw`,
`SupportsColor`, `Is3D`, `IsRotatable`) stay labelled world-only.

---

### G9 — editor-side instance for a DOM plugin draws nothing and has no default size

**Applies to:** type B.

**Broken:** `template/editor.js:24-33` maps `dom` to `SDK.IWorldInstanceBase`, which is correct:
```js
const pluginInstanceParentClass = {
  object: SDK.IInstanceBase,
  world: SDK.IWorldInstanceBase,
  dom: SDK.IWorldInstanceBase,
};
```
But `/Users/ossama/Documents/construct-addon-wizard-scaffold/src/editor/instance.js:1-15` has no
`Draw` and no `OnPlacedInLayout`:
```js
export default function (instanceClass) {
  return class extends instanceClass {
    constructor(sdkType, inst) {
      super(sdkType, inst);
    }
    Release() {}
    OnCreate() {}
    OnPlacedInLayout() {}
    OnPropertyChanged(id, value) {}
  };
}
```

**What C3 expects:** `sdk/external/IWorldInstanceBase.d.ts:9-10`
```ts
Draw(iRenderer: SDK.Gfx.IWebGLRenderer, iDrawParams: SDK.Gfx.IDrawParams): void;
OnPlacedInLayout(iLayoutView?: SDK.UI.ILayoutView): void;
```
Button's editor instance implements both (`plugins/allEditorPlugins.js:1`, mangled `Ye` = `Draw`,
`Us` = `OnPlacedInLayout` with `this.Xe.sn(72,24)` setting a 72x24 default size — mapping of `Us`
and `sn` is inferred from the surrounding code, **unverified**).

**Consequence:** not a crash. A DOM plugin placed in a layout renders as nothing in the layout
view, and defaults to whatever size the editor picks. Poor but survivable.

**Fix:** ship a DOM-flavoured `src/editor/instance.js` from the scaffold with a placeholder
`Draw` (filled rect + label) and an `OnPlacedInLayout` that sets a sensible default size. This is
scaffold content, not framework logic.

---

### G10 — `buildDomside` fails silently when `src/domside/index.js` is missing

**Applies to:** both types.

`/Users/ossama/Documents/construct-addon-wizard-scaffold/build/buildDomside.js:10-17`
```js
export default async function buildDomside() {
  if (!hasDomside) return false;
  if (!fs.existsSync("../src/domside/index.js")) {
    return false;
  }
  chalkUtils.step("Vite domside build");
  return await doVite(viteConfig);
}
```
`return false` means "no error" to `build/build.js:31-91`. The real failure surfaces two steps
later as a confusing file-not-found:
`/Users/ossama/Documents/construct-addon-wizard-scaffold/build/processDependencies.js:31-41`
```js
  if (hasDomside) {
    const src = path.resolve("../generated/domside.js");
    const dest = path.resolve("../dist/export/c3runtime/domside.js");

    if (!fs.existsSync(src)) {
      chalkUtils.error(`File not found: ${chalkUtils._errorUnderline(src)}`);
      hadError = true;
```

**Fix:** in `build/buildDomside.js:12-14`, emit
`chalkUtils.error("hasDomside is true but src/domside/index.js does not exist")` and
`return true` (hadError).

Also delete the dead imports at `buildDomside.js:2-3` (`webpackConfig`, `doWebpack`) and `:6`
(`fromConsole` is used at `:20`, keep that one).

---

### G11 — `generated/domside.js` is never terser-validated, and could not be at its current position

**Applies to:** both types.

`/Users/ossama/Documents/construct-addon-wizard-scaffold/build/validateTerser.js:23-26`
```js
  const filesToCheck = [
    "../dist/export/c3runtime/main.js",
    "../dist/export/editor.js",
  ];
```
`domside.js` is absent. And even if added, `build/build.js:21-22` runs
`./validateTerser.js` **before** `./buildDomside.js`, so the file does not exist yet.

**Why it matters:** the terser step exists because Construct's exporter minifies addon scripts
with property mangling and `keep_quoted`. Anything read or written with an unquoted property name
in a message payload gets renamed and the two sides stop agreeing. The DOM element protocol is
entirely payload-driven (`"elementId"`, `"isVisible"`, `"htmlIndex"`, `"htmlZIndex"`, `"left"`,
`"top"`, `"width"`, `"height"`, `"fontSize"`, `"prop"`, `"val"`, `"name"`, `"focus"`), so type B
is far more exposed to this than type A.

**Whether the exporter actually minifies dom-side scripts is unverified** — see §6.

**Fix:** move `"./buildDomside.js"` above `"./validateTerser.js"` in `build/build.js:21-22`
and in `build/doDev.js`, then add `"../generated/domside.js"` to `validateTerser.js:23-26`.
Reordering is safe: `buildDomside` writes to `generated/`, `exportWebpack` writes to
`dist/export/`, and nothing in `buildDomside` depends on `exportWebpack`.

---

### G12 — `validateExposedNames` reserved lists are incomplete for DOM

**Applies to:** type B.

The DOM list is present and mostly current.
`/Users/ossama/Documents/construct-addon-wizard-scaffold/build/validateExposedNames.js:140-156`
```js
// ISDKDOMInstanceBase (extends ISDKWorldInstanceBase)
const ISDKDOMInstanceBase = [
  "_postToDOMElement",
  "_postToDOMElementAsync",
  "_postToDOMElementMaybeSync",
  "_createElement",
  "focusElement",
  "blurElement",
  "isElementFocused",
  "setElementCSSStyle",
  "setElementAttribute",
  "removeElementAttribute",
  "setElementVisible",
  "_getElementState",
  "_updateElementState",
  "_getElementInDOMMode",
];
```
Dispatch at `build/validateExposedNames.js:191-208` is correct:
```js
  if (pluginType === "world" || pluginType === "dom") {
    names.push(...IWorldInstance, ...ISDKWorldInstanceBase);
  }

  if (pluginType === "dom") {
    names.push(...ISDKDOMInstanceBase);
  }
```

**Missing against `preview/interfaces/sdk/ISDKDOMInstanceBase.js:1`:**
- `_getElementId` — present in the `.js`, absent from the `.d.ts` and from CAW's list.
- `_onElemFocused` and `_onElemBlurred` — called by `ISDKDOMPluginBase`'s constructor-registered
  handlers. A user exposing an ACE named `_onElemFocused` would silently hijack focus tracking.
- `_updatePosition` and `_shouldPreserveElement` — private-ish but real prototype members.
- `_release` and `_tick` are covered by the `ISDKInstanceBase` list at `:41-65`.

**Also missing entirely:** there is no `ISDKDOMPluginBase` list.
`_addElement`, `_removeElement`, `_addElementMessageHandler`, `_addElementMessageHandlers`.
The subagent audit confirmed grep for `ISDKDOMPluginBase` in `build/` returns nothing.
This is arguably out of scope — `template/main.js:62-64` only does
`Object.assign(Instance.prototype, ...)`, never the plugin prototype — but if CAW ever grows
plugin-level exposed names it will matter.

**Fix:** append `"_getElementId"`, `"_onElemFocused"`, `"_onElemBlurred"`, `"_updatePosition"`,
`"_shouldPreserveElement"` to the list at `validateExposedNames.js:141-156`.

---

### G13 — nothing documents or enforces quoted-key discipline in DOM payloads

**Applies to:** both types, critically type B.

Every built-in uses quoted keys on both sides. `plugins/html-elements/textinput/dom/domSide.js:1`:
```js
UpdateState(e,t){e.value=t["text"],e.placeholder=t["placeholder"],e.title=t["title"],
e.disabled=!t["isEnabled"],e.readOnly=t["isReadOnly"],e.spellcheck=t["spellCheck"];
const n=t["maxLength"];...}
```
and `plugins/html-elements/textinput/c3runtime/runtime.js:1`:
```js
GetElementState(){return{"text":this._text,"placeholder":this._placeholder,...}}
```

The engine itself does the same in `ISDKDOMInstanceBase.js:1` and `domElementHandler.js:1`.

CAW's `validateTerser` step name is literally
`"Validating Terser build (mangle-props keep_quoted)"` (`build/validateTerser.js:21`), so skymen
already knows the rule. It is just not written down for DOM authors and not checked on the
DOM-side output (G11).

**Fix:** documentation in the DOM scaffold comments and in `AGENTS.md`, plus G11's terser check.

---

### G14 — `self.IDOMInstance` is not usable as a script-interface base for an SDK v2 DOM plugin

**Applies to:** type B, script interfaces.

`preview/interfaces/objects/IDOMInstance.js:1`
```js
self.IDOMInstance = class extends self.IWorldInstance {
  #e;
  constructor(){ super(), this.#e = self.IInstance._GetInitInst() }
  getElement(){ return this.#e.GetSdkInstance()._GetElementInDOMMode() }
  focus(){ this.#e.GetSdkInstance().FocusElement() }
  blur(){ this.#e.GetSdkInstance().BlurElement() }
  setCssStyle(e,t){ C3X.RequireString(e), this.#e.GetSdkInstance().SetElementCSSStyle(e,t) }
};
```
Those four method names — `_GetElementInDOMMode`, `FocusElement`, `BlurElement`,
`SetElementCSSStyle` — are the **SDK v1** names on `C3.SDKDOMInstanceBase`. The v2 base class
`ISDKDOMInstanceBase` spells them `_getElementInDOMMode`, `focusElement`, `blurElement`,
`setElementCSSStyle` (`preview/interfaces/sdk/ISDKDOMInstanceBase.d.ts:11-24`).

**Consequence:** a v2 DOM element addon whose script interface extends `self.IDOMInstance` will
have `getElement()`, `focus()`, `blur()` and `setCssStyle()` all throw
`TypeError: ... is not a function`. Declared in `IDOMInstance.d.ts:4-14` as if it works.

This is a Scirra bug, see §5.3. For CAW the practical consequence is: **do not scaffold a DOM
script interface extending `IDOMInstance`.** Extend `IWorldInstance` and reimplement the four
methods against the v2 names, or omit the script interface until Scirra fixes it.

CAW cannot express `SetScriptInterfaceNames` at all today anyway — see G7.

---

## 5. Scirra engine bugs in r494

Three bugs in Scirra's own engine code block parts of the type B path regardless of what CAW does.
Full detail, exact locations and paste-ready report text moved to
[scirra-r494-dom-bugs.md](scirra-r494-dom-bugs.md).

Short version:

1. `ISDKDOMInstanceBase.setElementCSSStyle` / `setElementAttribute` / `removeElementAttribute` all
   call a method that does not exist and throw. No CAW workaround short of monkey-patching.
2. `ISDKDOMPluginBase._addElementMessageHandlers` recurses into itself, so the batch API is
   unusable. Easy workaround: loop the singular form.
3. `IDOMInstance` calls SDK v1 method names, so it cannot be a script-interface base for a v2 DOM
   plugin. See G14.

---

## 6. What I could not verify, and how skymen can settle it

1. **Whether a `PLUGIN_TYPE.DOM` CAW addon works end to end after the fixes.**
   No such addon exists anywhere on this machine, and I did not build or run one.
   *Check:* scaffold a minimal DOM addon that creates a `<div>` with a text property, apply
   G1/G2/G3/G4/G5, `npm run dev`, add it via the dev-server addon.json, place it in a layout,
   preview in both DOM mode and worker mode, and confirm the div tracks the object as you move it.

2. **Whether Construct's exporter minifies addon `dom-side-scripts` with property mangling.**
   I found no exporter code in the r494 dump that does it, and `validateTerser.js` does not check
   `domside.js`. Existing type A addons pass unmangled quoted keys anyway so it has never been
   tested against.
   *Check:* build a domside script that reads an unquoted payload key, export the project as
   HTML5 with minification on, and inspect the exported `c3runtime/domside.js`.

3. **The exact mangled-name mapping for Button's editor calls `Qs`, `qs`, `Ks`, `di`, `Zs`.**
   None of them appear in `main.js`'s `window.SDK.IPluginInfo` wrapper, so they are internal
   editor APIs with no public SDK equivalent. `Zs({"set-visible":2,"set-css-style":5,...})` looks
   like an ACE-index map for built-in DOM element actions and is almost certainly unavailable to
   third-party addons.
   *Check:* ask Scirra, or diff against a release where `allEditorPlugins.js` is unminified.

4. **Whether `Us` in Button's editor instance is `OnPlacedInLayout` and `sn` is `SetSize`.**
   Inferred from position and from `sdk/external/IWorldInstanceBase.d.ts:10`. Not confirmed.
   *Check:* write a CAW world plugin, implement `OnPlacedInLayout` calling `this._inst.SetSize`,
   and see whether the editor honours it.

5. **Whether `SetScriptInterfaceNames` and `SetTypeScriptDefinitionFiles` work for third-party
   SDK v2 addons.** They exist on `SDK.IPluginInfo` (`sdk/external/IPluginInfo.d.ts:80-81`) and
   `template/plugin.js:39-46` would dispatch them, but `build/schemas.js:318-333` blocks them and
   nobody has tried.
   *Check:* temporarily loosen the schema with `.unknown(true)` and try it on any CAW plugin.

6. **Whether `hasDomside = true` on a behavior has ever produced a working addon.**
   `template/plugin.js:66` gates `SetDOMSideScripts` on `addonType === "plugin"`, so it should be
   impossible, but I did not test.
   *Check:* set `hasDomside = true` on a behavior project and see whether the DOM component ever
   receives a message.

7. **Whether the `_tick` override hazard actually manifests.** Reasoned from
   `ISDKDOMInstanceBase.js:1` (`_tick(){this._updatePosition(!1)}`) and normal JS override
   semantics. Not observed.
   *Check:* in the test addon from item 1, add `_tick() {}` to `src/runtime/instance.js` and
   confirm the element stops following the object.

8. **HMR / dev-server behaviour for the DOM side.** `build/dev.js:80-82` serves
   `dist/export` statically and `build/dev.js:70-78` watches `../src` with chokidar, so editing
   `src/domside/index.js` does re-run `doDev.js` and rebuild `domside.js`. But C3 must reload the
   preview for the new module to be fetched — there is no true HMR. Also `build/dev.js:47-48`
   (`if (buildRunning) return;`) **drops** rebuild requests that arrive while one is in flight,
   so rapid edits can leave a stale `domside.js`.
   *Check:* edit `src/domside/index.js` twice within one build cycle and see whether the second
   edit lands.

9. **npm imports on the DOM side.** The port skill claims "Domside is Vite-bundled → npm
   imports/modules now work". `build/vite_domside_config.js:1-16` sets no `build.lib`, no
   `rollupOptions.external` and no `ssr`, so bare-specifier imports **are** bundled into
   `generated/domside.js`. That part checks out by construction. What is **not** safe is a
   **dynamic** `import()` in DOM-side code: with no `output.inlineDynamicImports`, Rollup will
   emit a separate chunk into `generated/`, and `build/processDependencies.js:31-41` copies only
   `generated/domside.js`, so the chunk never ships.
   *Check:* put `await import("some-pkg")` in `src/domside/index.js`, build, and look at what
   lands in `generated/` versus `dist/export/c3runtime/`.
   *Likely fix if confirmed:* add `output: { inlineDynamicImports: true }` to
   `build/vite_domside_config.js`.

10. **Source maps.** `build/vite_domside_config.js` sets no `build.sourcemap`, so Vite's default
    (`false`) applies and `domside.js` ships minified with no map. Same for `main.js`. Stated from
    the absence of the option, not from an observed build.

11. **Whether the port skill's `references/api-mapping.md` needs updating.** Its section 5
    (`api-mapping.md:74-85`) covers type A only and says "component id = addon id automatically",
    which is true for the instance and false for the plugin (G1). It never mentions
    `DOMElementHandler`, `PLUGIN_TYPE.DOM`, or the element lifecycle. That file is outside both
    CAW repos so I did not touch it, but it will mislead anyone porting a v1 DOM element plugin.

---

## 7. Suggested implementation order

Phase 1 — make type B possible at all. Each of these is a blocker; none is useful alone.

1. **G1** — `template/main.js:69`, wrap the plugin base class so `domComponentId` reaches
   `ISDKDOMPluginBase`. Apply to both `construct-addon-wizard-scaffold/template/main.js` and
   `caw-package/src/template/main.js`.
2. **G3** — `template/domside.js:5`, branch to `self.DOMElementHandler` when `type === "dom"`.
   Both copies.
3. **G2** — `build/schemas.js:228` force `hasDomside: true` for `type: "dom"`, and defensively
   OR the type check into `template/main.js:51` and `template/plugin.js:88`. Both copies for the
   templates; `caw-package/src/build/schemas.js` is identical to the scaffold's so patch both.

At this point a hand-written type B addon should load. **Stop and test** (§6 item 1) before going
further — everything below is polish on top of a path that must first be proven.

Phase 2 — make it usable.

4. **G4** and **G5** — DOM-flavoured `src/domside/index.js` and `src/runtime/instance.js` in the
   VS Code extension's scaffold command
   (`construct-addon-wizard/src/commands/scaffold.ts`, near `:342-349`). Include the G5.2
   workaround comment for the `_addElementMessageHandlers` engine bug and the G13 quoted-key rule.
5. **G7 item 5** and **G8** — correct defaults (`IsResizable: true`, Position/Size/SceneGraph/
   ZOrder common ACEs) and fixed comments in the scaffolded `config.caw.js` for `PLUGIN_TYPE.DOM`.
6. **G6** — document the `_tick` hazard in `AGENTS.md`, `CLAUDE.md` and the DOM scaffold comment.
7. **G9** — placeholder `Draw` and `OnPlacedInLayout` in the DOM-flavoured `src/editor/instance.js`.

Phase 3 — build-pipeline hardening. Independent of the above, safe to do any time.

8. **G10** — make `buildDomside` fail loudly.
9. **G11** — move `buildDomside` before `validateTerser` in `build/build.js:21-22` and
   `build/doDev.js`, then add `generated/domside.js` to `validateTerser.js:23-26`.
10. **G12** — extend the `ISDKDOMInstanceBase` reserved list in
    `build/validateExposedNames.js:141-156`.
11. **G7 items 1-4** — widen the `info.Set` and `AddCommonACEs` schemas.

Phase 4 — upstream.

12. File the three Scirra bugs from §5. 5.1 and 5.2 block `setElementCSSStyle` /
    `setElementAttribute` / `removeElementAttribute` / `_addElementMessageHandlers` for everyone,
    v1 and v2 alike, and no CAW change can work around 5.1 short of monkey-patching
    `ISDKDOMInstanceBase.prototype`.
13. **G14** — once 5.3 is resolved, revisit whether CAW should scaffold a DOM script interface.

Phase 5 — verification. Work through §6 items 1, 2, 7, 9 with a real test addon.
