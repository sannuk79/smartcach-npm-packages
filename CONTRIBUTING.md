# Contributing to SmartCache

Thank you for your interest in contributing to SmartCache! 🎉

## How to Contribute

### Reporting Bugs

1. Check existing issues first
2. Create a new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, etc.)

### Feature Requests

1. Open an issue describing the feature
2. Explain the use case
3. Wait for maintainer discussion

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write/update tests
5. Ensure all tests pass
6. Update documentation if needed
7. Commit your changes
8. Push to your fork
9. Open a Pull Request

## Development Setup

### Node.js Package

```bash
cd packages/node
npm install
npm run build
npm test
```

### Python Package

```bash
cd packages/python
pip install -e .
pytest
```

### Angular Package

```bash
cd packages/angular
npm install
npm run build
npm test
```

## Code Style

- Follow existing code style
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

## Testing

- Write tests for new features
- Maintain >90% code coverage
- Include stress tests for performance-critical code

## Commit Messages

Follow conventional commits:

```
feat: add hybrid cache support
fix: resolve TTL expiry issue
docs: update API documentation
test: add stress tests for LRU eviction
chore: update dependencies
```

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag
4. Publish to npm/pypi

## Questions?

Open an issue for any questions or discussions.
