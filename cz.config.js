import { TYPES, SCOPES } from "./commitlint.config.mjs";

const TYPE_DESCRIPTIONS = {
  feat: "New feature",
  fix: "Bug fix",
  docs: "Documentation only changes",
  style: "Code style (formatting, etc)",
  refactor: "Code change without bug fix or feature",
  perf: "Performance improvements",
  test: "Adding or correcting tests",
  build: "Build system or dependencies",
  ci: "CI configuration",
  chore: "Other changes",
  revert: "Reverts a previous commit",
  release: "Release commit",
};

/** @type {import('czg').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  types: TYPES.map((value) => ({
    value,
    name: `${value}:`.padEnd(12) + TYPE_DESCRIPTIONS[value],
  })),
  scopes: SCOPES,
  scopeOverrides: {
    fix: [
      "core",
      "core-types",
      "route-tree",
      "search-params",
      "type-guards",
      "helpers",
      "logger",
      "browser-plugin",
      "logger-plugin",
      "persistent-params-plugin",
      "react",
    ].map((name) => ({ name })),
  },
  allowEmptyScopes: true,
  allowCustomScopes: true,
  allowBreakingChanges: ["feat", "fix"],
  upperCaseSubject: false,
  markBreakingChangeMode: true,
  breaklineNumber: 100,
  breaklineChar: "|",
  issuePrefixes: [
    { value: "closed", name: "closed:   ISSUES has been processed" },
  ],
  customIssuePrefixAlign: "top",
  emptyIssuePrefixAlias: "skip",
  customIssuePrefixAlias: "custom",
  confirmColorize: true,
  minSubjectLength: 0,
  defaultSubject: "",
  messages: {
    type: "Select the type of change that you're committing:",
    scope: "Denote the SCOPE of this change (optional):",
    customScope: "Denote the SCOPE of this change:",
    subject: "Write a SHORT, IMPERATIVE tense description of the change:\n",
    body: 'Provide a LONGER description of the change (optional). Use "|" to break new line:\n',
    breaking:
      'List any BREAKING CHANGES (optional). Use "|" to break new line:\n',
    footerPrefixesSelect:
      "Select the ISSUES type of changeList by this change (optional):",
    customFooterPrefix: "Input ISSUES prefix:",
    footer: "List any ISSUES by this change. E.g.: #31, #34:\n",
    confirmCommit: "Are you sure you want to proceed with the commit above?",
  },
};
