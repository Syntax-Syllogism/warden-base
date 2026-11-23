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
- The Salesforce CLI (`sf`) for scratch-org tests. CI pins it to 2.158.7.
  Static analysis also uses the CLI, Code Analyzer v5.13.0, and Java 11 or newer.

## Local gate

`node scripts/gate.mjs` runs these checks in order.

1. `npm ci`, only when `node_modules` is missing.
2. `npm test` runs Prettier, markdownlint, the metadata and analyzer runner
   tests, `contract:check`, and `npm run test:org` with mocked Salesforce CLI
   responses. The metadata tests are
   `scripts/test/object-model.test.mjs` and
   `scripts/release/test/create-beta.test.mjs`.
3. `npm run format:apex:check` for Apex formatting.
4. `npm run analyze` for static analysis. The local gate skips this check if
   the Salesforce CLI or its Code Analyzer plugin is absent.
5. `npm run test:apex` to run `aer test sfdx-source/base`.

Pass `--skip-apex` to skip step 5. CI's `fast-gate` job does so because the AER
action runs the Apex suite in a separate step.

The gate never needs an org or Dev Hub secrets. Keep it that way so that it
runs on any machine without credentials.

`npm run format:apex` rewrites Apex files with `afmt`, including braces around
single-statement `if`, `else`, `for`, and `while` bodies.

`npm run analyze` scans `sfdx-source/` and `scripts/` with the Recommended
rules in `code-analyzer.yml`. It fails on violations of any severity or engine
errors and writes `code-analyzer-results.json` for inspection. Run it directly
to get the scan without the local skip; it fails if `sf` or the plugin is
missing. It is the one `runSf` call in `scripts/` that passes `{ json: false }`,
so the scan prints its table instead of JSON.

`code-analyzer.yml` has three overrides. Each one states its reason in a
comment, either in `code-analyzer.yml` or in the file it names.

- `ClassNamingConventions` is disabled and replaced by
  `WardenClassNamingConventions` in `config/code-analyzer-pmd.xml`, which
  accepts the `wdn_` prefix.
- ESLint uses Node globals and module syntax for `scripts/**/*.mjs`, and turns
  off three LWC platform rules that don't apply to Node scripts. Both are set in
  `config/code-analyzer-eslint.config.mjs`.
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
- Apex metadata uses the project's API version. At 67.0, database operations
  default to user mode. The persona component handler explicitly locks parent
  rows in system mode with `without sharing` so the lock applies regardless of
  the caller's access. Salesforce disallows `ORDER BY` in a locking query.
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

- `fast-gate` verifies the `afmt` download and runs `scripts/gate.mjs`.
  The pinned AER action provisions its runtime and runs the Apex suite
  in a separate step.
- `code-analyzer` installs Java, the Salesforce CLI, and Code Analyzer and
  requires `npm run analyze` to pass.
- `scratch-org` runs after `fast-gate` on pushes and on pull requests from this
  repository. It runs the scratch-org tests only when the
  `DEVHUB_SFDX_AUTH_URL` secret is set. Otherwise it logs a notice and skips.

## Scratch-org tests

`node scripts/run-apex-tests.mjs` creates a one-day scratch org from
`config/project-scratch-def.json`. It deploys `sfdx-source/base`, runs the local
Apex tests, and then deletes the org. The Dev Hub alias comes from
`DEVHUB_ALIAS` and defaults to `devHub`. Every `sf` call the script makes goes
through `runSf` in `scripts/sf.mjs`, which adds `--json`. Scripts that call `sf`
should use it too, rather than spawning `sf` directly.

`npm run org:evidence` needs an authenticated Dev Hub to create its scratch
org. See [org evidence](evidence/README.md) for package verification commands.

## Changing metadata

- Regenerate `contract.json` with `npm run contract:generate` after changing
  metadata or the package version. `npm test` fails while the file is stale.
- `scripts/test/object-model.test.mjs` lists the expected field API names for
  each object. When you add or remove a field, update that list in the same
  change, and place the field on its object's layout. The test fails for any
  custom field that is missing from a layout. Its `expectedRelatedLists` map
  names the related lists each layout must have. On the Provisioned Grant,
  Reconciliation Run and Reconciliation Item layouts, each field must be
  `Readonly`, or `Required` when it is required in metadata or by an active
  `ISBLANK(<field>)` validation rule. Every layout needs
  a System Information section with `CreatedById` and `LastModifiedById`. See
  [object model](object-model.md#using-the-warden-base-app).
- The same test file fails when a base file names an extension-only API name.
  It also checks that fields marked Required on layouts are required in
  metadata or by such a validation rule, that no User lookup uses Restrict or
  Cascade (packaging rejects both), and that all Apex metadata matches the project's API version.
  It also checks the exact object access of the four permission sets. When you
  change a permission set, update its expectation there. It fails as well if
  any `*.permissionset-meta.xml` under `sfdx-source/` enables `ModifyAllData`,
  `ViewAllData`, `ModifyMetadata` or `CustomizeApplication`. See
  [security](security.md#broad-permissions).
- Salesforce allows 20 history-tracked fields per object. The test checks
  `wdn_Provisioned_Grant__c` against that limit.
