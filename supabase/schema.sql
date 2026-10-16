-- Esquema inicial de la SuperApp Integrada (Planta Súper Sacos)
-- Se ejecuta en Supabase: Panel del proyecto -> SQL Editor -> pegar y correr.
-- Cubre lo que ya usa el Módulo 1 (Métodos y Tiempos) y deja lista la mesa
-- para el Módulo 2 (Biorario).

-- ===== Roles de usuario (ligados al login de Supabase Auth) =====
-- Cuando alguien se registra con usuario/clave, aquí queda su rol.
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('admin', 'supervisor')),
  created_at timestamptz not null default now()
);

-- ===== Módulo 1: Métodos y Tiempos =====

create table if not exists codigos (
  codigo text primary key,
  cliente text not null default '',
  descripcion text not null default '',
  linea text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists operaciones (
  nombre text primary key,
  familia text not null default 'Otras',
  tipo text not null check (tipo in ('Costura', 'Manual')),
  updated_at timestamptz not null default now()
);

create table if not exists tiempos (
  id bigint generated always as identity primary key,
  codigo text not null references codigos(codigo) on delete cascade,
  operacion text not null,
  min numeric,
  obs numeric,
  val numeric,
  supl numeric,
  muestras jsonb not null default '[]'::jsonb,
  orden int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references perfiles(id)
);
create index if not exists tiempos_codigo_idx on tiempos(codigo);

-- ===== Módulo 2: Biorario (base, se amplía cuando Said muestre la hoja) =====

create table if not exists biorario_registros (
  id bigint generated always as identity primary key,
  fecha date not null,
  hora int not null check (hora between 0 and 23),
  codigo text references codigos(codigo),
  operacion text not null,
  operario text not null,
  unidades numeric not null default 0,
  turno text,
  linea text,
  supervisor_id uuid references perfiles(id),
  created_at timestamptz not null default now()
);
create index if not exists biorario_fecha_idx on biorario_registros(fecha);

-- ===== Seguridad: Row Level Security =====
-- Por ahora: cualquier usuario con sesión (admin o supervisor) puede leer
-- todo. Escribir en tiempos/codigos/operaciones: solo admin. Escribir en
-- biorario_registros: admin o supervisor. Se puede afinar más adelante.

alter table perfiles enable row level security;
alter table codigos enable row level security;
alter table operaciones enable row level security;
alter table tiempos enable row level security;
alter table biorario_registros enable row level security;

create policy "lectura autenticados" on codigos for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on operaciones for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on tiempos for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on biorario_registros for select using (auth.role() = 'authenticated');
create policy "lectura propio perfil" on perfiles for select using (auth.uid() = id);

create policy "escritura admin" on codigos for all using (
  exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin')
);
create policy "escritura admin" on operaciones for all using (
  exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin')
);
create policy "escritura admin" on tiempos for all using (
  exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin')
);
create policy "escritura admin o supervisor" on biorario_registros for all using (
  exists (select 1 from perfiles p where p.id = auth.uid() and p.rol in ('admin', 'supervisor'))
);
