// Product stock is counted in pieces; an option labelled like "Set of 4" uses 4 of them.
export const piecesPerUnit = (selectedOptions) =>
  Math.max(
    1,
    ...(selectedOptions || []).map((o) => Number(/set of\s+(\d+)/i.exec(o?.value || "")?.[1]) || 1)
  );

/** Pieces of stock an order line takes (orders saved before set counting have no piecesPerUnit) */
export const stockPieces = (item) => item.quantity * (item.piecesPerUnit || 1);
