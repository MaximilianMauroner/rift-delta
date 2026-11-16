import { Sparkles } from 'lucide-react'
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

function describe(subject: HighlightSubject, report: TournamentReport) {
  const code = (id: string) => report.teams.find((team) => team.id === id)?.code ?? id
  switch (subject.kind) {
    case 'game': {
      const [a, b] = subject.teamIds
      const loser = subject.winnerId === a ? b : a
      const teams = subject.winnerId ? `${code(subject.winnerId)} beat ${code(loser)}` : `${code(a)} vs ${code(b)}`
      const holder = subject.holderId && subject.holderId !== subject.winnerId ? `${code(subject.holderId)}, in ${teams}` : teams
      return [holder, subject.date, subject.phase].filter(Boolean).join(' · ')
    }
    case 'team':
      return report.teams.find((team) => team.id === subject.teamId)?.name ?? subject.teamId
    case 'player': {
      const who = `${subject.player.name} (${code(subject.player.teamId)}, ${subject.player.role})`
      const game = subject.game
      return game ? `${who} on ${game.champion ?? 'an unknown champion'} vs ${game.opponent} · ${game.date}` : who
    }
    case 'champion':
      return `${subject.champion} · ${subject.wins}–${subject.games - subject.wins} in ${subject.games} games`
  }
}

/** The records that stand furthest from the event average, picked by the domain's highlight finder. */
export function ReportHighlights({ report }: { report: TournamentReport }) {
  const highlights = reportHighlights(report)
  if (!highlights.length) return null
  return (
    <section className="grid min-w-0 gap-2" aria-label="Stand-out stats">
      <h4 className="flex items-center gap-1.5 text-sm font-bold" title="The records furthest from the event average, picked automatically.">
        <Sparkles className="size-4 text-[var(--rank-gold)]" aria-hidden="true" />
        Stand-out stats
      </h4>
      <ul className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((highlight) => {
          const format = FORMATS[highlight.unit]
          return (
            <li key={highlight.measure} className="grid min-w-0 content-start gap-0.5 rounded-md bg-[var(--surface-2)] px-3 py-2.5">
              <span className="text-xs text-muted-foreground">{highlight.title}</span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-lg leading-tight font-bold text-[var(--text-strong)] tabular-nums sm:text-xl">
                  {format(highlight.value)}
                </span>
                <span className="text-2xs text-muted-foreground tabular-nums">
                  avg {format(highlight.mean)}
                  {highlight.ties ? ' · shared' : ''}
                </span>
              </span>
              <span className="text-sm break-words">{describe(highlight.subject, report)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
