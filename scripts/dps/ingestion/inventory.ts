import type { RiotItemEvent } from "../../../src/domains/dps/observation-types.ts";

function removeOne(inventory: number[], itemId: number): void {
  const index = inventory.indexOf(itemId);
  if (index >= 0) inventory.splice(index, 1);
}

export function applyInventoryEvent(inventory: number[], event: RiotItemEvent): number[] {
  const next = [...inventory];
  if (event.type === "ITEM_PURCHASED" && event.itemId) next.push(event.itemId);
  if ((event.type === "ITEM_SOLD" || event.type === "ITEM_DESTROYED") && event.itemId) {
    removeOne(next, event.itemId);
  }
  if (event.type === "ITEM_UNDO") {
    if (event.beforeId) removeOne(next, event.beforeId);
    if (event.afterId) next.push(event.afterId);
  }
  return next;
}
