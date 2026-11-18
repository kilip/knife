export default {
  paths: ["e2e/features/**/*.feature"],
  import: ["e2e/support/world.ts", "e2e/support/hooks.ts", "e2e/steps/**/*.steps.ts"],
  format: ["progress-bar", "html:e2e/reports/cucumber-report.html"],
  publishQuiet: true,
};
