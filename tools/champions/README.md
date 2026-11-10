# Local champion analysis reference

This command validates one normalized cohort and writes `analysis.json` and `report.html`.
It uses no API key, network request, ranking data, or combat engine.
It can also normalize modern local Riot MatchV5 exports.
The demo contains twelve invented matches. It is not official LoL Esports data.

## Commands

Run the JSON example from the repository root.

```sh
pnpm exec tsx tools/champions/analyze.ts --input tests/fixtures/champions/example.json --output /tmp/champions-example
```

Run the same deterministic typed example without an input file.

```sh
pnpm exec tsx tools/champions/analyze.ts --demo --output /tmp/champions-demo
```

Use a new output directory or remove previous outputs yourself.
The command refuses to replace either output file, including symbolic links.
Output under this worktree's `public/` directory is refused, including directory aliases.
It never replaces the source input.
Validation errors exit with code 1 before output files or directories are created.
A file-system failure can leave an empty output directory.

Run the focused tests, type check, and scoped lint in this order.

```sh
pnpm exec tsx --test tests/champions*.test.ts
pnpm run typecheck
pnpm exec eslint src/domains/champions tools/champions tests/champions*.test.ts tools/dev/ownership-policy.mjs
node tools/dev/check-dependencies.mjs
node tools/dev/migrate-platform.mjs --check
```

`demo.ts` is the typed example fixture.
`tests/fixtures/champions/example.json` is its retained JSON form.
A test checks that both forms match.

## Input schema

`src/domains/champions/types.ts` defines the TypeScript contract.
`analyzeChampions(unknown)` validates that contract and returns pure aggregate output.
It throws on invalid input and does not mutate the input.
All objects reject unknown fields.
This excludes raw provider payloads and direct identity fields such as PUUID and RiotID.

The root fields are required unless marked optional.

| Field | Shape and meaning |
| --- | --- |
| `version` | Literal `1` |
| `source.kind` | `synthetic`, `riot`, or `other-recorded`. Caller declaration, not verified provenance. |
| `source.id` | Nonempty dataset identifier |
| `source.collectedAt` | ISO timestamp with timezone, at or after the dataset window end and each match end |
| `source.selectionDescription` | Nonempty description of inclusion, exclusion, collection, and selection bias |
| `scope.patch` | One exact patch label |
| `scope.queueId` | One nonnegative integer queue ID |
| `scope.platform` | One exact platform label, such as `EUW1`. No region merging. |
| `scope.population` | `solo-queue` or `professional` |
| `scope.rankSnapshotLabel` | Optional exact contemporaneous rank cohort label. Absence means no historical rank claim. |
| `window` | `{start,end}` ISO timestamps with timezone. Match starts use `[start,end)`. Start must precede end. |
| `matches` | Array of normalized matches. An empty array is valid and yields unavailable rates. |
| `analysis.minCellGames` | Integer at least 2. Support cutoff for spread, role association summaries, profile dimensions, and pool coverage. Raw cells remain visible below it. |
| `analysis.concentrationThreshold` | Explicit fraction greater than 0 and at most 1 |
| `analysis.durationWindows` | Array of `{label,minSeconds,maxSeconds}`. Nonnegative bounds, maximum exclusive, `null` for unbounded. Windows cannot overlap. Gaps exclude durations. An empty array disables duration stratification. |
| `analysis.player` | Optional private `{role,playerKey}` request. Matches only caller-supplied opaque participant keys. The key is not emitted. |
| `analysis.pool` | Optional `{role,championIds}` with nonempty unique positive integer champion IDs |
| `analysis.counterAvailability` | Optional `{q,k}`. `q` is a fraction in `[0,1]`. `k` is a nonnegative integer. |

Each match has these fields.

| Field | Shape and meaning |
| --- | --- |
| `matchId` | Nonempty normalized ID. Leading and trailing whitespace is removed. IDs are case-sensitive. Any repeated ID is rejected, even if its records are identical. |
| `scope` | Same shape as root scope. Every value, including presence of the rank label, must match. |
| `startedAt` | ISO timestamp with timezone inside the root window |
| `durationSeconds` | Finite positive number of seconds. No remakes are inferred or removed. |
| `winnerTeamId` | `100` or `200`. Draws and unknown outcomes are not supported. |
| `participants` | Exactly ten distinct participant IDs, with five players on each team |

Each participant has these fields.

