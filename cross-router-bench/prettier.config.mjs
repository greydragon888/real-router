/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */

const config = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  jsxSingleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  arrowParens: "always",
  // lf to match .editorconfig `end_of_line = lf` (the repo has no CRLF files);
  // "auto" only preserved whatever was there, leaving EOL unenforced (#735).
  endOfLine: "lf",
};

export default config;
