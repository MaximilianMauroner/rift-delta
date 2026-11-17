const LEAGUE_COLORS: Readonly<Record<string, string>> = {
  LCK: 'var(--league-lck)',
  LPL: 'var(--league-lpl)',
  LEC: 'var(--league-lec)',
  LCS: 'var(--league-lcs)',
  LCP: 'var(--league-lcp)',
  CBLOL: 'var(--league-cblol)',
}

export function leagueColor(code: string): string {
  return LEAGUE_COLORS[code.trim().toUpperCase()] ?? 'var(--league-other)'
}
