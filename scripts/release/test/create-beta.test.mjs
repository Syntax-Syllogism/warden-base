import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCleanTree,
  assertOnMaster,
  parseArgs,
  parseVersion,
  releaseRecord,
  versionAlias,
} from '../create-beta.mjs';

test('arguments accept only the documented flags', () => {
  assert.deepEqual(parseArgs([]), { allowBranch: false, branch: true });
  assert.deepEqual(parseArgs(['--allow-branch', '--no-branch']), {
    allowBranch: true,
    branch: false,
  });
  assert.throws(() => parseArgs(['--promote']), /Unknown argument/);
});

test('clean-tree check rejects any porcelain entry', () => {
  assert.doesNotThrow(() => assertCleanTree(''));
  assert.doesNotThrow(() => assertCleanTree('\n'));
  assert.throws(() => assertCleanTree(' M README.md\n'), /1 change/);
  assert.throws(() => assertCleanTree('?? new.txt\n M a\n'), /2 change/);
});

test('HEAD must be on origin/master unless --allow-branch', () => {
  const head = 'abcdef0123456789';
  assert.doesNotThrow(() =>
    assertOnMaster({
      head,
      containing: '  origin/HEAD -> origin/master\n  origin/master',
    }),
  );
  assert.throws(() => assertOnMaster({ head, containing: '  origin/feature' }), /abcdef0 is not on origin\/master/);
  assert.throws(() => assertOnMaster({ head, containing: '  origin/master-old' }), /not on origin\/master/);
  assert.doesNotThrow(() => assertOnMaster({ head, containing: '', allowBranch: true }));
});

test('versions parse four numeric parts and map to sf aliases', () => {
  assert.deepEqual(parseVersion('0.1.0.2'), {
    major: 0,
    minor: 1,
    patch: 0,
    build: 2,
  });
  assert.equal(versionAlias('0.1.0.12'), 'warden-base@0.1.0-12');
  for (const bad of ['0.1.0', '0.1.0.NEXT', '', undefined, '1.2.3.4.5'])
    assert.throws(() => parseVersion(bad), /Unexpected package version/);
});

test('release record keeps the 04t, version, coverage and commit', () => {
  const record = releaseRecord(
    {
      Id: '05i000000000001AAA',
      Version: '0.1.0.2',
      SubscriberPackageVersionId: '04t000000000001AAA',
      Tag: 'abc',
      IsReleased: false,
      CodeCoverage: { apexCodeCoveragePercentage: 82 },
      HasPassedCodeCoverageCheck: true,
      ValidationSkipped: false,
    },
    { commit: 'abc', createdAt: '2026-10-19T00:00:00.000Z' },
  );
  assert.equal(record.subscriberPackageVersionId, '04t000000000001AAA');
  assert.equal(record.alias, 'warden-base@0.1.0-2');
  assert.equal(record.codeCoverage, 82);
  assert.equal(record.hasPassedCodeCoverageCheck, true);
  assert.equal(record.commit, 'abc');
  assert.equal(record.released, false);
  assert.match(record.installUrl, /p0=04t000000000001AAA$/);
  assert.equal(
    releaseRecord(
      {
        Version: '0.1.0.1',
        SubscriberPackageVersionId: '04t000000000002AAA',
        CodeCoverage: null,
      },
      { commit: 'x', createdAt: 't' },
    ).codeCoverage,
    null,
  );
  assert.throws(
    () => releaseRecord({ Version: '0.1.0.2' }, { commit: 'x', createdAt: 't' }),
    /SubscriberPackageVersionId/,
  );
});
