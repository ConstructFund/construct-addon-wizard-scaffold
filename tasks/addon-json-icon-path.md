# Custom icon path is ignored in addon.json

Status: **not fixed.**

Not DOM-specific. Found while reading the build pipeline for
[dom-addon-support.md](dom-addon-support.md).

## What is wrong

`config.caw.js` puts `icon` inside the `info` export:

```js
export const info = {
  // icon: "icon.svg",
  ...
};
```

The schema agrees. `build/schemas.js:316-317`:

```js
info: Joi.object({
  icon: Joi.string().optional(),
```

`build/validateIcon.js` reads it correctly:

```js
import { info } from "../config.caw.js";
let icon = info.icon || "icon.svg";
```

and copies `../src/<icon>` to `../dist/export/<icon>`.

But `build/generateAddonJSON.js:53` reads it off the wrong object:

```js
config.icon ? config.icon : "icon.svg",
```

`config` there is `../template/addonConfig.js`, where the icon lives at `config.info.icon`. The same
function reads `config.info.defaultImageUrl` correctly at line 27, which is what makes this look like
a slip rather than a deliberate difference.

## Why it matters

`config.icon` is always `undefined`, so the `file-list` in `addon.json` always says `icon.svg`.

With a custom icon set, the two halves disagree:

- `validateIcon.js` copies the real file, so `dist/export/myicon.svg` exists.
- `generateAddonJSON.js` lists `icon.svg`, which does not exist.

So the packaged addon lists a file it does not ship, and ships a file it does not list. Whether C3
rejects the addon outright or just falls back is **unverified** — nobody appears to have set a custom
icon.

With the default icon everything works, which is why this has gone unnoticed.

## Fix

`build/generateAddonJSON.js:53`:

```js
config.info.icon ? config.info.icon : "icon.svg",
```

Land it in both `construct-addon-wizard-scaffold/build/` and `caw-package/src/build/` — see the
canonical-repo section of [dom-addon-support.md](dom-addon-support.md) for why.

## Check afterwards

Set `info.icon = "myicon.svg"` in a test addon, put the file in `src/`, build, and confirm
`dist/export/addon.json`'s `file-list` names `myicon.svg` and that the file is present in the
`.c3addon`.