| Field | Shape and meaning |
| --- | --- |
| `participantId` | Nonempty ID, unique within this match. No cross-match identity meaning. |
| `teamId` | `100` or `200` |
| `championId` | Positive safe integer, unique across all ten participants. Mirrors and duplicate picks are rejected. |
| `role` | `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`, or `null`. Known roles cannot repeat within a team. Unknown roles stay unknown. |
| `won` | Boolean equal to `teamId === winnerTeamId` |
| `playerKey` | Optional caller-supplied opaque key, unique within a match. Use a private opaque value, never a PUUID or RiotID. Only the count of supplied keys is output. |
| `finalDamage` | Optional complete `{physical,magic,true}` object of finite nonnegative final damage dealt to champions, in game damage units |

Numbers cannot be `NaN` or infinite.
Counts and IDs use safe integer limits.
Text is trimmed, must remain nonempty, and cannot contain control characters.
Case and patch labels remain exact.
The parser cannot detect dishonest scope declarations, mislabeled synthetic data, or incomplete source collection.
A single cohort avoids silent pooling across patches, queues, platforms, populations, or rank snapshots.
Run separate commands for separate cohorts.
A rank snapshot label declares a cohort. It does not reconstruct rank at match time.
Source metadata must contain public dataset descriptions, not player identities or raw records.

## Formulas and units

All rates and shares use fractions in JSON.
HTML displays rates as percent and association differences as percentage points.
No value is a global champion ranking.

For a champion-role or directional pair cell, `n` is its number of distinct games and `w` is its wins.
Mirrors are rejected, so each champion appears at most once in a game.
One game contributes one observation to a cell, not ten independent samples.
Cells, reversed pairs, and role summaries share games.
Games can also share players and selection effects.
Wilson intervals assume independent Bernoulli games and cannot correct these dependencies or selection bias.

The raw rate is `p = w/n`.
The Wilson interval uses `z = 1.959963984540054`.
Its center is `(p + z²/(2n))/(1 + z²/n)`.
Its radius is `z*sqrt(p*(1-p)/n + z²/(4n²))/(1 + z²/n)`.
The endpoints are center plus or minus radius, clipped to `[0,1]`.
`n = 0` yields a null rate and null interval.
Missing evidence never becomes a zero win rate.
Observed zero wins remain a measured zero.

The odds baseline first smooths each marginal champion-role rate with a Jeffreys prior.
For marginal wins `w` and games `n`, use `p = (w + 0.5)/(n + 1)`.
For focal marginal `p` and other marginal `q`, use these independent generic formulas.

- Enemy baseline is `p*(1-q) / (p*(1-q) + (1-p)*q)`.
- Ally baseline is `p*q / (p*q + (1-p)*(1-q))`.

These formulas divide enemy odds and multiply ally odds around neutral odds of 1.
They are empirical baselines fitted on this same sample.
They are not calibrated predictions or causal models.
A pair association is its raw rate minus its baseline.
The association is not a residual from an independently trained model.
No adjusted confidence interval is supplied because marginal uncertainty and covariance are not modeled.
Observed cell rates receive no shrinkage.
Only marginal baseline rates receive the explicit Beta(0.5,0.5) smoothing above.

For supported cells, use weights `a_i = n_i / sum(n_i)`.
The mean raw cell rate is `m = sum(a_i*p_i)`.
Raw variability is `sqrt(sum(a_i*(p_i-m)²))`.
Downside RMS is `sqrt(sum(a_i*min(0,p_i-m)²))`.
It is a lower-tail deviation, not a confidence bound or worst-case guarantee.
Association SD uses the same weights around the weighted mean association.
Fewer than two supported cells yields null for all spread measures, including the spread mean.
These means weight a repeated game across its opponent or ally dimensions.
They are not an independent overall champion strength estimate.
The champion-role marginal is the direct distinct-game rate.

The combined cross-role `variability` array has no noise correction.
Those cells share games and fitted marginal baselines.
For truly independent rate cells, a plug-in rate variance would be `p_i*(1-p_i)/(n_i-1)` for `n_i > 1`.
After fitting a weighted mean, its contribution to observed weighted variance would be `sum(a_i*(1-a_i)*noise_i)`.
A valid correction subtracts variance, not standard deviations.
That correction is not applied to the combined dependent cells.
`withinRoleVariability` instead partitions by exactly one other role. Its champion cells use disjoint games. It applies the variance correction above to raw rates only, with observed weights held fixed. It reports supported-game coverage against all games for the focal champion and role.
Fewer than two supported cells yields unavailable estimates. Repeated players and time dependence remain unmodeled. A zero excess estimate means the data does not resolve excess spread. It does not establish a constant true rate. No fitted-baseline residual receives this correction.
`noiseCorrectedVariance` stays null with an explicit reason.
Raw and baseline-adjusted dispersion include sampling noise and do not establish a true spread.

