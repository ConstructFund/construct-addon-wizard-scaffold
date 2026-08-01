import * as chalkUtils from "./chalkUtils.js";
import { addonType, type } from "../config.caw.js";
import { domTickValidation } from "../buildconfig.js";
import fromConsole from "./fromConsole.js";

export default async function validateDomInstance() {
  if (addonType !== "plugin" || type !== "dom") return false;

  if (domTickValidation === "skip") {
    chalkUtils.step("Validating DOM instance");
    chalkUtils.info(
      "DOM instance validation is disabled (domTickValidation = 'skip')"
    );
    return false;
  }

  chalkUtils.step("Validating DOM instance");

  let InstanceClass;
  try {
    const instanceModule = await import("../src/runtime/instance.js");

    class DummyBase {
      _getInitProperties() {
        return null;
      }
      _trigger() {}
      _release() {}
      _tick() {}
    }

    InstanceClass = instanceModule.default(DummyBase);
  } catch (e) {
    chalkUtils.error(
      `Failed to analyze instance class: ${e.message}\n${e.stack}`
    );
    return true;
  }

  const proto = InstanceClass.prototype;
  const overridesTick = Object.getOwnPropertyNames(proto).includes("_tick");

  if (!overridesTick || /super\s*\.\s*_tick\s*\(/.test(proto._tick.toString())) {
    chalkUtils.success("DOM instance is valid!");
    return false;
  }

  chalkUtils.warning(
    "src/runtime/instance.js overrides _tick without calling super._tick()."
  );
  chalkUtils.warning(
    "ISDKDOMInstanceBase uses _tick to position the DOM element, so the element will not follow the instance."
  );
  chalkUtils.warning(
    "Add super._tick() to the override, or set domTickValidation in buildconfig.js to 'warning' or 'skip'."
  );

  if (domTickValidation === "warning") {
    chalkUtils.info("DOM instance validation completed with warnings.");
    return { hadOptionalError: true };
  }
  return true;
}

// if is being called from the command line
if (fromConsole(import.meta.url)) {
  chalkUtils.fromCommandLine();
  validateDomInstance();
}
