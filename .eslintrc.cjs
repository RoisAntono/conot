module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "script"
  },
  ignorePatterns: [
    "node_modules/",
    "coverage/",
    "data/backups/"
  ],
  overrides: [
    {
      files: ["test/**/*.js"],
      env: {
        node: true
      }
    }
  ],
  rules: {
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }]
  }
};
