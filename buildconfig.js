// Fail if language files in extra lang are missing keys or have extra keys
export const failOnMalformedExtraLang = true;

// Post build cleanup configuration
export const cleanup = {
  keepExport: false,
  keepExportStep: false,
  keepGenerated: false,
  disableTip: false,
};

export const failOnUnusedFiles = true;

export const disableTips = false;

export const disableWarnings = false;

// Terser validation configuration
// Options: "error" (fail build), "warning" (show warning but continue), "skip" (disable check)
export const terserValidation = "error";

// DOM plugin instance validation configuration
// Checks that a DOM plugin overriding _tick still calls super._tick(), which the
// SDK uses to position the element. Only runs for plugins with type DOM.
// Options: "error" (fail build), "warning" (show warning but continue), "skip" (disable check)
export const domTickValidation = "error";

export const publishConfig = {
  addonUrl: "", // e.g., "https://www.construct.net/en/make-games/addons/111/my-addon"
  itchioPage: "", // Format: "username/page-id" (taken from https://username.itch.io/page-id)
  autoGenReadme: true,
};
