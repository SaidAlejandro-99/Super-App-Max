-- Fecha en que se tomó el tiempo con cronómetro (se muestra en "Registro de la toma").
-- Antes se usaba updated_at, pero ese cambia con cualquier edición del código.
alter table tiempos add column if not exists tomado_at timestamptz;

create or replace function guardar_tiempos(p_codigo text, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into codigos (codigo, cliente, descripcion, linea)
  select pl.codigo, pl.cliente, pl.descripcion, pl.linea
  from planning pl where pl.codigo = p_codigo
  on conflict (codigo) do nothing;
  insert into codigos (codigo) values (p_codigo) on conflict (codigo) do nothing;

  delete from tiempos where codigo = p_codigo;

  insert into tiempos (codigo, operacion, min, obs, val, supl, muestras, orden, tomado_at, updated_at, updated_by)
  select p_codigo,
         r->>'op',
         nullif(r->>'min', '')::numeric,
         nullif(r->>'obs', '')::numeric,
         nullif(r->>'val', '')::numeric,
         nullif(r->>'supl', '')::numeric,
         coalesce(r->'muestras', '[]'::jsonb),
         (ord - 1)::int,
         nullif(r->>'ts', '')::timestamptz,
         now(),
         auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);

  update codigos set tiempos_updated_at = now(), updated_at = now() where codigo = p_codigo;
end;
$$;
