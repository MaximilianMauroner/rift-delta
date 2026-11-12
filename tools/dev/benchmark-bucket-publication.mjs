import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { ORACLE_GAME_INVENTORY_DIGEST_SCHEME, oracleGameInventory, prepareOracleBaseline, prepareRawSourceReceipt, rawObjectReferenceFor } from '../../scripts/raw-source-storage.mjs'

const modulePath = resolve(process.argv[2] ?? 'scripts/railway-bucket.mjs')
const { acquireBucketLease, uploadRankingArtifacts } = await import(pathToFileURL(modulePath).href)
const objectCount = 1100
const delayMs = 5
const config = { enabled: true, bucket: 'benchmark', prefix: 'rankings' }
const generationId = 'bucket-benchmark'
const dir = await mkdtemp(join(tmpdir(), 'bucket-publication-benchmark-'))

try {
  await writeFile(join(dir, 'ranking-summary.json'), JSON.stringify({
    artifactKind: 'public-ranking-manifest', generatedAt: '2026-01-01T00:00:00.000Z',
    source: 'synthetic benchmark', dataMode: 'test', sources: [{ name: 'fixture' }],
    model: { version: 'benchmark', configHash: 'benchmark' }, artifactMeta: { runId: generationId },
  }))
  for (let index = 1; index < objectCount; index += 1) {
    await writeFile(join(dir, `player-${String(index).padStart(4, '0')}.json`), JSON.stringify({ artifactKind: 'fixture-player', index }))
  }
  const baseline = prepareOracleBaseline({
    csv: 'gameid,date,league,side,position,teamname,result\nfixture,2026-01-01,LCK,Blue,team,Alpha,1\nfixture,2026-01-01,LCK,Red,team,Beta,0',
    sourceFileName: 'fixture.csv', importerVersion: 'benchmark',
  })
  const raw = prepareRawSourceReceipt({ generationId, importerVersion: 'benchmark',
    coverage: { start: '2026-01-01', end: '2026-01-01' }, sourceReceiptInputs: {},
    oracle: [{ sourceFileName: baseline.source.sourceFileName, headerDigest: baseline.source.headerDigest,
      digestScheme: ORACLE_GAME_INVENTORY_DIGEST_SCHEME, effectiveOracleDigest: baseline.source.digest,
      gameInventory: oracleGameInventory(baseline.source), baseline: baseline.reference, deltas: [] }],
  })
  const client = delayedS3()
  const lease = await acquireBucketLease('ops/refresh-lease.json', { owner: 'benchmark', ttlMs: 60_000, config, client })
  assert.ok(lease.acquired)
  client.resetCounts()
  const stages = {}
  const cpuStart = process.cpuUsage()
  const start = performance.now()
  const result = await uploadRankingArtifacts({ publicDataDir: dir, config, client, generationId,
    fencingToken: lease.lease.fencingToken, leaseAuthority: { ...lease, key: 'ops/refresh-lease.json' },
    rawSourceGeneration: { objects: [baseline.prepared], receipt: raw.receipt, receiptPrepared: raw.prepared, receiptReference: rawObjectReferenceFor(raw.prepared) },
    onStage: (name, detail) => { stages[name] = detail.durationMs },
  })
  const elapsedMs = performance.now() - start
  const cpu = process.cpuUsage(cpuStart)
  assert.equal(result.promotion.completed, true)
  const active = JSON.parse(client.objects.get('rankings/active-generation.json').bytes.toString())
  assert.equal(active.generationId, generationId)
  const receipt = JSON.parse(client.objects.get(active.publicationReceiptKey).bytes.toString())
  for (const member of receipt.objects) {
    const stored = client.objects.get(member.key)
    assert.equal(stored.bytes.byteLength, member.bytes)
    assert.equal(stored.metadata.sha256, member.digest)
  }
  assert.equal(result.storage.logicalArtifactCount, objectCount)
  assert.equal(client.counts.errors, 0)
  assert.ok(client.counts.peakInFlight <= 16)
  const outputDigest = createHash('sha256').update(JSON.stringify(receipt.objects)).digest('hex')
  console.log(JSON.stringify({ modulePath, objectCount, delayMs, elapsedMs, cpuMs: (cpu.user + cpu.system) / 1000,
    stages, outputDigest, ...client.counts }))
} finally {
  await rm(dir, { recursive: true, force: true })
}

function delayedS3() {
  const objects = new Map()
  const counts = { get: 0, head: 0, put: 0, missing: 0, conflicts: 0, errors: 0, peakInFlight: 0 }
  let inFlight = 0
  let version = 0
  return {
    objects, counts,
    resetCounts() { for (const key of Object.keys(counts)) counts[key] = 0 },
    async send(command) {
      inFlight += 1
      counts.peakInFlight = Math.max(counts.peakInFlight, inFlight)
      await setTimeout(delayMs)
      try {
        const input = command.input
        const stored = objects.get(input.Key)
        if (command.constructor.name === 'GetObjectCommand' || command.constructor.name === 'HeadObjectCommand') {
          counts[command.constructor.name === 'GetObjectCommand' ? 'get' : 'head'] += 1
          if (!stored) {
            counts.missing += 1
            throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
          }
          return { Body: Readable.from([stored.bytes]), ETag: stored.etag, ContentLength: stored.bytes.byteLength,
            ContentType: stored.contentType, ContentEncoding: stored.contentEncoding,
            CacheControl: stored.cacheControl, Metadata: stored.metadata }
        }
        assert.equal(command.constructor.name, 'PutObjectCommand')
        counts.put += 1
        if ((input.IfNoneMatch === '*' && stored) || (input.IfMatch && input.IfMatch !== stored?.etag)) {
          counts.conflicts += 1
          throw Object.assign(new Error('conflict'), { name: 'PreconditionFailed' })
        }
        const bytes = Buffer.from(input.Body)
        const etag = `"${++version}"`
        objects.set(input.Key, { bytes, etag, contentType: input.ContentType, contentEncoding: input.ContentEncoding,
          cacheControl: input.CacheControl, metadata: input.Metadata })
        return { ETag: etag }
      } catch (error) {
        if (error.name !== 'NoSuchKey' && error.name !== 'PreconditionFailed') counts.errors += 1
        throw error
      } finally {
        inFlight -= 1
      }
    },
  }
}
