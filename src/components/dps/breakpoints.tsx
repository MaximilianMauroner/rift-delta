import type { CSSProperties } from "react";
import { breakpointGrid } from "../../domains/dps/compare-view.ts";
import type { BreakpointPoint, ComparisonLabels } from "./types.ts";

export function BreakpointHeat({
  points,
  duration,
  labels,
}: {
  points: BreakpointPoint[];
  duration: number;
  labels: ComparisonLabels;
}) {
  if (points.length === 0) {
    return (
      <>
        <h3 className="context">Where it flips</h3>
        <p className="note">Waiting for the grid…</p>
      </>
    );
  }
  const grid = breakpointGrid(points);
  const flat = grid.flatArmorValues;
  if (grid.rows.length === 0) {
    return (
      <>
        <h3 className="context">Where it flips · applied damage in {duration}s</h3>
        <p className="lede">
          Nothing flips at this fight length. Across every armor and bonus-health point in the
          sweep, both builds apply the same damage to the selected target.
        </p>
        <p className="note">
          Armor {flat[0]} to {flat[flat.length - 1]}, bonus health {grid.bonusHealthValues[0]} to{" "}
          {grid.bonusHealthValues[grid.bonusHealthValues.length - 1]}. A shorter window, or the TTK
          metric, separates the builds.
        </p>
      </>
    );
  }
  return (
    <>
      <div className="heat-head">
        <h3 className="context">Where it flips · applied damage in {duration}s</h3>
        <p className="legend">
          <span className="swatch swatch-a" aria-hidden /> + {labels.a} ahead
          <span className="swatch swatch-b" aria-hidden /> − {labels.b} ahead
        </p>
      </div>
      <div
        className="heat-scroll"
        tabIndex={0}
        role="region"
        aria-label="Damage difference by armor and bonus health"
      >
        <table className="heat">
          <caption className="sr-only">
            Applied damage difference between {labels.a} and {labels.b} by target armor and bonus
            health
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Armor</th>
              <th scope="colgroup" colSpan={grid.bonusHealthValues.length}>Bonus HP</th>
            </tr>
            <tr>
              {grid.bonusHealthValues.map((value) => (
                <th scope="col" key={value} className="num">
                  {value.toLocaleString()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flat.length > 0 && (
              <tr className="flat-row">
                <th scope="row" className="num">
                  {flat[0]} – {flat[flat.length - 1]}
                </th>
                <td colSpan={grid.bonusHealthValues.length}>No difference in applied damage</td>
              </tr>
            )}
            {grid.rows.map((row) => (
              <tr key={row.armor}>
                <th scope="row" className="num">
                  {row.armor}
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.bonusHealth}
                    className={`num heat-cell ${Math.round(cell.delta) === 0 ? "" : cell.delta > 0 ? "a" : "b"}`}
                    style={{
                      "--heat-strength": `${14 + 20 * Math.min(1, Math.abs(cell.delta) / grid.maxAbsDelta)}%`,
                    } as CSSProperties}
                  >
                    {Math.round(cell.delta) === 0
                      ? "0"
                      : `${cell.delta > 0 ? "+" : "−"}${Math.abs(Math.round(cell.delta)).toLocaleString()}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Rows are target armor, columns are bonus health, values are damage applied to the selected
        target in {duration}s. Armor is swept against the selected target&apos;s own health pool.
      </p>
    </>
  );
}
