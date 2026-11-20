import { lazy } from 'react'
import { type Mode } from '../shellConfig'
import { loadTournamentsView } from '../tournaments/routeLoading'

const loadRegionsView = () => import('../regions/RegionsView').then((module) => ({ default: module.RegionsView }))

const loadMatchesView = () => import('../matches/MatchesView').then((module) => ({ default: module.MatchesView }))

function importPlayersView() {
  return import('./PlayersView').then((module) => ({ default: module.PlayersView }))
}

let playersView: ReturnType<typeof importPlayersView> | undefined
const loadPlayersView = () => playersView ??= importPlayersView()

const loadProfilesView = () => import('../style/StyleProfileRoute').then((module) => ({ default: module.StyleProfileRoute }))

const loadScoutingView = () => import('../scouting/ScoutingRoute').then((module) => ({ default: module.ScoutingRoute }))

const loadCompareAnalysis = () => import('./CompareAnalysis')

export const RegionsView = lazy(loadRegionsView)

export const MatchesView = lazy(loadMatchesView)

export const PlayersView = lazy(loadPlayersView)

export const StyleProfileRoute = lazy(loadProfilesView)

export const ScoutingRoute = lazy(loadScoutingView)

export const RegionCompareAnalysis = lazy(() => loadCompareAnalysis().then((module) => ({ default: module.RegionCompareAnalysis })))

export const TeamCompareAnalysis = lazy(() => loadCompareAnalysis().then((module) => ({ default: module.TeamCompareAnalysis })))

const VIEW_LOADERS = {
  rankings: undefined,
  players: loadPlayersView,
  profiles: loadProfilesView,
  scouting: loadScoutingView,
  regions: loadRegionsView,
  matches: loadMatchesView,
  tournaments: loadTournamentsView,
}

export function preloadView(mode: Mode) {
  const load = VIEW_LOADERS[mode]
  if (load) void load().catch(() => { /* Navigation can retry a failed preload. */ })
}

export function preloadComparison() {
  void loadCompareAnalysis().catch(() => { /* Opening the drawer retries. */ })
}
