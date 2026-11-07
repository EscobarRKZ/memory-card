/* Memory Card v80 — bounded cloud transfer helpers.
   Read all pages before returning: partial cloud reads must never be merged.
   Pure transport helpers; no DOM, storage, auth, or application-state mutation. */
(function (root) {
  'use strict';
  const READ_PAGE_SIZE = 400;
  const WRITE_BATCH_SIZE = 100;

  function validateBatchSize(value) {
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      throw new Error('Invalid cloud transfer batch size');
    }
  }

  async function downloadGames(client, userId, pageSize = READ_PAGE_SIZE) {
    validateBatchSize(pageSize);
    if (!userId) throw new Error('Missing cloud user ID');
    const all = [], seen = new Set();
    let expected = null;

    for (let offset = 0; ; offset += pageSize) {
      const options = offset === 0 ? { count: 'exact' } : undefined;
      const { data, error, count } = await client.from('games')
        .select('*', options)
        .eq('user_id', userId)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Invalid cloud page response');
      if (data.length > pageSize) throw new Error('Cloud page exceeded requested limit');
      if (offset === 0 && Number.isInteger(count) && count >= 0) expected = count;

      for (const game of data) {
        const id = String(game?.id ?? '');
        if (!id || seen.has(id)) throw new Error('Duplicate or missing cloud game ID');
        seen.add(id);
        all.push(game);
      }
      if (expected !== null && all.length > expected) throw new Error('Cloud count changed during transfer');
      if (data.length < pageSize || (expected !== null && all.length === expected)) break;
    }

    if (expected !== null && all.length !== expected) {
      throw new Error('Incomplete cloud download: expected ' + expected + ', got ' + all.length);
    }
    return all;
  }

  async function uploadGames(client, rows, batchSize = WRITE_BATCH_SIZE) {
    validateBatchSize(batchSize);
    if (!Array.isArray(rows)) throw new Error('Invalid cloud upload payload');
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const part = rows.slice(offset, offset + batchSize);
      const { error } = await client.from('games').upsert(part, { onConflict: 'user_id,id' });
      if (error) {
        throw new Error('Cloud game batch ' + (Math.floor(offset / batchSize) + 1) + ' failed: ' +
          String(error.message || error));
      }
    }
    return rows.length;
  }

  const api = Object.freeze({ downloadGames, uploadGames, READ_PAGE_SIZE, WRITE_BATCH_SIZE });
  root.MemoryCardCloudTransferV80 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : {});
