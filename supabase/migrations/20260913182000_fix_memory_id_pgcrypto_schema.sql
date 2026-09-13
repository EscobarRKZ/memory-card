create or replace function public.make_memory_id()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'MC-' || upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,4));
    exit when not exists(select 1 from public.profiles where memory_id=candidate);
  end loop;
  return candidate;
end;
$$;
