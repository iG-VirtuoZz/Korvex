# Contributing to Korvex

Thank you for your interest in contributing to Korvex! Here are some guidelines to help you get started.

## How to Contribute

### Reporting Bugs

- Open an issue with a clear description of the bug
- Include steps to reproduce the problem
- Mention your environment (OS, Node.js version, miner software)

### Suggesting Features

- Open an issue describing the feature you'd like to see
- Explain why it would be useful for the pool

### Submitting Code

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feature/my-feature`
3. **Write your code** — follow the existing TypeScript style
4. **Test your changes** — make sure the pool starts and accepts shares
5. **Commit** with a clear message: `git commit -m 'Add: description of change'`
6. **Push** to your fork: `git push origin feature/my-feature`
7. **Open a Pull Request** against `main`

## Code Style

- TypeScript for all backend and frontend code
- Use `async/await` for asynchronous operations
- Use parameterized queries for all database operations (prevent SQL injection)
- Keep secrets in environment variables, never hardcode them

## Important Notes

- **Never commit `.env` files** or any secrets
- **Never commit wallet mnemonics** or private keys
- Test with a real Ergo node (testnet or mainnet) when possible
- Keep the existing code structure (src/api, src/stratum, src/payout, etc.)

## Questions?

Feel free to open an issue if you have questions about the codebase or need help getting started.
