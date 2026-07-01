export function paginateItems(items, query = {}, defaults = {}) {
  const list = Array.isArray(items) ? items : [];
  const hasPaging = query.limit !== undefined || query.offset !== undefined || query.page !== undefined;
  if (!hasPaging) {
    return {
      items: list,
      pageInfo: {
        offset: 0,
        limit: list.length,
        total: list.length,
        hasMore: false
      }
    };
  }
  const defaultLimit = Number(defaults.limit || 20);
  const maxLimit = Number(defaults.maxLimit || 50);
  const limit = clampInteger(query.limit, 1, maxLimit, defaultLimit);
  const page = query.page === undefined ? null : clampInteger(query.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const rawOffset = page ? (page - 1) * limit : query.offset;
  const offset = clampInteger(rawOffset, 0, Number.MAX_SAFE_INTEGER, 0);
  const nextItems = list.slice(offset, offset + limit);
  return {
    items: nextItems,
    pageInfo: {
      offset,
      limit,
      total: list.length,
      hasMore: offset + nextItems.length < list.length,
      nextOffset: offset + nextItems.length
    }
  };
}

function clampInteger(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(next)));
}
