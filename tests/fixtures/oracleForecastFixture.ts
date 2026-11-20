import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MatchRecord } from '../../src/domains/rankings/types.ts'

export function oracleForecastCsv(matches: readonly MatchRecord[]) {
  const rows = matches.flatMap((match, index) => (['blue', 'red'] as const).map(side => {
    const blue = side === 'blue'
    const team = blue ? match.teamA : match.teamB
    return [match.id, match.datetimeUtc ?? `${match.date}T00:00:00Z`, 1800, match.season, match.league,
      match.event.replace(`${match.league} ${match.season}`, '').trim(), /Final|Bracket|Playoffs/i.test(match.phase) ? 1 : 0,
      match.bestOf, match.gameNumber ?? index + 1, match.patch, 'team', side, team, Number(match.winner === team),
      blue ? match.teamAKills : match.teamBKills, blue ? match.teamAGold : match.teamBGold]
  }))
  return ['gameid,date,gamelength,year,league,split,playoffs,bestof,game,patch,position,side,teamname,result,kills,totalgold',
    ...rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n')
}

export async function writeOracleForecastFixture(directory: string, path: string, matches: readonly MatchRecord[], observedAt: number) {
  const bytes = oracleForecastCsv(matches)
  await writeFile(join(directory, path), bytes)
  return { path, observedAt, sha256: createHash('sha256').update(bytes).digest('hex') }
}
