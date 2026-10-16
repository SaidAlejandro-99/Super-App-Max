-- Módulo 1 completo: lo que necesita la app para funcionar igual que el
-- panel-artefacto original (Resumen, Producción futura, edición de tiempos).

-- Fecha de la última edición de los tiempos de cada código ("Act. dd/mm/aa").
alter table codigos add column if not exists tiempos_updated_at timestamptz;

-- Plan de producción futura (foto del MAESTRO_PROG).
create table if not exists planning (
  codigo text primary key,
  cliente text not null default '',
  descripcion text not null default '',
  linea text not null default '',
  prox_fab date,
  ult_fab date,
  veces int not null default 0,
  orden int not null default 0
);

-- Valores sueltos de configuración (ej. fecha de corte del plan).
create table if not exists config (
  clave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);

alter table planning enable row level security;
alter table config enable row level security;

create policy "lectura autenticados" on planning for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on config for select using (auth.role() = 'authenticated');
create policy "escritura admin" on planning for all using (
  exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin')
);
create policy "escritura admin" on config for all using (
  exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin')
);

-- Guarda la lista completa de tiempos de un código en un solo paso
-- (reemplaza las filas y marca la fecha). Corre con los permisos de quien
-- la llama, así que RLS sigue exigiendo rol admin.
create or replace function guardar_tiempos(p_codigo text, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Si el código solo existe en el plan, se crea en codigos.
  insert into codigos (codigo, cliente, descripcion, linea)
  select pl.codigo, pl.cliente, pl.descripcion, pl.linea
  from planning pl where pl.codigo = p_codigo
  on conflict (codigo) do nothing;
  insert into codigos (codigo) values (p_codigo) on conflict (codigo) do nothing;

  delete from tiempos where codigo = p_codigo;

  insert into tiempos (codigo, operacion, min, obs, val, supl, muestras, orden, updated_at, updated_by)
  select p_codigo,
         r->>'op',
         nullif(r->>'min', '')::numeric,
         nullif(r->>'obs', '')::numeric,
         nullif(r->>'val', '')::numeric,
         nullif(r->>'supl', '')::numeric,
         coalesce(r->'muestras', '[]'::jsonb),
         (ord - 1)::int,
         coalesce(nullif(r->>'ts', '')::timestamptz, now()),
         auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);

  update codigos set tiempos_updated_at = now(), updated_at = now() where codigo = p_codigo;
end;
$$;
