import { BarChart3, CalendarDays, Globe2, History, Users } from 'lucide-react'
import { type AppMode } from '../browser/bootstrap'
import { type PageLayout } from '../components/ui/loading'

export type Mode = AppMode

export const MODES: { id: Mode; label: string; icon: typeof BarChart3 }[] = [
  { id: 'rankings', label: 'Rankings', icon: BarChart3 },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'regions', label: 'Regions', icon: Globe2 },
  { id: 'matches', label: 'Matches', icon: History },
  { id: 'tournaments', label: 'Tournaments', icon: CalendarDays },
]

/** One title per view and one short line that says what the numbers are. */
/** The skeleton each view shows while its data loads. */
export const PAGE_LAYOUTS: Record<Mode, PageLayout> = { rankings: 'board', players: 'board', profiles: 'board', scouting: 'board', regions: 'regions', matches: 'ledger', tournaments: 'schedule' }

export const MODE_TITLES: Record<Mode, { title: string; intro: string }> = {
  profiles: {
    title: 'Style profiles',
    intro: 'Observed measures, not strength scores.',
  },
  scouting: {
    title: 'Scouting report',
    intro: 'Observed games, not predictions.',
  },
  rankings: {
    title: 'Team Power Index',
    intro: 'Opponent- and event-weighted results.',
  },
  players: {
    title: 'Player rankings',
    intro: 'Player scores from observed games.',
  },
  regions: {
    title: 'Region power',
    intro: 'Mean Power of the top three per league.',
  },
  matches: {
    title: 'Match history',
    intro: 'Every rated series, newest first.',
  },
  tournaments: {
    title: 'Tournaments',
    intro: 'Schedules, forecasts and team reports.',
  },
}
