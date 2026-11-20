import { percent, signedGold } from '../../../components/fieldFormat'
import {
  reportHighlights,
  type HighlightSubject,
  type HighlightUnit,
} from '../../../domains/rankings/report-highlights'
import type { TournamentReport } from '../../../domains/rankings/tournament-reports'

const FORMATS: Record<HighlightUnit, (value: number) => string> = {
  minutes: (value) => `${value.toFixed(1)} min`,
  kills: (value) => `${Math.round(value)} kills`,
  gold: (value) => `${signedGold(value)} gold`,
  goldAt15: (value) => `${signedGold(value)} gold at 15`,
  percent: (value) => `${percent(value)} wins`,
  games: (value) => `${value.toFixed(value % 1 ? 1 : 0)} wins in a row`,
  champions: (value) => `${value.toFixed(value % 1 ? 1 : 0)} champions`,
  roles: (value) => `${value.toFixed(value % 1 ? 1 : 0)} roles`,
  dragons: (value) => `${value.toFixed(value % 1 ? 1 : 0)} dragons`,
  damage: (value) => `${Math.round(value).toLocaleString('en-US')} a minute`,
}

function describe(subject: HighlightSubject, report: TournamentReport): { label: string; date?: string; phase?: string | null } {
  const code = (id: string) => report.teams.find((team) => team.id === id)?.code ?? id
  switch (subject.kind) {
    case 'game': {
      const [a, b] = subject.teamIds
      const loser = subject.winnerId === a ? b : a
      const teams = subject.winnerId ? `${code(subject.winnerId)} beat ${code(loser)}` : `${code(a)} vs ${code(b)}`
      const holder = subject.holderId && subject.holderId !== subject.winnerId ? `${code(subject.holderId)}, in ${teams}` : teams
      return { label: holder, date: subject.date, phase: subject.phase }
    }
    case 'team':
      return { label: report.teams.find((team) => team.id === subject.teamId)?.name ?? subject.teamId }
    case 'player': {
      const who = `${subject.player.name} (${code(subject.player.teamId)}, ${subject.player.role})`
      const game = subject.game
      return game ? { label: `${who} on ${game.champion ?? 'an unknown champion'} vs ${game.opponent}`, date: game.date } : { label: who }
    }
    case 'champion':
      return { label: `${subject.champion} · ${subject.wins}–${subject.games - subject.wins} in ${subject.games} games` }
  }
}

/** The records that stand furthest from the event average, picked by the domain's highlight finder. */
export function ReportHighlights({ report }: { report: TournamentReport }) {
  const highlights = reportHighlights(report)
  if (!highlights.length) return null
  return (
    <details className="min-w-0 border-y border-line py-2">
      <summary className="cursor-pointer text-sm font-semibold">Stand-out stats</summary>
      <p className="my-2 text-xs text-muted">The records furthest from the event average.</p>
      <ul className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((highlight) => {
          const format = FORMATS[highlight.unit]
          const { label, date, phase } = describe(highlight.subject, report)
          return (
            <li key={highlight.measure} className="grid min-w-0 content-start gap-0.5 border-l-2 border-line bg-surface px-3 py-2.5">
              <span className="text-xs text-muted">{highlight.title}</span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-lg leading-tight font-bold text-text tabular-nums sm:text-2xl">
                  {format(highlight.value)}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  avg {format(highlight.mean)}
                  {highlight.ties ? ' · shared' : ''}
                </span>
              </span>
              <span className="text-sm break-words">{label}</span>
              {date || phase ? <span className="flex flex-wrap gap-x-2 text-xs text-muted">
                {date ? <time className="whitespace-nowrap">{date}</time> : null}
                {phase ? <span>{phase}</span> : null}
              </span> : null}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
