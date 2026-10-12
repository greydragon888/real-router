#!/usr/bin/env bash
# Stamp CI identity for turbo telemetry: resource attributes for turbo's OTLP
# metrics, appended to $GITHUB_ENV. The setup action's stamp step runs this
# file, and so does post-merge.yml, whose job does not use the action. Only a
# workflow that sets TURBO_EXPERIMENTAL_OTEL_ENDPOINT exports, so elsewhere
# this is inert. Every value is bounded: the job plus its matrix suffix, the
# event, the class of actor, the runner kind, the CPU model and the Node
# version. A run id would make every run write new series.
#
# `ci.cpu` separates the hosted runners' hardware: a job's speed splits into
# two populations, and without the model a slow draw reads as a regression. It
# sits under `ci.*` because the collector turns only `ci.*` and
# `process.runtime.version` into labels. The model is reduced to
# `[A-Za-z0-9._-]`, since a comma or `=` in it would split the list. The matrix
# suffix is reduced the same way: it comes from a job's env, and a line break
# in it would start a variable of its own here.
#
# `ci.actor` tells a Dependabot run from a human one, which share the `pr`
# series otherwise. It is the class of `GITHUB_ACTOR`, not the login, which
# would add series for every contributor. The actor is who started the run,
# and it also picks the secret store: a Dependabot PR a human pushed to reads
# `human`.
#
# The options are those of a `shell: bash` step, which a bash started from the
# step does not inherit: under pipefail an unreadable /proc/cpuinfo fails the
# stamp instead of writing `ci.cpu=unknown`.
set -eo pipefail

cpu="$(awk -F': *' '/^model name/ {print $2; exit}' /proc/cpuinfo 2>/dev/null | tr -c 'A-Za-z0-9._-' '_' | tr -s '_' | sed 's/^_//; s/_$//')"
suffix="$(printf '%s' "${TURBO_TELEMETRY_JOB_SUFFIX:-}" | tr -c 'A-Za-z0-9._-' '_')"
case "${GITHUB_ACTOR:-}" in
  'dependabot[bot]') actor=dependabot ;;
  *'[bot]') actor=bot ;;
  '') actor=unknown ;;
  *) actor=human ;;
esac
{
  printf 'TURBO_EXPERIMENTAL_OTEL_RESOURCE=service.name=turbo,service.namespace=real-router'
  printf ',ci.job=%s%s' "${GITHUB_JOB}" "${suffix:+-${suffix}}"
  printf ',ci.event=%s' "${GITHUB_EVENT_NAME}"
  printf ',ci.actor=%s' "${actor}"
  printf ',ci.runner=%s' "${RUNNER_ENVIRONMENT:-unknown}"
  printf ',ci.cpu=%s' "${cpu:-unknown}"
  printf ',process.runtime.version=%s\n' "$(node -v)"
} >> "$GITHUB_ENV"