Role interaction rows report game-count-weighted mean absolute association over supported cells.
Their distinct-game count is a deduplicated union.
That count is not the denominator of the weighted association statistic.

Profile similarity compares champions in the same role over common supported enemy role/champion dimensions.
It reports equally weighted association RMSE, `sqrt(mean((x_i-y_i)²))`, and centered Pearson correlation.
Smaller RMSE means closer observed profiles.
It requires at least two common dimensions.
Correlation is null for a constant profile.
It has no confidence claim and cannot establish player interchangeability.

Pool coverage counts supported evidence, not favorable counters.
The denominator is all caller-requested champions, including unobserved ones.
Opponent dimensions come only from opponents observed against the selected role in this sample.
An unknown champion has status `unavailable`, zero evidence games, and a null rate.
No recommendation follows from absent evidence.

The concentration pool size is the smallest count of descending champion appearance shares whose cumulative sum reaches the caller threshold.
Ties use ascending champion ID for deterministic order.
The denominator is all known-role appearances in that role across both teams.
An empty role yields a null pool size and null cumulative share.
This is sample pick concentration, not an optimal personal pool size.

The hypothetical counter availability is `1-(1-q)^k`.
The caller supplies `q` and `k` explicitly.
It assumes independent equal-probability chances and is NOT measured actual counterpick chance.
For `q = 0.2` and `k = 3`, the result is `0.488`.
It does not model bans, draft order, dependent choices, or proficiency.

Observed damage composition divides each summed observed damage type by the summed observed total for that champion and role.
Missing final damage records are excluded and counted.
A complete observed zero-total record counts as observed but has unavailable shares when the group total is zero.
Damage share is not damage per second, build attribution, or scaling.
Results by final duration use caller-defined windows on completed game duration.
They are NOT scaling estimates. Duration is outcome-dependent.

## Outputs

`analysis.json` contains only source and scope metadata, method parameters, coverage counts, aggregate results, and unavailable capability reasons.
It never includes participant IDs, player keys, match IDs, PUUID fields, RiotID fields, or raw source records.
An explicit `analysis.player` request adds selected-player chronology and champion results. The report then has a private-review banner. Keep that output private. Omitting the request keeps player history absent.
The HTML escapes caller strings and has no JavaScript, CDN, or external asset.
Every chart reads the same aggregate array displayed in its table.
Charts show at most the first 20 rows in deterministic source order. The caption states the total count. Native expandable tables show at most the first 200 rows. Each truncated table states its full row count and points to `analysis.json` for complete data.

| Output array or field | HTML consumer and unit |
| --- | --- |
| `championRoles` | Role results table and raw win-rate chart. Distinct games and appearances. |
| `enemyMatchups` | Directional enemy table and association chart. Distinct games per pair. |
| `allySynergies` | Directional ally table and association chart. Distinct games per pair. |
| `withinRoleVariability` | Within-role approximate excess-spread chart and coverage table. Variances use squared rate units. SD uses percentage points in HTML. |
| `privatePlayerHistory` | Explicit selected-player champion chart and private chronological table. No account identifier is emitted. |
| `variability` | Mean and spread table, raw SD chart. Fractions in JSON, percentage points in HTML. |
| `roleInteractions` | Role table and mean absolute association chart. Union distinct games and dependent cells. |
| `profileSimilarity` | Similarity table and RMSE chart. Common opponent dimensions. |
| `damageComposition` | Damage table and one share chart per damage type. Observed and missing distinct games. |
| `durationResults` | Final-duration table and raw rate chart. Seconds and distinct games. |
| `concentration` | Concentration table and champion count chart. Explicit threshold. |
| `poolEvidence.requestedChampions` | Requested champion evidence table, including unavailable champions |
| `poolEvidence.opponentCoverage` | Opponent table and supported pool champion count chart |
| `counterAvailability` | Scenario values and assumption text |
| `unavailableCapabilities` | Required evidence table |

