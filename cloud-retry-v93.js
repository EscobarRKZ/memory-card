/* Memory Card v93 — bounded transient-cloud retry policy.
 * Pure classification and delays; never retries mutations by itself.
 * The host must rerun a complete cloud download + CAS reconciliation.
 */
(function(root){
  'use strict';
  const MAX_ATTEMPTS=5;
  const MAX_DELAY_MS=45000;
  const STATUS=new Set([408,425,429,500,502,503,504,520,521,522,523,524]);
  const CODE=/^(ECONNRESET|ECONNABORTED|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|NETWORK_ERROR|FETCH_ERROR)$/i;
  const TEXT=/(failed to fetch|fetch failed|network(?:error| request| failure| connection)|offline|timed? out|timeout|temporarily unavailable|service unavailable|gateway timeout|connection (?:reset|closed|refused)|too many requests|rate.?limit exceeded)/i;
  const CONFLICT=/(MC_SYNC_CONFLICT|SYNC_CONFLICT|LOCAL_ACCOUNT_MISMATCH|NOT_AUTHENTICATED|INVALID_|DUPLICATE_|EXPECTED_REVISION|UNCONFIRMED|JWT|permission denied)/i;
  function shouldRetry(error){
    if(!error)return false;
    const code=String(error.code||'');
    const message=String(error.message||'');
    const status=Number(error.status||error.statusCode||0);
    if(CONFLICT.test(code)||CONFLICT.test(message)||code==='23505'||code==='42501')return false;
    if(status>=400&&status<500&&!STATUS.has(status))return false;
    if(STATUS.has(status))return true;
    if(CODE.test(code))return true;
    return TEXT.test(message);
  }
  function nextDelay(attempt,random=Math.random){
    const n=Math.max(1,Math.floor(Number(attempt)||1));
    const raw=Math.min(30000,1500*Math.pow(2,Math.min(n-1,6)));
    let factor=Number(random());
    if(!Number.isFinite(factor))factor=.5;
    factor=Math.max(0,Math.min(1,factor));
    return Math.round(Math.min(MAX_DELAY_MS,raw*(.8+.4*factor)));
  }
  const api=Object.freeze({MAX_ATTEMPTS,MAX_DELAY_MS,shouldRetry,nextDelay});
  root.MemoryCardCloudRetryV93=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
