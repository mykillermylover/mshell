// Where a domain finds frames. Deliberately generic: a domain states what it
// needs from a frame, this only routes a monitor connector to those frames.
export interface MonitorFrames<F> {
  /** A frame for this monitor, if that monitor is managed. */
  byConnector(connector: string): F | undefined;
  all(): F[];
  /** The frame that answers when no monitor was given. */
  focused(): F | undefined;
}
