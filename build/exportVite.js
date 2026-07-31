import * as chalkUtils from "./chalkUtils.js";
import doVite from "./vite.js";
import viteConfig1 from "./vite_export_config1.js";
import viteConfig2 from "./vite_export_config2.js";
import fromConsole from "./fromConsole.js";

export default async function exportVite() {
  chalkUtils.step("Vite export build");
  return (await Promise.all([doVite(viteConfig1), doVite(viteConfig2)])).reduce(
    (acc, cur) => acc || cur,
    false
  );
}

// if is being called from the command line
if (fromConsole(import.meta.url)) {
  chalkUtils.fromCommandLine();
  exportVite();
}
