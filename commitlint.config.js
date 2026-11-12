export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 80],
    "scope-empty": [2, "always"],
  },
};
