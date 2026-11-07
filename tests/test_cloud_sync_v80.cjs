/* Historical entrypoint. v81 replaces unconditional upserts with
   conflict-safe synchronization; keep this command working for CI users. */
require('./test_cloud_backend_v81.cjs');
