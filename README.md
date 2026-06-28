# PulseOwl GitHub Actions

[PulseOwl](https://pulseowl.dev) automates software dependency maintenance. It tracks dependencies across your tech stack (runtimes, infrastructure, compute, third-party APIs, packages, and more) and delivers actionable alerts directly where your team works, like Slack or Discord.

> **Note:** PulseOwl is currently in early access. You can apply for access on our [website](https://pulseowl.dev).

---

## Available Actions

### Collector (`actions/collector`)

The Collector action is built with Zero Trust principles. It securely sends minimal, user-selected files to the PulseOwl backend for analysis. This enables PulseOwl to track your dependencies, runtimes, third-party APIs, and cloud services across your entire tech stack without over-exposing your source code.

#### Usage Example

- Create a PulseOwl account and install the PulseOwl GitHub App.
  The app is used to link your PulseOwl workspace with a GitHub organization.
  It requests minimal permissions (for example, listing organization repositories) and **does not** require read or write access to repository contents.

- Define tracking rules at the organization or repository level.

- Install the [PulseOwl Collector workflow](https://github.com/PulseOwl/pulseowl-github-actions/blob/main/templates/workflows/collector/v1/pulseowl-collector.yml) to start tracking dependencies.

Once installed, PulseOwl will start tracking dependencies.

#### Authentication

The Collector action uses GitHub's OIDC (OpenID Connect) to authenticate securely with the PulseOwl backend. This means no long-lived secrets or API keys are required. Ensure that your workflow job has `id-token: write` permissions.
