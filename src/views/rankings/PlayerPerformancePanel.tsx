import { useState } from 'react'
import type { CompactPlayer } from '../../domains/rankings/types'
import { playerPerformanceMetricKeys, playerPerformanceMetrics } from '../../domains/rankings/read'
import { Panel, PanelBody, PanelHeader } from '../../components/ui/panel'
import { Select } from '../../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { formatMetric } from './playerMetricFormat'

export function PlayerPerformancePanel({ players, scopeLabel }: { players: CompactPlayer[]; scopeLabel: string }) {
  const [selectedId, setSelectedId] = useState('')
  const player = players.find((entry) => entry.id === selectedId) ?? players[0]
  if (!player) return null
  const diagnostics = player.diagnostics
  const performance = diagnostics?.performance

  return (
    <Panel className="mt-5" aria-label="Observed player stats">
      <PanelHeader title="Observed player stats"
        actions={
          <Select aria-label="Player stats" value={player.id} onChange={(event) => setSelectedId(event.target.value)}>
            {players.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </Select>
        }
      />
      {performance && diagnostics ? (
        <>
          <PanelBody className="text-xs leading-relaxed text-muted">
            Oracle’s Elixir · {diagnostics.sampleGames} games in {scopeLabel}. Raw averages, not used in scores.
          </PanelBody>
          <Table aria-label={`${player.name} observed stats`}>
            <TableHeader><TableRow><TableHead>Stat</TableHead><TableHead className="text-right">Average</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader>
            <TableBody>
              {playerPerformanceMetricKeys.map((key) => {
                const metric = performance.metrics[key]
                return (
                  <TableRow key={key}>
                    <TableCell className="whitespace-normal" title={playerPerformanceMetrics[key].hint}>{playerPerformanceMetrics[key].label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMetric(key, metric.value)}</TableCell>
                    <TableCell className="text-right tabular-nums" title={`${metric.missing} games unavailable`}>
                      {metric.games}/{diagnostics.sampleGames} games
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      ) : <PanelBody className="text-sm text-muted">No stats for this player.</PanelBody>}
    </Panel>
  )
}
