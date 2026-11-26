/** Where the router queue is drawn. Shared by the renderer and click handling. */
export interface QueueLayout {
  x: number;
  width: number;
  top: number;
  bottom: number;
  /** Height of one packet slot. */
  cell: number;
}

export function queueLayout(height: number, capacity: number): QueueLayout {
  const top = 48;
  const bottom = height - 32;
  return { x: 24, width: 64, top, bottom, cell: (bottom - top) / capacity };
}

/**
 * Which queued packet is under (x, y)? Index 0 is the front of the queue, drawn
 * at the bottom. Packets can be a couple of pixels tall, so a click hits the
 * nearest slot, and a click on the empty space above the stack hits the newest
 * packet if it's within `slack` pixels.
 */
export function packetAt(l: QueueLayout, length: number, x: number, y: number, slack = 8): number | undefined {
  if (length === 0 || x < l.x - slack || x > l.x + l.width + slack) return undefined;
  if (y > l.bottom || y < l.top) return undefined;
  const index = Math.floor((l.bottom - y) / l.cell);
  if (index < length) return index;
  const stackTop = l.bottom - length * l.cell;
  return stackTop - y <= slack ? length - 1 : undefined;
}
