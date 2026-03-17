# Changelog

All notable changes to SmartCache will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Hybrid Cache (L1 + L2) support for enterprise-scale caching
- Redis integration for L2 storage
- Disk-based L2 storage option
- Automatic compression for large entries
- Data partitioning for parallel processing
- Cursor-based pagination support
- AI streaming server integration

### Changed
- Improved LRU eviction algorithm performance
- Enhanced TTL expiry accuracy
- Better memory management for large datasets

### Fixed
- Race conditions in concurrent access scenarios
- Memory leak in long-running processes
- Edge cases in priority-based eviction

## [0.1.2] - 2026-02-10

### Added
- Priority-based eviction (Critical, High, Medium, Low)
- Tag-based cache operations
- CLI monitoring tool
- Real-time statistics dashboard
- Multi-language support (Node.js, Python, Angular)

### Changed
- Improved eviction algorithm efficiency
- Better error messages

### Fixed
- TTL expiry timing issues
- Memory limit enforcement edge cases

## [0.1.0] - 2026-02-07

### Added
- Initial release
- LRU (Least Recently Used) eviction
- TTL (Time To Live) support
- Size-based limits
- Basic statistics tracking
- Node.js implementation
- Python implementation
- Angular adapter
