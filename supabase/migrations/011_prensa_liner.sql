-- Prensa y Liner (producto terminado). Ver docs/BIHORARIO.md.
-- No usan hojas por referencia: cada persona anota lo que prensó o enlainó
-- (referencia, presentación y cantidad) y el tiempo que estuvo fuera del
-- proceso (manualidad o tiempo muerto). Metas por hora: prensa 125 en pallet y
-- 60 en bulto; liner 40. La meta usada queda guardada en cada fila.

create table if not exists bh_pt (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references bh_turnos(id) on delete cascade,
  cedula text not null references operarios(cedula),
  codigo text references codigos(codigo),
  presentacion text check (presentacion in ('pallet', 'bulto', 'liner')),
  cantidad numeric not null check (cantidad >= 0),
  meta_hora numeric not null check (meta_hora > 0),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists bh_pt_turno_idx on bh_pt(turno_id);

create table if not exists bh_pt_personas (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references bh_turnos(id) on delete cascade,
  cedula text not null references operarios(cedula),
  min_fuera smallint not null default 0 check (min_fuera between 0 and 1440),
  causa text references causas_tm(codigo),
  nota text not null default '',
  orden int not null default 0,
  updated_by uuid default auth.uid(),
  unique (turno_id, cedula)
);
create index if not exists bh_pt_personas_turno_idx on bh_pt_personas(turno_id);

alter table bh_pt enable row level security;
alter table bh_pt_personas enable row level security;
create policy "lectura autenticados" on bh_pt for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on bh_pt_personas for select using (auth.role() = 'authenticated');
create policy "editar pt" on bh_pt for all using (puede_editar_turno(turno_id)) with check (puede_editar_turno(turno_id));
create policy "editar pt personas" on bh_pt_personas for all using (puede_editar_turno(turno_id)) with check (puede_editar_turno(turno_id));
