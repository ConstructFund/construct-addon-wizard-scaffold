# Dead code in the build scripts

Status: **not fixed.**

Four unrelated pieces of dead code in `build/`. None affects a normal build. Three are broken
command-line entry points, one is a leftover from c3ide2. Grouped because they are all the same size
of job.

Land any fix in both `construct-addon-wizard-scaffold/build/` and `caw-package/src/build/` — see the
canonical-repo section of [dom-addon-support.md](dom-addon-support.md).

---

## 1. `runAceDefiner.js` calls a function it never imports

`build/runAceDefiner.js:26`, in the run-from-console block:

```js
if (fromConsole(import.meta.url)) {
  chalkUtils.fromCommandLine();
  generateAceFiles();
}
```

The file imports only `fs`, `chalkUtils` and `fromConsole`. `generateAceFiles` is undefined, so
running this script directly throws `ReferenceError`.

It also calls the wrong function. The module's own export is `runAceDefiner`, which is almost
certainly what the entry point meant to call.

**Fix:** change the call to `runAceDefiner()`. Do not import `generateAceFiles` — that would make the
script do something different from its name.

---

## 2 and 3. Both wrapper-extension scripts call an unimported `build`

`build/generateWrapperExtension.js:139-144`:

```js
if (fromConsole(import.meta.url)) {
  const dependsOn = [];
  build(dependsOn).then((hadError) => {
    if (hadError) return;
    buildWrapperExtension();
  });
}
```

`build/generateWrapperExtensionDev.js:19-24` has the identical block calling
`buildWrapperExtensionDev()`.

Neither file imports `build`. `generateWrapperExtension.js` imports `fs`, `path`, `exec`,
`chalkUtils`, `config`, `fromConsole`. `generateWrapperExtensionDev.js` imports
`buildWrapperExtension`, `config`, `fromConsole`.

Both throw `ReferenceError: build is not defined` when run directly. The `dependsOn` array is empty
in both, which suggests the dependency mechanism was never wired up here.

**Fix:** either import `build` from `./build.js` and pass a real `dependsOn`, or drop the `build(...)`
wrapper and call the builder directly. Needs a decision about whether these scripts are meant to be
run standalone at all. If they are not, delete the blocks.

---

## 4. Unsupported ACE config keys in `generateAcesJSON.js`

`build/generateAcesJSON.js` has three near-identical switch statements (conditions at ~:26, actions
at ~:71, expressions at ~:117) that skip keys when copying an ACE config into `aces.json`. Each skips
eight keys:

```
category  forward  handler  autoScriptInterface  listName  displayText  description  params
```

The last four are correct. They are real schema keys that belong in the lang file, not `aces.json`.

The first four cannot occur. None is in `commonSchema` or `expressionSchema` (`build/schemas.js:59`
and `:94`), both of which are closed Joi objects, and `build/validateAceConfigs.js:55` validates with
`{abortEarly: false}` and no `allowUnknown`, so Joi's default rejects unknown keys. An ACE config
containing any of the four is a build error before the generator runs.

They are leftovers from c3ide2, where ACEs were declared in one central config blob rather than one
file each. `autoScriptInterface` in particular was c3ide2's script-interface opt-in; CAW's `expose`
replaced it.

**Fix:** delete the four cases from all three switch statements. No functional change. Removes a
misleading signal that those keys are supported.

**Related, do not change:** `scriptName` is set to the filename key at `:24`, `:69` and `:114` and is
not overridable. That is correct and should stay. It is editor-only metadata (it appears in the
engine's `main.js`, `projectResources.js` and the two `allAces.json` files, and nowhere under
`preview/`), and because CAW's `expose` grafts methods by the same filename key, `scriptName` can
never disagree with the real method name. Making it overridable would allow exactly that
disagreement.
