export function rawMoveIndex(rawIds, movingId, neighborId) {
  const own = rawIds.indexOf(movingId);
  const other = rawIds.indexOf(neighborId);
  if (own === -1) return rawIds.length;
  if (other === -1) return own;
  const rest = rawIds.filter((x) => x !== movingId);
  const otherIdx = rest.indexOf(neighborId);
  return own < other ? otherIdx + 1 : otherIdx;
}