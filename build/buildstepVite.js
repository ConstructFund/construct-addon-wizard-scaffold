import * as chalkUtils from "./chalkUtils.js";
import doVite from "./vite.js";
import viteConfig from "./vite_buildstep_config.js";
import fromConsole from "./fromConsole.js";

export default async function buildstepVite() {
  chalkUtils.step("Vite intermediate build");
  return await doVite(viteConfig);
}

// if is being called from the command line
if (fromConsole(import.meta.url)) {
  chalkUtils.fromCommandLine();
  buildstepVite();
}
