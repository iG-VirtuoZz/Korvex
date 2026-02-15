# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Korvex, please report it responsibly:

1. **Do NOT** open a public issue
2. Send an email to **guillaumesastre34@gmail.com** with details
3. Include steps to reproduce the vulnerability if possible

I will respond as quickly as possible and work on a fix.

## Security Best Practices

When running your own Korvex pool:

- **Never commit `.env` files** to version control
- **Store wallet mnemonics offline** — never in the repository or on the server
- **Use strong passwords** for the database, wallet, and admin panel
- **Keep your Ergo node updated** to the latest stable release
- **Use a firewall** — only expose necessary ports (stratum, HTTPS)
- **Use HTTPS** with a valid SSL certificate (Let's Encrypt)
- **Run behind a reverse proxy** (Nginx) — never expose the API directly
- **Regularly backup** your PostgreSQL database
