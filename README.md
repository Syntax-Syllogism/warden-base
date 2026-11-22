# Warden Base

Warden Base is the Salesforce package that stores personas, provisioning grants
and reconciliation history for the [warden CLI](https://github.com/Syntax-Syllogism/warden).
It is an unlocked second-generation package with no namespace. Custom API names
start with `wdn_`. A native Salesforce extension also uses this package.

- [Installation](docs/installation.md)
- [Object model](docs/object-model.md)
- [Compatibility contract](docs/contract.md)
- [Permissions and record integrity](docs/security.md)
- [Releases and beta records](docs/releases.md)

## Development

With Node.js 22 and the Apex Execution Runtime (`aer`) installed, run
`node scripts/gate.mjs` for the no-org checks and the local Apex tests. See
[development](docs/development.md) for the CI jobs and scratch-org tests.

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
Report security issues as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Jacob Richter
