# Contributing to ClickSight

Thank you for your interest in contributing to ClickSight! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

### Our Standards

- **Be respectful**: Treat everyone with respect and kindness
- **Be constructive**: Provide helpful feedback and suggestions
- **Be collaborative**: Work together towards common goals
- **Be inclusive**: Welcome contributors of all backgrounds and experience levels

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- ClickHouse instance (local or cloud)
- Basic understanding of React, TypeScript, and ClickHouse

### Development Setup

1. **Fork the repository**

   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/clicksight.git
   cd clicksight
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure your schema**

   ```bash
   # Copy the example schema
   cp schema.config.example.json schema.config.json

   # Edit schema.config.json with your ClickHouse table details
   ```

4. **Set up environment variables**

   ```bash
   # Create .env.local file
   cat > .env.local << EOF
   VITE_CLICKHOUSE_URL=https://your-clickhouse-instance:8443
   VITE_CLICKHOUSE_USER=your_username
   VITE_CLICKHOUSE_PASSWORD=your_password
   VITE_USE_LOWERCASE_COLUMNS=false
   EOF
   ```

5. **Start development server**

   ```bash
   npm run dev
   ```

6. **Open browser**
   ```
   http://localhost:5173
   ```

## How to Contribute

### Reporting Bugs

Before creating a bug report:

- Check if the issue already exists
- Collect relevant information (browser, ClickHouse version, error messages)

Create an issue with:

- **Clear title**: Describe the problem concisely
- **Steps to reproduce**: Detailed steps to recreate the issue
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: Browser, OS, ClickHouse version
- **Screenshots**: If applicable

### Suggesting Features

Feature requests are welcome! Please:

- Check if the feature has already been requested
- Explain the use case and benefits
- Provide examples or mockups if possible
- Consider implementation complexity

### Contributing Code

1. **Find an issue to work on**

   - Look for issues labeled `good first issue` or `help wanted`
   - Comment on the issue to let others know you're working on it

2. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **Make your changes**

   - Write clean, readable code
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed

4. **Test your changes**

   - Test manually in the browser
   - Ensure no console errors
   - Test with different data scenarios

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # or
   git commit -m "fix: resolve bug in component"
   ```

## Pull Request Process

### Before Submitting

- [ ] Code follows the project's coding standards
- [ ] All tests pass (if applicable)
- [ ] Documentation is updated
- [ ] Commit messages are clear and descriptive
- [ ] Branch is up to date with `main`

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```bash
feat(insights): add multi-metric support for trends
fix(funnels): resolve conversion rate calculation bug
docs(schema): add e-commerce schema example
refactor(queries): optimize funnel query performance
```

### Submitting a Pull Request

1. **Push your branch**

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request on GitHub**

   - Use a clear, descriptive title
   - Reference related issues (e.g., "Closes #123")
   - Describe your changes in detail
   - Add screenshots for UI changes
   - List any breaking changes

3. **Review Process**

   - Maintainers will review your PR
   - Address any requested changes
   - Keep the discussion focused and constructive

4. **After Approval**
   - PR will be merged by a maintainer
   - Your branch will be deleted
   - Celebrate your contribution! 🎉

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid `any` type when possible
- Use meaningful variable and function names

### React

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use proper prop types

### Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Line length**: Max 100 characters (flexible)
- **Naming**:
  - Components: PascalCase (`EventTrends.tsx`)
  - Functions: camelCase (`getUserIdentifier()`)
  - Constants: UPPER_SNAKE_CASE (`MAX_STEPS`)
  - Files: kebab-case for utilities, PascalCase for components

### File Organization

```
src/
├── components/          # React components
├── lib/                 # Utility functions and query logic
├── contexts/            # React contexts
├── utils/               # Helper utilities
└── types/               # TypeScript type definitions
```

## Testing Guidelines

### Manual Testing

1. **Test in multiple browsers**

   - Chrome, Firefox, Safari, Edge

2. **Test different scenarios**

   - Empty states
   - Error states
   - Loading states
   - Large datasets

3. **Test schema configurations**
   - Flat column schema
   - JSON property schema
   - Different table structures

### Testing Checklist

- [ ] Feature works as expected
- [ ] No console errors or warnings
- [ ] UI is responsive
- [ ] Loading states are shown
- [ ] Error messages are clear
- [ ] Works with example schemas

## Documentation

### Code Documentation

- Add JSDoc comments for public functions
- Explain complex algorithms or logic
- Document function parameters and return types

```typescript
/**
 * Calculate funnel conversion rates
 * @param steps - Array of funnel steps with event names
 * @param dateRange - Start and end dates for analysis
 * @returns Array of funnel results with conversion rates
 */
export async function calculateFunnel(
  steps: FunnelStep[],
  dateRange: DateRange
): Promise<FunnelResult[]> {
  // Implementation
}
```

### User Documentation

When adding new features:

- Update `docs/FEATURE_DOCUMENTATION.md`
- Add examples to relevant guides
- Update README if needed
- Add screenshots or GIFs for UI changes

## Project Structure

### Key Directories

- **`src/components/`** - React UI components
- **`src/lib/`** - Query logic and utilities
- **`src/contexts/`** - React contexts (Auth, etc.)
- **`docs/`** - Documentation files
- **`schema.config.json`** - Schema configuration

### Key Files

- **`src/lib/schema-adapter.ts`** - Schema abstraction layer
- **`src/lib/clickhouse.ts`** - ClickHouse query functions
- **`src/lib/*-queries.ts`** - Feature-specific query logic
- **`entrypoint.sh`** - Docker entrypoint script

## Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check `docs/` folder for guides

## Recognition

Contributors will be:

- Listed in the project's contributors page
- Mentioned in release notes for significant contributions
- Credited in documentation for major features

## License

By contributing to ClickSight, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to ClickSight! Your efforts help make this project better for everyone. 🚀
