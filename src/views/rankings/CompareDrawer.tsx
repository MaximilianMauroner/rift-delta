import { useEffect, useRef, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { DataState } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import type { PublicTeamStanding as RankingSummaryStanding } from '../../domains/rankings/types'
import type { RegionStrength } from '../../domains/rankings/read'

export type CompareColumn = {
  id: string
  name: string
  sub?: string
  badge?: ReactNode
  color?: string
}

export type CompareRow<E> = {
  key: string
  label: string
  cell: (entity: E) => ReactNode
  score?: (entity: E) => number
  better?: 'high' | 'low'
}

export type CompareDrawerProps<E> = {
  open: boolean
  title: string
  entities: E[]
  columns: CompareColumn[]
  rows: CompareRow<E>[]
  /** Shown above the table, for the answer most people open a comparison for. */
  before?: ReactNode
  after?: ReactNode
  onClose: () => void
  onRemove: (id: string) => void
  presentation?: 'sheet' | 'page'
}

export function CompareDrawer<E>({
  open,
  title,
  entities,
  columns,
  rows,
  before,
  after,
  onClose,
  onRemove,
  presentation = 'sheet',
}: CompareDrawerProps<E>) {
  const pageRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (presentation !== 'page') return
    pageRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [presentation])
  const contents = (
    <>
      {presentation === 'page' ? before : null}
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        <h2 className="mr-auto text-base font-semibold text-text">{title}</h2>
        <Button type="button" variant="ghost" onClick={onClose}>
          <X size={16} aria-hidden="true" />Close
        </Button>
      </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain p-0">
          {presentation === 'sheet' ? before : null}
          {entities.length === 0 ? (
            <DataState icon={<Plus size={26} aria-hidden="true" />} title="Nothing selected yet" />
          ) : (
            <>
              <div className="px-5 py-4 max-sm:px-3.5">
                <Table
                  data-first-answer={presentation === 'page' && entities.length !== 2 ? 'comparison' : undefined}
                  containerClassName="max-w-full rounded-md border border-line [contain:paint] [overscroll-behavior-x:contain]"
                  className="compare-table w-full border-collapse"
                  data-compare-count={columns.length}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead aria-label="Metric" />
                      {columns.map((column) => (
                        <TableHead key={column.id}>
                          <div className="compare-entity-heading">
                            <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-text">
                              {column.badge}
                              <b>{column.name}</b>
                            </span>
                            <div className="flex min-w-0 items-center justify-between gap-1">
                              {column.sub ? <small className="text-xs text-muted">{column.sub}</small> : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="ml-auto rounded-md"
                                onClick={() => onRemove(column.id)}
                                aria-label={`Remove ${column.name} from comparison`}
                                title={`Remove ${column.name}`}
                              >
                                <X size={14} aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const best = bestIds(entities, columns, row)
                      return (
                        <TableRow key={row.key}>
                          <TableHead scope="row">{row.label}</TableHead>
                          {entities.map((entity, index) => (
                            <TableCell key={columns[index].id} className={best.has(columns[index].id) ? 'best' : ''}>
                              {row.cell(entity)}
                              {best.has(columns[index].id) ? (
                                <Badge variant="secondary" className="ml-2 px-1.5 text-xs leading-[1.2]" aria-label={`Best ${row.label.toLowerCase()} value`}>
                                  Best
                                </Badge>
                              ) : null}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {after ? <div className="grid min-w-0 gap-4 px-5 pt-4 pb-6 max-sm:p-3.5">{after}</div> : null}
            </>
          )}
        </div>
    </>
  )
  if (presentation === 'page') {
    return (
      <section ref={pageRef} tabIndex={-1} className="comparison-page" aria-label={title}>
        {contents}
      </section>
    )
  }
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <SheetContent side="right" showCloseButton={false} className="compare-sheet data-[side=right]:w-[min(980px,100vw)] data-[side=right]:max-w-none gap-0 border-l border-line bg-surface p-0 text-text shadow-[var(--overlay-shadow)] data-[side=right]:sm:w-[min(980px,94vw)] data-[side=right]:sm:max-w-none">
        <SheetHeader className="sr-only"><SheetTitle>{title}</SheetTitle></SheetHeader>
        {contents}
      </SheetContent>
    </Sheet>
  )
}

export function RegionCompareDrawer(props: CompareDrawerProps<RegionStrength>) {
  return <CompareDrawer {...props} />
}

export function TeamCompareDrawer(props: CompareDrawerProps<RankingSummaryStanding>) {
  return <CompareDrawer {...props} presentation="page" />
}

function bestIds<E>(entities: E[], columns: CompareColumn[], row: CompareRow<E>) {
  const ids = new Set<string>()
  if (!row.score || entities.length < 2) return ids
  const scored = entities.map((entity, index) => ({ id: columns[index].id, value: row.score!(entity) }))
  const valid = scored.filter((entry) => Number.isFinite(entry.value))
  if (valid.length < 2) return ids
  const target =
    row.better === 'low'
      ? Math.min(...valid.map((entry) => entry.value))
      : Math.max(...valid.map((entry) => entry.value))
  const winners = valid.filter((entry) => entry.value === target)
  if (winners.length !== 1) return ids
  ids.add(winners[0].id)
  return ids
}
