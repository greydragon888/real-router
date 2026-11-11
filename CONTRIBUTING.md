# Contributing

All contributions are welcomed. They are two ways contributions can made:

- Raising issues / starting discussions
- Creating pull requests


## Contributor code of conduct

As contributors and maintainers of this project, we pledge to respect all people who contribute through reporting issues, posting feature requests, updating documentation, submitting pull requests or patches, and other activities.

We are committed to making participation in this project a harassment-free experience for everyone, regardless of level of experience, gender, gender identity and expression, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, or religion.

Examples of unacceptable behavior by participants include the use of sexual language or imagery, derogatory comments or personal attacks, trolling, public or private harassment, insults, or other unprofessional conduct.

Project maintainers have the right and responsibility to remove, edit, or reject comments, commits, code, issues, and other contributions that are not aligned to this Code of Conduct. Project maintainers who do not follow the Code of Conduct may be removed from the project team.

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by opening an issue or contacting one or more of the project maintainers.

This Code of Conduct is adapted from the Contributor Covenant, version 1.0.0, available from [http://contributor-covenant.org/version/1/0/0/](http://contributor-covenant.org/version/1/0/0/)


## Development setup

### Windows: enable symlinks

`src/dom-utils` in the framework adapters, `src/browser-env` in the URL plugins and `src/shared-ssr` in the SSR loader plugins are git symlinks into `shared/`. Unless symlink support is on, git checks each of them out as a small text file holding the link's target; `pnpm type-check` and `pnpm build` then fail with errors such as `TS2307: Cannot find module './browser-env'`.

Creating a symlink on Windows takes [Developer Mode](https://learn.microsoft.com/en-us/windows/advanced-settings/developer-mode) or an elevated shell. With either, clone with symlinks on:

```sh
git clone -c core.symlinks=true https://github.com/greydragon888/real-router.git
```

A clone made without symlink support keeps `core.symlinks=false` in its own `.git/config`, where `git clone` writes it, and that value overrides `git config --global`. To repair such a clone, turn the setting on in the clone and check the symlinks out again; every other file stays as it is. In Git Bash, with Developer Mode on or the shell elevated:

```sh
git config core.symlinks true
git ls-files -s | grep '^120000' | cut -f2 | xargs git checkout --
```


## Pull requests

### CI server

Commits on an open PR trigger GitHub Actions (`.github/workflows/ci.yml`). You can build and run tests locally to make sure they will pass before pushing a commit:

```sh
pnpm install
pnpm build
pnpm test && pnpm lint && pnpm type-check
```

### Git Commit Guidelines

[Angular's Commit Conventions](https://docs.google.com/document/d/1QrDFcIiPjSLDn3EL15IJygNPiHORgU1_OOAqWjiDU5Y/edit#) are used in this project.
