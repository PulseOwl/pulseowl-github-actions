# Changelog for PulseOwl GitHub Workflow Collector

All notable changes to this workflow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html), albeit with a prefix of `collector-` since this repo houses multiple workflows.

### [Unreleased]

- **Added**: Support for tracking mode `repository_usage`.

### [collector-v1.0.1] - 2025-11-17

Caller workflow commit SHA: 9ee56d8ea48494ab9ff364bb8cd230cbac77d0d4

- **Fixed**: The collector now sends an empty heartbeat request when there are no rules or files matched. This allows deleting dependencies if all related files were removed.
- **Added**: Added LICENSE file for Apache 2.0 License.

### [collector-v1.0.0] - 2025-09-17

Caller workflow commit SHA: f1fb94068e73adac95b70d72cccd8fe5b4fab31b

- **Added**: Initial release of the collector worflow with support for tracking mode `file_occurrence`.
