/**
 * Run an async worker over items with bounded concurrency.
 *
 * Item failures never reject the pool: each result is
 * `{ ok: true, value }` or `{ ok: false, error }`, in input order.
 * Workers receive `(item, index)`.
 *
 * @param {Array} items
 * @param {number} limit maximum concurrent workers (floored, minimum 1)
 * @param {(item: any, index: number) => Promise<any>} worker
 * @returns {Promise<Array<{ ok: boolean, value?: any, error?: any }>>}
 */
export async function mapPool(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  const laneCount = Math.max(1, Math.min(Math.floor(limit) || 1, list.length));
  let next = 0;

  async function lane() {
    while (next < list.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { ok: true, value: await worker(list[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: laneCount }, lane));
  return results;
}
