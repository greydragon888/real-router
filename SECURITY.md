# Security Policy

## Supported Versions

Every `@real-router/*` package is `0.x`, and each one is versioned on its own. Security fixes are released for the latest minor of each package; earlier minors receive no backports.

| Version                                | Supported          |
| -------------------------------------- | ------------------ |
| The latest `0.x` minor of each package | :white_check_mark: |
| Earlier `0.x` minors                   | :x:                |

A fix that keeps the public API ships as a patch of the latest minor, which a caret range on that minor accepts; a fix that has to change the API ships as the next minor. Before 1.0 a caret range holds a single minor — `^0.12.3` stops below `0.13.0` — so a project on an earlier minor has to upgrade to receive a fix.

## Reporting a Vulnerability

The real-router team takes security issues seriously. We appreciate your efforts to responsibly disclose your findings and will make every effort to acknowledge your contributions.

### Where to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to:

- **Email**: <greydragon888@gmail.com>
- **Subject Line**: [SECURITY] real-router - [Brief Description]

### What to Include

Please include the following information to help us triage and prioritize the issue:

- Type of issue (e.g., prototype pollution, XSS via URL parsing, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it
- Your name and affiliation (if you want to be credited)

### Response Timeline

- **Initial Response**: Within 48 hours, we will acknowledge receipt of your report
- **Preliminary Analysis**: Within 72 hours, we will confirm the vulnerability and determine its severity
- **Resolution Timeline**:
  - Critical severity: Fixed within 7 days
  - High severity: Fixed within 14 days
  - Medium severity: Fixed within 30 days
  - Low severity: Fixed within 60 days

### Disclosure Policy

- We will work with you to understand and resolve the issue promptly
- We will credit you for the discovery (unless you prefer to remain anonymous)
- We will maintain transparency about the fix in our release notes
- We request that you give us reasonable time to resolve the issue before public disclosure

## Security Considerations for Library Users

### Production Usage

Real-router is designed for production use. Keep each `@real-router/*` package on its latest minor, the one that receives security fixes (see [Supported Versions](#supported-versions)), and follow the best practices below.

### Best Practices

1. **Keep the library updated**: We regularly update dependencies to address security vulnerabilities. `pnpm update` stays inside the range in `package.json`; `--latest` moves each package to its latest version, the one [Supported Versions](#supported-versions) covers. Before 1.0 a new minor can carry incompatible changes: read the package's changelog first

   ```bash
   pnpm update --latest @real-router/core @real-router/react
   ```

2. **Audit dependencies regularly**:

   ```bash
   pnpm audit
   ```

3. **Sanitize route parameters**: Always validate and sanitize user-provided route parameters

4. **Secure URL handling**: Be cautious with dynamic URLs and query parameters

5. **Review route configurations**: Ensure sensitive routes have proper guards

### Known Security Considerations

- **URL parsing**: Route parameters come from URLs which are user-controlled
- **Query parameters**: Always validate query parameter values before use
- **Route guards**: Ensure authentication guards cannot be bypassed
- **State serialization**: Be careful when serializing router state

## Dependency Management

We use automated tools to keep dependencies updated:

- **Dependabot**: Automated security updates for dependencies
- **osv-scanner** (`pnpm lint:audit`): known-vulnerability scan of every lockfile, in pre-push and CI
- **CodeQL**: Automated security analysis

To check for known vulnerabilities in your installation:

```bash
pnpm audit
pnpm outdated
```

## Security Features

### What we do

- Regular dependency updates
- Security-focused code reviews
- Automated vulnerability scanning (CodeQL)
- Input validation for route matching
- Immutable state objects (Object.freeze)
- No execution of arbitrary code
- No network requests from core library

### What we don't do

- Collect telemetry or usage data
- Make external API calls
- Store or transmit user data
- Execute user-provided code in unsafe contexts

## Contact

For any security-related questions that don't require immediate attention, you can also:

- Check our [Security Advisories](https://github.com/greydragon888/real-router/security/advisories)

## Attribution

We would like to thank the following individuals for responsibly disclosing security issues:

_No reports yet - you could be the first!_

---

**Last Updated**: October 2026
**Next Review**: January 2027
