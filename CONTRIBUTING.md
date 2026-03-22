# Contributing to Phantom

We love our contributors! Whether it's fixing bugs, improving the documentation, or proposing new features, your help is appreciated.

## How to Contribute

1. **Fork the Repository**: Click the "Fork" button on the top right.
2. **Clone your Fork**: 
   ```bash
   git clone https://github.com/YOUR_USERNAME/wispervaultOpen.git
   ```
3. **Create a Branch**: 
   ```bash
   git checkout -b feature/your-feature-name 
   # or
   git checkout -b bugfix/issue-number
   ```
4. **Make your Changes**: Implement your feature or bug fix.
5. **Commit your Changes**: Use clear and descriptive commit messages.
   ```bash
   git commit -m "feat: add amazing new feature"
   ```
6. **Push to your Fork**: 
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**: Go to the original repository and click "Compare & pull request". Provide a detailed description of your changes.

## Code Style Guidelines

- **TypeScript**: We use strict typing. Avoid `any` where possible.
- **Linting & Formatting**: Ensure you run `npm run lint` before committing to adhere to our ESLint and Prettier configurations.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/). Example: `feat:`, `fix:`, `docs:`, `refactor:`.

## Setting up Lovable (Optional)

This project was originally bootstrapped with [Lovable](https://lovable.dev/). You can still use it by importing your forked repo, but all development can be done seamlessly locally using your favorite IDE.
