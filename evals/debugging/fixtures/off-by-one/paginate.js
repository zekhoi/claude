/** Returns the items on a 1-based page. */
export function paginate(items, page, pageSize) {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}
