# Changelog

## [Unreleased]

### Added

- Data schema versioning (`dataVersion`) with automatic migration on startup.
- Automatic backup scheduler for `data/data.json` with retention.
- Manual backup drill and restore scripts.
- Retry/backoff utility for RSS and scraping network calls.
- Canary scheduler for early detection when YouTube scraping structure changes.
- External observability webhook for warning/error logs.
- Sensitive command bucket rate-limit in addition to per-command limit.
- Scale guard limits for max trackers and title watches per guild.
- CI workflow, Dependabot config, and OSS governance files.

### Changed

- Health command now includes backup and canary status.
- Notification dedupe signature now includes target channel/role for stronger anti-spam behavior.
- Preflight permission checks before tracker/title-watch save.

### Documentation

- Added contributing guide, incident playbook, and data schema notes.
