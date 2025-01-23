import fs from "fs";
import path from "path";
import * as chalkUtils from "./chalkUtils.js";
import fromConsole from "./fromConsole.js";

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const hasDebugger = content.includes("debugger;");
  return hasDebugger;
}

function validateSrcFolder(srcPath) {
  let hadError = false;
  chalkUtils.step("Validating src folder for debugger statements");

  function traverseDirectory(directory) {
    const files = fs.readdirSync(directory);
    files.forEach((file) => {
      const fullPath = path.join(directory, file);
      if (fs.statSync(fullPath).isDirectory()) {
        traverseDirectory(fullPath);
      } else if (path.extname(fullPath) === ".js") {
        if (validateFile(fullPath)) {
          chalkUtils.error(`Debugger statement found in: ${chalkUtils._errorUnderline(fullPath)}`);
          hadError = true;
        }
      }
    });
  }

  traverseDirectory(srcPath);

  if (hadError) {
    chalkUtils.failed("Some files in the src folder contain debugger statements.");
  } else {
    chalkUtils.success("No debugger statements found in the src folder!");
  }
  return hadError;
}

export default function validateSrc() {
  const srcPath = path.resolve("../src");
  return validateSrcFolder(srcPath);
}

// if is being called from the command line
if (fromConsole(import.meta.url)) {
  chalkUtils.fromCommandLine();
  validateSrc();
}