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
