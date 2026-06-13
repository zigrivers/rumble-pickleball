# Multi-Device Score Entry Decision

## Decision

Do not implement production multi-device score entry in the accessibility/product-bets branch.

## Rationale

Browser-only PWAs cannot host reliable local score-entry sessions for other phones. A production version needs authentication, role-scoped court links, conflict handling, offline behavior, and an authoritative event log.

## Prerequisites

- Event Log and Undo
- TV / Projector Mode
- QR Snapshot
- Share/export result surfaces
- Command-log mutation model

## Recommended Future Architecture

- Cloud session per tournament
- Organizer remains authoritative
- Court scorer links are scoped to a court and round
- Remote score submissions become pending events
- Conflicts require organizer confirmation

## Non-Goals For Now

- No backend
- No account system
- No remote score mutation
- No silent conflict resolution
