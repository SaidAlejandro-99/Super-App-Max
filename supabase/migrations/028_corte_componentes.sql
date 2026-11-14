-- Línea Corte de componentes. El área trabaja 24 h y el supervisor (de día) anota a la mañana
-- siguiente lo que hizo cada máquina en cada turno: personas, cantidad y tiempo muerto.
-- No es hora a hora: un registro por máquina, fecha y turno.
-- Eficiencia = cantidad ÷ (meta por hora × horas disponibles); horas disponibles = horas del turno − tiempo muerto.

create table if not exists corte_maquinas (
  codigo text primary key,
  nombre text not null,
  unidad text not null,                  -- piezas, válvulas, paquetes…
  meta_hora numeric not null check (meta_hora > 0),
  meta_hora_2 numeric check (meta_hora_2 > 0), -- si trabajan 2 personas y la meta es otra (perforadora)
  horas numeric not null check (horas > 0 and horas <= 12), -- horas de un turno normal de esa máquina
  max_personas smallint not null default 1,
  orden smallint not null default 0,
  activo boolean not null default true
);
insert into corte_maquinas (codigo, nombre, unidad, meta_hora, meta_hora_2, horas, max_personas, orden) values
  ('M1', 'Máquina 1', 'piezas', 146, null, 11, 2, 1),
  ('M2', 'Máquina 2', 'piezas', 255, null, 8, 1, 2),
  ('M3', 'Máquina 3', 'piezas', 255, null, 8, 1, 3),
  ('M4', 'Máquina 4', 'piezas', 283, null, 11, 1, 4),
  ('FORMADORA', 'Formadora de válvulas', 'piezas', 500, null, 8, 1, 5),
  ('RIATA', 'Corte de riata', 'paquetes', 40, null, 8, 1, 6),
  ('PERFORADORA', 'Perforadora', 'piezas', 273, 450, 11, 2, 7)
on conflict (codigo) do nothing;

create table if not exists corte_registros (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  maquina text not null references corte_maquinas(codigo),
  turno text not null references turnos_def(codigo),
  horas numeric not null check (horas > 0 and horas <= 12),
  cantidad numeric not null check (cantidad >= 0),
  meta_hora numeric not null check (meta_hora > 0),
  meta_ajustada boolean not null default false,   -- día atípico: el supervisor cambió la meta
  tm_minutos integer not null default 0 check (tm_minutos >= 0),
  tm_causa text references causas_tm(codigo),
  nota text,
  supervisor_cedula text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid,
  unique (fecha, maquina, turno),
  check (tm_minutos <= horas * 60)
);
create table if not exists corte_personas (
  registro_id uuid not null references corte_registros(id) on delete cascade,
  cedula text not null references operarios(cedula) check (cedula ~ '^[0-9]+$'),
  primary key (registro_id, cedula)
);
create index if not exists corte_registros_fecha on corte_registros (fecha);
create index if not exists corte_personas_cedula on corte_personas (cedula);

alter table corte_maquinas enable row level security;
alter table corte_registros enable row level security;
alter table corte_personas enable row level security;
-- Leen los usuarios con sesión (menos Calidad); escriben admin y supervisores.
drop policy if exists "lectura" on corte_maquinas;
create policy "lectura" on corte_maquinas for select to authenticated using (true);
drop policy if exists "admin edita" on corte_maquinas;
create policy "admin edita" on corte_maquinas for all to authenticated using (es_admin()) with check (es_admin());
do $$ declare t text; begin
  foreach t in array array['corte_registros', 'corte_personas'] loop
    execute format('drop policy if exists "lectura" on %I', t);
    execute format('create policy "lectura" on %I for select to authenticated using (not es_calidad())', t);
    execute format('drop policy if exists "staff edita" on %I', t);
    execute format('create policy "staff edita" on %I for all to authenticated using (es_staff()) with check (es_staff())', t);
  end loop;
end $$;
revoke all on corte_maquinas, corte_registros, corte_personas from anon;

drop trigger if exists autor_y_fecha on corte_registros;
create trigger autor_y_fecha before insert or update on corte_registros for each row execute function poner_autor_y_fecha();
drop trigger if exists bitacora on corte_registros;
create trigger bitacora after insert or update or delete on corte_registros for each row execute function bitacora_registrar();
drop trigger if exists bitacora on corte_personas;
create trigger bitacora after insert or update or delete on corte_personas for each row execute function bitacora_registrar();

-- Mi Marcador: cada persona del registro queda con la eficiencia de la máquina en ese turno
-- (en Máquina 1 y en la perforadora con 2 personas la cantidad es de las dos).
create or replace view mm_corte with (security_invoker = true) as
  select null::bigint as id, p.cedula, r.fecha, 'CORTE'::text as linea, m.nombre as operacion, 'CORTE'::text as tipo,
         r.meta_hora as meta, round((r.horas * 60 - r.tm_minutos) / 60.0, 2) as horas, r.cantidad as prod_real,
         round(r.cantidad / (r.meta_hora * (r.horas * 60 - r.tm_minutos) / 60.0), 4) as eficiencia, 'corte'::text as origen
  from corte_registros r
  join corte_personas p on p.registro_id = r.id
  join corte_maquinas m on m.codigo = r.maquina
  where r.horas * 60 - r.tm_minutos > 0
    and r.cantidad / (r.meta_hora * (r.horas * 60 - r.tm_minutos) / 60.0) <= 2;
revoke all on mm_corte from anon, authenticated;

create or replace view mm_eficiencia with (security_invoker = true) as
 SELECT h.id, h.cedula, h.fecha, h.linea, COALESCE(n.nombre, h.operacion) AS operacion, h.tipo, h.meta, h.horas, h.prod_real, h.eficiencia, h.origen
   FROM mm_historico h
     LEFT JOIN ( VALUES ('PREP F'::text,'Preparación fondo'::text), ('PREP T','Preparación tapa'), ('PEGUE FONDO','Pegue fondo'), ('PEGUE TAPA','Pegue tapa'), ('PEGUE REATA','Pegue reata'), ('CIERRE','Cierre'), ('BAFLE','Pegue bafles'), ('PEGUE SOL','Pegue solapa'), ('PREP SOLAPA','Preparación solapa'), ('PREP REATA','Preparación reata'), ('PRE UP','Preparación upanel'), ('PEGUE CIN','Pegue cintilla'), ('CAPUCHON','Capuchón'), ('PAÑUELO','Pegue pañuelo'), ('SOPLADO','Soplado'), ('REBORDE','Reborde'), ('PETALO','Pegue pétalos'), ('PREP BASE','Preparación base'), ('REVISION','Revisión')) n(excel, nombre) ON n.excel = upper(h.operacion)
  WHERE h.fecha <= (SELECT mm_corte_excel())
UNION ALL
 SELECT b.id, b.cedula, b.fecha, b.linea, b.operacion, b.tipo, b.meta, b.horas, b.prod_real, b.eficiencia, b.origen
   FROM mm_bihorario b
  WHERE b.fecha > (SELECT mm_corte_excel())
UNION ALL
 SELECT c.id, c.cedula, c.fecha, c.linea, c.operacion, c.tipo, c.meta, c.horas, c.prod_real, c.eficiencia, c.origen
   FROM mm_corte c;
revoke all on mm_eficiencia from anon, authenticated;
