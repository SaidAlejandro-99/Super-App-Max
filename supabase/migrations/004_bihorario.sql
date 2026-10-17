-- Módulo 2: Bi-horario. Ver docs/BIHORARIO.md para las decisiones.
-- Reemplaza la tabla base biorario_registros (estaba vacía).

drop table if exists biorario_registros;

-- ===== Funciones de permisos =====
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin')
$$;

create or replace function es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol in ('admin', 'supervisor'))
$$;

-- ===== Catálogos =====
create table if not exists supervisores (
  cedula text primary key,
  nombre text not null,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Usuario (login) ligado a un supervisor.
alter table perfiles add column if not exists supervisor_cedula text references supervisores(cedula);

create table if not exists operarios (
  cedula text primary key,
  nombre text not null,
  linea text not null default '',
  rol text not null default '',
  operacion_base text not null default '',
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists turnos_def (
  codigo text primary key,
  inicio time not null,
  fin time not null,
  inicio_domingo time,           -- turno 3 entra a las 19:00 el domingo
  orden int not null default 0
);

-- tipo: 'perdida' (tiempo muerto de línea, descuenta), 'manualidad'
-- (actividades varias, descuenta pero no es pérdida), 'tardanza' (no descuenta).
create table if not exists causas_tm (
  codigo text primary key,
  descripcion text not null,
  corta text not null default '',
  tipo text not null default 'perdida' check (tipo in ('perdida', 'manualidad', 'tardanza')),
  rapida boolean not null default false,
  orden int not null default 100
);

-- ===== Bi-horario =====
create table if not exists bh_turnos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  turno text not null references turnos_def(codigo),
  linea text not null,
  supervisor_cedula text references supervisores(cedula),
  supervisor2_cedula text references supervisores(cedula),
  estado text not null default 'abierto' check (estado in ('abierto', 'terminado')),
  terminado_at timestamptz,
  observaciones text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (fecha, turno, linea)
);

create table if not exists bh_hojas (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references bh_turnos(id) on delete cascade,
  codigo text not null references codigos(codigo),
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists bh_bloques (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references bh_turnos(id) on delete cascade,
  hoja_id uuid not null references bh_hojas(id) on delete cascade,
  operacion text not null,
  meta_hora numeric,
  meta_origen text not null default 'manual' check (meta_origen in ('estudio', 'manual')),
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists bh_asignaciones (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references bh_turnos(id) on delete cascade,
  bloque_id uuid not null references bh_bloques(id) on delete cascade,
  cedula text not null references operarios(cedula),
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (bloque_id, cedula)
);

-- Una fila por operario-operación y hora del turno (hora = 0, 1, 2… desde el inicio).
create table if not exists bh_registros (
  asignacion_id uuid not null references bh_asignaciones(id) on delete cascade,
  hora smallint not null check (hora between 0 and 23),
  turno_id uuid not null references bh_turnos(id) on delete cascade,
  unidades numeric,
  tm_causa text references causas_tm(codigo),
  tm_minutos smallint check (tm_minutos between 0 and 60),
  nota text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (asignacion_id, hora)
);

create index if not exists bh_turnos_fecha_idx on bh_turnos(fecha);
create index if not exists bh_hojas_turno_idx on bh_hojas(turno_id);
create index if not exists bh_bloques_turno_idx on bh_bloques(turno_id);
create index if not exists bh_asig_turno_idx on bh_asignaciones(turno_id);
create index if not exists bh_reg_turno_idx on bh_registros(turno_id);

-- El supervisor puede editar mientras el turno esté abierto y hasta 2 días
-- después de terminarlo. El admin, siempre.
create or replace function puede_editar_turno(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or (es_staff() and exists (
    select 1 from bh_turnos
    where id = t and (estado = 'abierto' or terminado_at > now() - interval '2 days')
  ))
$$;

-- ===== RLS =====
alter table supervisores enable row level security;
alter table operarios enable row level security;
alter table turnos_def enable row level security;
alter table causas_tm enable row level security;
alter table bh_turnos enable row level security;
alter table bh_hojas enable row level security;
alter table bh_bloques enable row level security;
alter table bh_asignaciones enable row level security;
alter table bh_registros enable row level security;

create policy "lectura autenticados" on supervisores for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on operarios for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on turnos_def for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on causas_tm for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on bh_turnos for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on bh_hojas for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on bh_bloques for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on bh_asignaciones for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on bh_registros for select using (auth.role() = 'authenticated');

create policy "escritura admin" on supervisores for all using (es_admin()) with check (es_admin());
create policy "escritura admin" on turnos_def for all using (es_admin()) with check (es_admin());
create policy "escritura admin" on causas_tm for all using (es_admin()) with check (es_admin());

-- Personal: supervisores y admin agregan y retiran; borrar, solo admin.
create policy "alta staff" on operarios for insert with check (es_staff());
create policy "edicion staff" on operarios for update using (es_staff()) with check (es_staff());
create policy "borrado admin" on operarios for delete using (es_admin());

create policy "abrir turno staff" on bh_turnos for insert with check (es_staff());
create policy "editar turno" on bh_turnos for update using (puede_editar_turno(id)) with check (es_staff());
create policy "borrar turno admin" on bh_turnos for delete using (es_admin());

create policy "editar hojas" on bh_hojas for all using (puede_editar_turno(turno_id)) with check (puede_editar_turno(turno_id));
create policy "editar bloques" on bh_bloques for all using (puede_editar_turno(turno_id)) with check (puede_editar_turno(turno_id));
create policy "editar asignaciones" on bh_asignaciones for all using (puede_editar_turno(turno_id)) with check (puede_editar_turno(turno_id));
create policy "editar registros" on bh_registros for all using (puede_editar_turno(turno_id)) with check (puede_editar_turno(turno_id));

-- Perfiles: el admin ve y edita todos (para ligar usuarios a supervisores).
create policy "admin ve perfiles" on perfiles for select using (es_admin());
create policy "admin edita perfiles" on perfiles for update using (es_admin()) with check (es_admin());

-- ===== Datos base =====
insert into turnos_def (codigo, inicio, fin, inicio_domingo, orden) values
  ('1-A', '05:00', '13:00', null, 1),
  ('1',   '06:00', '14:00', null, 2),
  ('2',   '13:00', '21:00', null, 3),
  ('3',   '21:00', '05:00', '19:00', 4),
  ('4',   '06:00', '18:00', null, 5),
  ('5',   '18:00', '06:00', null, 6),
  ('6',   '07:00', '17:00', null, 7),
  ('7',   '07:00', '16:00', null, 8),
  ('11',  '06:00', '18:00', null, 9),
  ('22',  '18:00', '06:00', null, 10)
on conflict (codigo) do nothing;

insert into causas_tm (codigo, descripcion, corta, tipo, rapida, orden) values
  ('411', 'Daño o falla Mecánica', 'DM · Daño mecánico', 'perdida', true, 1),
  ('425', 'Falta de Productos en Proceso (Semielaborados.)', 'FM · Falta de material', 'perdida', true, 2),
  ('232', 'Falla externa: Falta de aire comprimido por daño interno (Tuberías, Válvulas…) (Fuera de la línea de producción)', 'Falta de aire', 'perdida', true, 3),
  ('110', 'Reuniones - Capacitaciones', 'Reunión / capacitación', 'perdida', true, 4),
  ('441', 'Falta de Personal del proceso o linea (Ausencias, personal en otros procesos, incapacidades, lluvias, paros, eventos externos..)', 'Falta de personal / lluvia', 'perdida', true, 5),
  ('211', 'Falla externa: Falta de energía por proveedor (ej: Air-e, Zona Franca...)', 'Falta de energía', 'perdida', true, 6),
  ('480', 'Falla LOCATIVAS (paredes, techos, filtraciones por lluvia)', 'Falla locativa', 'perdida', true, 7),
  ('315', 'Limpieza & Sanitización', 'Limpieza', 'perdida', true, 8),
  ('MAN', 'Manualidad: actividades varias (barrer, limpiar, apoyo) — no medible', 'Manualidad', 'manualidad', true, 9),
  ('TAR', 'Llegada tarde (se castiga: no descuenta del tiempo disponible)', 'Llegó tarde', 'tardanza', true, 10),
  ('444', 'Falta de Personal por reemplazo de descanso en otros procesos', '', 'perdida', false, 20),
  ('412', 'Daño o falla Eléctrica', '', 'perdida', false, 21),
  ('421', 'Falta de Materias Primas', '', 'perdida', false, 22),
  ('414', 'Daño o falla Electrónica o de Automatización', '', 'perdida', false, 23),
  ('415', 'Daño o falla Neumático del equipo', '', 'perdida', false, 24),
  ('445', 'Falta de Personal (apoyo a la producción en otras áreas)', '', 'perdida', false, 25),
  ('231', 'Falla externa: Falta de aire comprimido por daño compresor (Fuera de la línea de producción)', '', 'perdida', false, 26),
  ('170', 'Parada Planeada por: Arreglos locativos programados durante el tiempo pagado', '', 'perdida', false, 27),
  ('422', 'Falta de Material de Empaque (Bopp, Cartulina, etiqueta, plegadiza, envase, tapas, corrugados, etc.)', '', 'perdida', false, 28),
  ('342', 'Verificación Calidad Producto', '', 'perdida', false, 29),
  ('550', 'Paradas menores: cambio de material de empaque, congestión de linea, otros', '', 'perdida', false, 30),
  ('343', 'Liberación Línea Arranque', '', 'perdida', false, 31),
  ('455', 'Falla en la Operación de un componente o sistema neumático', '', 'perdida', false, 32),
  ('341', 'Muestreo Producto', '', 'perdida', false, 33),
  ('462', 'Falta o falla en la información de MATERIALES del proceso (FICHA TÉCNICA, ETC)', '', 'perdida', false, 34),
  ('413', 'Daño o falla Hidráulico', '', 'perdida', false, 35),
  ('160', 'Parada Planeada: Limpieza general/profunda fin de semana / inicio de semana / Arranque / finalización de línea.', '', 'perdida', false, 36),
  ('311', 'Alistamiento general del área/equipos/herramientas/lavado/despeje de área', '', 'perdida', false, 37),
  ('316', 'Acondicionamiento materiales', '', 'perdida', false, 38)
on conflict (codigo) do nothing;