No chart data is hidden in an unused payload.
Large cohorts can make a large JSON file because it retains every aggregate row.
HTML previews are bounded. JSON is the complete machine-readable result.
There is no live web route or provider collector.
The domain output includes method version `rift-delta-champions-1`.

## Capability limits and required evidence

Timeline and scaling results are unavailable.
They require explicit snapshot times in seconds and complete state for all ten players.
Required player fields include champion, role, level, gold, inventory, health, position, and alive state.
They also require game state and a documented snapshot sampling policy.
A descriptive comparison at similar gold does not establish causality.
Do not infer scaling from final duration or final damage.

Objective effects are unavailable.
They require objective event types, event times, teams, and complete pre-event state.
They also require a treatment definition, measured confounders, and an identification plan.

Historical rank and rank equivalence are unavailable.
They require contemporaneous snapshot time, queue, platform, tier, division, LP, and linkage provenance.
A present rank cannot stand for historical rank.

Build simulations are unavailable here.
Future adapters require patch rules, champion level, skill ranks, inventory, runes, target state, and a combat scenario.
They must use the existing DPS engine rather than add a second simulator.

Selected-player history is available only with `analysis.player`, stable opaque participant keys, and authorized source records. It remains a local private review. The command does not authenticate a remote customer or verify identity mappings.
It reports recorded games and concentration for the requested role. It does not infer skill, mastery, or missing matches.

Recorded source authenticity, collection completeness, role assignment accuracy, and repeated-player dependence remain caller responsibilities.
To improve estimate accuracy, collect an explicit representative cohort, retain collection selection details, check role coverage, and validate baselines on held-out games.
A future uncertainty model must account for shared games, repeated players, and fitted marginals before it reports adjusted intervals or corrected spread.

## Local Riot exports

Use the same root header and analysis fields as the normalized example. Put raw MatchV5 responses in `matches` instead of normalized matches.

```sh
pnpm exec tsx tools/champions/analyze.ts --riot-input /path/to/local-riot-export.json --output /tmp/riot-champion-analysis
```

The adapter checks each match's numeric `gameVersion` major and minor against `scope.patch`, its queue against `scope.queueId`, and the match ID's platform prefix against `scope.platform`.
For example, `gameVersion` `16.18.123.456` maps to patch `16.18`. It does not silently map that label to the DPS engine's `26.18` label.
The adapter uses `gameStartTimestamp` in milliseconds and `gameDuration` in seconds. `gameEndTimestamp` is required. A disagreement larger than 120 seconds is rejected.
Every participant must supply `gameEndedInEarlySurrender`. Flagged matches are refused rather than silently removed. Record their exclusion in `source.selectionDescription` before retrying with the selected records.
Normalized input has no remake flags. Its report explicitly states that it includes every supplied match and requires a declared selection policy.
This adapter supports modern MatchV5 exports. It does not infer legacy duration units.
Final damage is included only when all three damage types are present. Unknown `teamPosition` values become `null`.
Provider names and identifiers are dropped.

The optional root field `playerKeysByPuuid` maps private source PUUIDs to distinct opaque local keys. It is used only by this local adapter. It is not copied into either output.
Set `analysis.player` to one of those keys and a role to request the private player review. A mapping is a caller declaration, not verified account ownership.
Omit the mapping and the player request for a population report.
The retained TypeScript example `tests/fixtures/champions/riot.ts` builds a synthetic raw export with this shape.

The existing DPS archive wrapper retains raw `match` and `timeline` responses. An authorized local exporter can extract `match` records into this envelope.
This command does not read bucket credentials or databases, download archives, or invoke the top-level DPS ingest module.
The current archive's Yunara enrichment and ladder-seed selection must remain in `source.selectionDescription`.
A successful import does not make that sample representative.

## Refresh the channel evidence

The source-index tool requires `yt-dlp` on the executable path and the project's Node runtime.
It enumerates all public Videos, Shorts, and Streams tabs, then captures metadata and available English captions.
It writes local evidence only. It does not fetch the creator's website data or scoring files.
A partial inventory or missing captions gives a nonzero exit status and records the exact gap in the manifest.

```sh
python3 tools/research/index-machineloling.py --output .agents/artifacts/rift-delta-champion-research/channel-capture-next
```

The current research index, source-to-product map, and independent method reference are in `.agents/artifacts/rift-delta-champion-research/`.
They include future methods that are not executable features of this tool. The capability table above states those limits.
