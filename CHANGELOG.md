# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0/).

## [Unreleased]

## [0.1.2] - 2026-11-23

### Security

- Resolved a high-severity advisory in the markdown-it dependency

## [0.1.1] - 2026-11-23

### Changed

- Make the base page layouts usable, with related lists, complete field sets, and a read-only ledger

### Fixed

- Require the user on assignments and grants and the type on components and grants
- Protect all editable Grant fields during revocation, including standard fields
- Align Apex metadata with API 67.0 and make trigger handlers safe when prior rows are missing
- Run the shared gate in CI, lint Node scripts, and require passing CI before building a beta
- Measure the component lock test on the lock handler alone, so subscriber triggers on components no longer fail it

## [0.1.0] - 2026-11-22

### Added

- Warden Base unlocked package holding the Warden CLI contract for Salesforce org writes, including the ledger and persona schema

### Changed

- Ledger guard now trusts administrator users
