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
      return [subject.holderId ? `${code(subject.holderId)}, in ${teams}` : teams, subject.date, subject.phase].filter(Boolean).join(' · ')
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
      <div>
        <h4 className="flex items-center gap-1.5 text-sm font-bold">
          <Sparkles className="size-4 text-[var(--rank-gold)]" aria-hidden="true" />
          Stand-out stats
        </h4>
        <p className="text-xs text-muted-foreground">
          Picked automatically: the event records that sit furthest from the usual value.
        </p>
      </div>
      <ul className="grid min-w-0 gap-px overflow-hidden rounded-md bg-border sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((highlight) => {
          const format = FORMATS[highlight.unit]
          return (
            <li key={highlight.measure} className="grid min-w-0 content-start gap-1 bg-[var(--surface-2)] p-3">
              <span className="text-xs text-muted-foreground">{highlight.title}</span>
              <span className="text-xl leading-tight font-bold text-[var(--text-strong)] tabular-nums">
                {format(highlight.value)}
              </span>
              <span className="text-sm break-words">{describe(highlight.subject, report)}</span>
              <span className="text-2xs text-muted-foreground tabular-nums">
                Event average {format(highlight.mean)}
                {highlight.ties ? ' · shared with one more' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
