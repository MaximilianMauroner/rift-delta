const GOLDEN_ANGLE = 137.508
const FIRST_HUE = 332

/**
 * A team's identity colour, used small: its mark and its dot on a lane.
 *
 * The n-th distinct code in rank order takes hue 332° + n × the golden angle,
 * so teams next to each other in the order sit far apart on the hue wheel.
 * Pass one order everywhere and a team keeps one colour in every view. A code
 * outside the order takes a hue from its own letters, so it is still stable.
 */
export function teamColor(code: string, rankOrder: readonly string[]): string {
  const index = rankOrder.indexOf(code)
  const hue = index >= 0 ? FIRST_HUE + index * GOLDEN_ANGLE : codeHue(code)
  return `oklch(74% 0.14 ${(hue % 360).toFixed(1)})`
}

function codeHue(code: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < code.length; index++) hash = Math.imul(hash ^ code.charCodeAt(index), 0x01000193)
  return (hash >>> 0) % 360
}
