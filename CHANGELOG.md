# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-05-09

### Added

- Multi-family support with invite-code-based registration
- Shared family inventory — one candy drawer, individual consumption tracking
- Per-person rush-o-meter with configurable rush % and decay time per item
- Portion-based consumption (TAKE 1 / TAKE 1/4 buttons)
- 7-day and 12-month rush % charts per user
- Uncapped rush meter with escalating visual effects (overdrive at 150%, coma at 250%)
- Low-stock pulse alerts with configurable thresholds
- User profiles with emoji avatars and color customization
- Admin panel for family member and invite code management
- Argon2id password hashing with rate-limited auth endpoints
- SQLite database with WAL mode in a single Docker container
- Synthwave UI with neon aesthetics
- Content-Security-Policy and security headers on all responses
- Multi-stage Docker build running as non-root user
