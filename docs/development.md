# Development

## Requirements

- Node.js 22. CI uses the same version.
- `npm ci`, which installs the dependencies pinned in `package-lock.json`.
- The Apex Execution Runtime (`aer`) for the local Apex tests. CI runs
  `aer` v1.4.44.
- `afmt` v1.1.0 on `PATH` for the Apex formatting check. CI installs it.
  Locally, the pre-commit hook needs it too: lint-staged runs
  `afmt -c .afmt.toml --write` on staged `.cls` and `.trigger` files, next to
  Prettier and markdownlint. `npm ci` installs the hook (husky).
- The Salesforce CLI (`sf`) for scratch-org tests. Static analysis also uses
  the CLI, Code Analyzer v5.13.0, and Java 11 or newer.

## Local gate

`node scripts/gate.mjs` runs these checks in order.

1. `npm ci`, only when `node_modules` is missing.
2. `npm test` runs Prettier, markdownlint, the metadata and analyzer runner
   tests, and `contract:check`. The metadata tests are
   `scripts/test/object-model.test.mjs` and
   `scripts/release/test/create-beta.test.mjs`.
3. `npm run format:apex:check` for Apex formatting.
4. `npm run analyze` for static analysis. The local gate skips this check if
   the Salesforce CLI or its Code Analyzer plugin is absent.
5. `npm run test:apex` to run `aer test sfdx-source/base`.

The gate never needs an org or Dev Hub secrets. Keep it that way so that it
runs on any machine without credentials.

`npm run format:apex` rewrites Apex files with `afmt`, including braces around
single-statement `if`, `else`, `for`, and `while` bodies.

`npm run analyze` scans `sfdx-source/` and `scripts/` with the Recommended
rules in `code-analyzer.yml`. It fails on violations of any severity or engine
errors and writes `code-analyzer-results.json` for inspection. Run it directly
to get the scan without the local skip; it fails if `sf` or the plugin is
missing.

`code-analyzer.yml` has three overrides. Each one states its reason in a
comment, either in `code-analyzer.yml` or in the file it names.

- `ClassNamingConventions` is disabled and replaced by
  `WardenClassNamingConventions` in `config/code-analyzer-pmd.xml`, which
  accepts the `wdn_` prefix.
- ESLint ignores `scripts/**`, set in `config/code-analyzer-eslint.config.mjs`,
  because those are Node scripts, not LWC.
- CPD scans only `.js` and `.cjs` files, because its lexer can't read the
  shebangs in the `.mjs` scripts.

Any new override needs a comment that gives its reason, beside the entry in
`code-analyzer.yml` or in the file it names.

## Apex code

- Triggers only delegate. Each trigger makes one call into a handler class in
  `sfdx-source/base/main/classes/services/`, such as
  `wdn_AssignmentRegrantHandler`, `wdn_OperationalRecordGuard` or
  `wdn_PersonaComponentLockHandler`. Put new logic in a handler, not in the
  trigger.
- Pass the operation to a handler as a `System.TriggerOperation`, not as a
  Boolean. `wdn_OperationalRecordGuard.ledger` does this.
- The persona component handler locks parent rows in system mode so the lock
  applies regardless of the caller's access. Keep it in system mode. User mode
  would let the lock skip rows the caller can't see.
- Brace every single-statement `if`, `else`, `for` and `while` body.
  `.afmt.toml` sets `wrap_single_statements`, so `npm run format:apex` adds the
  braces, and `npm run format:apex:check` fails on an unbraced body.
- Prefix every top-level class and trigger with `wdn_`. The names are part of
  the contract.

## Apex tests

- Give every test method at least one assertion, using `System.assert` or
  `System.assertEquals`. For a DML call that should fail, pass `false` to the
  `Database` method, then assert on `isSuccess()` and the error message, as
  `wdn_OperationalRecordGuardTest` does.
- Every test method that asserts permission, FLS, CRUD or sharing behaviour
  runs those assertions inside `System.runAs(user)`. Insert the user before the
  call and assign its permission sets explicitly. Setup DML can stay outside
  `runAs`. Never run the assertions as the running admin.
- Build test users with `wdn_TriggerTestUsers.minimalAccessUser(alias)`. It
  uses the Minimum Access - Salesforce profile and falls back to a non-admin
  Salesforce profile without Modify All Data. Don't use a System Administrator
  profile as a test operator, because an AdminsOnly install grants that profile
  Ledger Maintenance. Don't grant Modify All Data in test fixtures either.
- Keep the local Apex suite at or under 100 test methods, the limit for an
  unlicensed AER install.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `master`.

- `fast-gate` runs `npm ci`, installs `afmt`, then runs `npm test`,
  `npm run format:apex:check`, and the Apex tests in AER.
- `code-analyzer` installs Java, the Salesforce CLI, and Code Analyzer and
  requires `npm run analyze` to pass.
- `scratch-org` runs after `fast-gate` on pushes and on pull requests from this
  repository. It runs the scratch-org tests only when the
  `DEVHUB_SFDX_AUTH_URL` secret is set. Otherwise it logs a notice and skips.

## Scratch-org tests

`node scripts/run-apex-tests.mjs` creates a one-day scratch org from
`config/project-scratch-def.json`. It deploys `sfdx-source/base`, runs the local
Apex tests, and then deletes the org. The Dev Hub alias comes from
`DEVHUB_ALIAS` and defaults to `devHub`. Every `sf` call the script makes uses
`--json`.

## Changing metadata

- Regenerate `contract.json` with `npm run contract:generate` after changing
  metadata or the package version. `npm test` fails while the file is stale.
- `scripts/test/object-model.test.mjs` lists the expected field API names for
  each object. When you add or remove a field, update that list in the same
  change.
- The same test file fails when a base file names an extension-only API name.
  It also checks the exact object access of the four permission sets. When you
  change a permission set, update its expectation there. It fails as well if
  any `*.permissionset-meta.xml` under `sfdx-source/` enables `ModifyAllData`,
  `ViewAllData`, `ModifyMetadata` or `CustomizeApplication`. See
  [security](security.md#broad-permissions).
- Salesforce allows 20 history-tracked fields per object. The test checks
  `wdn_Provisioned_Grant__c` against that limit.
