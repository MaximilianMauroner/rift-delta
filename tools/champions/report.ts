import type { ChampionAnalysis, PairCell } from '../../src/domains/champions/types.ts'

type Value = string | number | boolean | null | undefined
interface Column<T> { label: string; value: (row: T) => Value }

function escape(value: Value): string {
  return String(value ?? 'Unavailable').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
const percent = (value: number | null) => value === null ? null : `${(100 * value).toFixed(2)}%`
const pp = (value: number | null) => value === null ? null : `${(100 * value).toFixed(2)} pp`
const decimal = (value: number | null) => value === null ? null : value.toFixed(4)
const interval = (value: [number, number] | null) => value === null ? null : `${percent(value[0])} to ${percent(value[1])}`

function table<T>(rows: T[], columns: Column<T>[]): string {
  if (!rows.length) return '<p>No supported rows.</p>'
  return `<div class="table"><table><thead><tr>${columns.map(c => `<th scope="col">${escape(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${escape(c.value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

function chart<T>(rows: T[], label: (row: T) => string, value: (row: T) => number | null, unit: string, scale: number, signed = false): string {
  if (!rows.length) return ''
  const width = 960
  const left = 300
  const span = 500
  const origin = signed ? left + span / 2 : left
  const size = signed ? span / 2 : span
  const height = 48 + rows.length * 24
  return `<div class="chart"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(unit)}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><title>${escape(unit)}</title><text x="${left}" y="18">${escape(signed ? `Left negative, right positive. Zero at center. ${unit}` : `Zero at left. ${unit}`)}</text><line x1="${origin}" y1="28" x2="${origin}" y2="${height}" stroke="#94a3b8"/>${rows.map((row, i) => {
    const n = value(row)
    const length = n === null ? 0 : Math.min(size, Math.abs(n) / scale * size)
    const x = n !== null && n < 0 ? origin - length : origin
    const y = 33 + i * 24
    return `<g><title>${escape(label(row))}. ${n === null ? 'Unavailable' : escape((n * (unit.includes('percentage') || unit.includes('percent') ? 100 : 1)).toFixed(2))} ${escape(unit)}</title><text x="4" y="${y + 12}">${escape(label(row))}</text>${n === null ? '' : `<rect x="${x}" y="${y}" width="${length}" height="16" fill="${n < 0 ? '#b45309' : '#0f766e'}"/>`}<text x="820" y="${y + 12}">${n === null ? 'Unavailable' : escape((n * (unit.includes('percentage') || unit.includes('percent') ? 100 : 1)).toFixed(2))}</text></g>`
  }).join('')}</svg></div>`
}

function section(title: string, text: string, contents: string): string {
  return `<section><h2>${escape(title)}</h2><p>${escape(text)}</p>${contents}</section>`
}
const championLabel = (c: { role: string | null; championId: number }) => `${c.role ?? 'Unknown role'} #${c.championId}`
const pairLabel = (c: PairCell) => `${c.focalRole} #${c.focalChampionId} / ${c.otherRole} #${c.otherChampionId}`
const championColumns = <T extends { role: string | null; championId: number }>(): Column<T>[] => [
  { label: 'Role', value: c => c.role }, { label: 'Champion ID', value: c => c.championId },
]
const rateColumns = <T extends { distinctGames: number; wins: number; winRate: number | null; wilson95: [number, number] | null }>(): Column<T>[] => [
  { label: 'Distinct games', value: c => c.distinctGames }, { label: 'Wins', value: c => c.wins },
  { label: 'Win rate', value: c => percent(c.winRate) }, { label: 'Wilson 95%', value: c => interval(c.wilson95) },
]

export function renderReport(a: ChampionAnalysis): string {
  const pairs = (cells: PairCell[]) => chart(cells, pairLabel, c => c.association, 'percentage points of association', 1, true) + table(cells, [
    { label: 'Focal role', value: c => c.focalRole }, { label: 'Focal champion', value: c => c.focalChampionId },
    { label: 'Other role', value: c => c.otherRole }, { label: 'Other champion', value: c => c.otherChampionId },
    ...rateColumns<PairCell>(), { label: 'Odds baseline', value: c => percent(c.expectedProbability) }, { label: 'Association', value: c => pp(c.association) },
  ])
  const pool = a.poolEvidence
  const scope = `${a.scope.patch} | ${a.scope.platform} | queue ${a.scope.queueId} | ${a.scope.population} | ${a.scope.rankSnapshotLabel ?? 'No historical rank declaration'}`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Champion sample report</title><style>body{font:15px system-ui,sans-serif;color:#172033;background:#f8fafc;margin:0;padding:32px;line-height:1.5}main{max-width:1440px;margin:auto}h1{font-size:32px}h2{font-size:23px;margin-top:0}.banner{background:#fff0cc;border:2px solid #92400e;padding:16px;font-weight:700}section{margin:24px 0;padding:24px;background:white;border:1px solid #cbd5e1;border-radius:8px}.table,.chart{overflow:auto;margin:16px 0}table{border-collapse:collapse;min-width:100%;font-variant-numeric:tabular-nums}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #dbe3ed;white-space:nowrap}th{background:#edf2f7}svg{display:block;font:12px system-ui,sans-serif}dt{font-weight:700}dd{margin:4px 0 16px}code{font-family:monospace}</style></head><body><main><h1>Champion sample report</h1>${a.source.kind === 'synthetic' ? '<p class="banner">SYNTHETIC DATA. Invented matches. This report is not official LoL Esports data.</p>' : '<p class="banner">Caller-supplied recorded data. Source authenticity is not independently verified.</p>'}<p>${escape(scope)}</p><p>Source ${escape(a.source.id)}. Kind ${escape(a.source.kind)}. Collected ${escape(a.source.collectedAt)}.</p><p>${escape(a.source.selectionDescription)}</p><p>Match start window ${escape(a.window.start)} inclusive to ${escape(a.window.end)} exclusive.</p><p>All results are sample-local. Green bars show nonnegative values. Brown bars show negative values. Missing values show Unavailable. Charts share their data with the tables below them.</p>
${section('Coverage', 'Counts describe this selected sample. Ten participants do not mean ten independent games.', table(Object.entries(a.coverage), [{ label: 'Measure', value: c => c[0] }, { label: 'Count', value: c => c[1] }]))}
${section('Methods and limits', 'Probability uses fractions in JSON. Report rates use percent. Associations and spread use percentage points.', `<dl>${Object.entries(a.methods).map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(typeof value === 'object' ? JSON.stringify(value) : value)}</dd>`).join('')}</dl>`)}
${section('Champion and role results', 'Appearances count one champion-role occurrence per distinct game. Wilson intervals assume independent games and do not correct selection bias.', chart(a.championRoles, championLabel, c => c.winRate, 'percent win rate', 1) + table(a.championRoles, [...championColumns(), { label: 'Appearances', value: c => c.appearances }, ...rateColumns()]))}
${section('Directional enemy matchups', 'Each focal champion is evaluated against each enemy role, including cross-role opponents. Reversed rows are correlated. Association is empirical baseline-adjusted association, NOT calibrated or causal prediction. Adjusted confidence intervals are unavailable.', pairs(a.enemyMatchups))}
${section('Directional ally synergy', 'A focal champion shares a team outcome with its ally. Reversed rows are correlated. Odds baselines use sample marginals. Association does not measure a causal synergy effect.', pairs(a.allySynergies))}
${section('Variability separated from mean strength', 'Only cells at or above minCellGames enter spread. Weighted SD and downside RMS describe the raw sample. The means repeat shared games across dimensions. Noise correction is unavailable because cells overlap and marginals are fitted on the same sample. Fewer than two supported cells yields Unavailable.', chart(a.variability, c => `${c.relation} ${championLabel(c)}`, c => c.weightedSd, 'percentage points SD', 1) + table(a.variability, [
  ...championColumns(), { label: 'Relation', value: c => c.relation }, { label: 'Supported cells', value: c => c.supportedCells },
  { label: 'Weighted mean rate', value: c => percent(c.meanWinRate) }, { label: 'Raw SD', value: c => pp(c.weightedSd) },
  { label: 'Downside RMS', value: c => pp(c.downsideRms) }, { label: 'Uncorrected association SD', value: c => pp(c.associationSd) },
  { label: 'Noise-corrected variance', value: c => c.noiseCorrectedVariance }, { label: 'Reason', value: c => c.correctionUnavailableReason },
]))}
${section('Role interactions', 'Mean absolute association is weighted by cell distinct-game counts across supported cells. It describes the selected pair mix. Counts across cells are correlated. Distinct games are deduplicated within each role interaction.', chart(a.roleInteractions, c => `${c.relation} ${c.focalRole} / ${c.otherRole}`, c => c.meanAbsoluteAssociation, 'percentage points mean absolute association', 1) + table(a.roleInteractions, [
  { label: 'Relation', value: c => c.relation }, { label: 'Focal role', value: c => c.focalRole }, { label: 'Other role', value: c => c.otherRole },
  { label: 'Distinct games', value: c => c.distinctGames }, { label: 'Cells', value: c => c.cells }, { label: 'Supported cells', value: c => c.supportedCells },
  { label: 'Mean absolute association', value: c => pp(c.meanAbsoluteAssociation) },
]))}
${section('Champion profile similarity', 'Compare champions in the same role on common enemy role/champion dimensions with enough games. Equal-dimension association RMSE is a distance. Smaller means closer. Centered correlation is unavailable for constant profiles or fewer than two common dimensions. No player interchangeability or universal similarity claim.', chart(a.profileSimilarity, c => `${c.role} #${c.championA} / #${c.championB}`, c => c.associationRmse, 'percentage points RMSE', 2) + table(a.profileSimilarity, [
  { label: 'Role', value: c => c.role }, { label: 'Champion A', value: c => c.championA }, { label: 'Champion B', value: c => c.championB },
  { label: 'Common dimensions', value: c => c.commonOpponentDimensions }, { label: 'Association RMSE', value: c => pp(c.associationRmse) }, { label: 'Centered correlation', value: c => decimal(c.centeredCorrelation) },
]))}
${section('Observed final damage composition', 'Damage means final damage dealt to champions, in game damage units, supplied by the caller. Shares use summed observed damage. Missing damage is excluded. Zero observed total yields Unavailable shares. Final totals do not measure champion scaling.', ['physical', 'magic', 'true'].map(type => chart(a.damageComposition, championLabel, c => type === 'physical' ? c.physicalShare : type === 'magic' ? c.magicShare : c.trueShare, `percent ${type} damage share`, 1)).join('') + table(a.damageComposition, [
  ...championColumns(), { label: 'Distinct games', value: c => c.distinctGames }, { label: 'Damage observed games', value: c => c.observedDamageGames }, { label: 'Damage missing games', value: c => c.missingDamageGames },
  { label: 'Physical share', value: c => percent(c.physicalShare) }, { label: 'Magic share', value: c => percent(c.magicShare) }, { label: 'True share', value: c => percent(c.trueShare) },
]))}
${section('Results by final duration. NOT scaling.', 'Windows use duration in seconds, minimum inclusive and maximum exclusive. Final duration is an outcome-dependent selection. This is not a measure of power growth or a causal comparison. Gaps in caller windows are excluded.', chart(a.durationResults, c => `${championLabel(c)} ${c.window}`, c => c.winRate, 'percent win rate', 1) + table(a.durationResults, [
  ...championColumns(), { label: 'Window', value: c => c.window }, { label: 'Minimum seconds inclusive', value: c => c.minSeconds }, { label: 'Maximum seconds exclusive', value: c => c.maxSeconds === null ? 'Unbounded' : c.maxSeconds }, ...rateColumns(),
]))}
${section('Observed role pool concentration', 'Minimum number of champions whose descending appearance shares reach the caller threshold. This is sample pick concentration, not a recommended personal pool size. Shares count known-role appearances across both teams.', chart(a.concentration, c => c.role, c => c.poolSize, 'champions', Math.max(1, ...a.concentration.map(c => c.poolSize ?? 0))) + table(a.concentration, [
  { label: 'Role', value: c => c.role }, { label: 'Appearances', value: c => c.appearances }, { label: 'Threshold', value: c => percent(c.threshold) }, { label: 'Pool size', value: c => c.poolSize }, { label: 'Cumulative share reached', value: c => percent(c.cumulativeShare) },
]))}
${section('Caller pool evidence', 'Unknown champions remain unavailable. Zero supported responses means no supported evidence, not no counter exists. Opponent coverage spans only dimensions observed for the selected role. Coverage does not imply a favorable result.', pool ? `<p>Role ${escape(pool.role)}. ${pool.observedRequestedChampions} observed of ${pool.requestedChampionCount} requested champions. ${pool.distinctGamesWithPool} distinct games contain the pool.</p>${table(pool.requestedChampions, [{ label: 'Champion ID', value: c => c.championId }, { label: 'Status', value: c => c.status }, { label: 'Distinct games', value: c => c.evidence.distinctGames }, { label: 'Wins', value: c => c.evidence.wins }, { label: 'Win rate', value: c => percent(c.evidence.winRate) }, { label: 'Wilson 95%', value: c => interval(c.evidence.wilson95) }])}${chart(pool.opponentCoverage, c => `${c.opponentRole} #${c.opponentChampionId}`, c => c.supportedPoolChampions, 'supported pool champions', pool.requestedChampionCount)}${table(pool.opponentCoverage, [{ label: 'Opponent role', value: c => c.opponentRole }, { label: 'Opponent champion', value: c => c.opponentChampionId }, { label: 'Supported pool champions', value: c => c.supportedPoolChampions }, { label: 'Requested pool champions', value: c => c.requestedPoolChampions }])}` : '<p>No pool request. Unavailable.</p>')}
${section('Hypothetical counter availability', 'The scenario assumes k independent chances, each with caller probability q. It does not estimate real champion availability, draft order, bans, or player proficiency.', a.counterAvailability ? `<p>q = ${escape(a.counterAvailability.q)}. k = ${escape(a.counterAvailability.k)}. 1 - (1 - q)^k = ${escape(percent(a.counterAvailability.probability))}.</p><p>${escape(a.counterAvailability.label)}</p>` : '<p>No scenario request. Unavailable.</p>')}
${section('Unavailable capabilities', 'These outputs require new evidence and a defined analysis. This tool does not collect provider data.', table(a.unavailableCapabilities, [{ label: 'Capability', value: c => c.capability }, { label: 'Reason', value: c => c.reason }, { label: 'Required fields or decisions', value: c => c.requiredFields.join(', ') }]))}
</main></body></html>`
}
