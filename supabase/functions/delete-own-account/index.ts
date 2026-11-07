/* Deployed with JWT verification on. No privileged API key is sent to clients. */
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createDeleteOwnAccountHandler } from './logic.mjs';

Deno.serve(createDeleteOwnAccountHandler({
  createClient,
  env:(key)=>Deno.env.get(key)
}));
