-- Cargar archivos (Métodos y Tiempos → Cargar archivos, solo admin).
-- Del Excel solo se guardan las columnas que usa la app; nada de precios.

-- Pedidos: de "BDD ANGIE V2" (origen 'bdd') y del MAESTRO_PROG (origen 'plan').
-- Sirven para buscar la referencia por número de pedido en el Bi-horario.
create table if not exists pedidos (
  planeador text not null,            -- "7906-1"
  origen text not null default 'bdd', -- bdd | plan
  pedido text not null default '',
  codigo text not null,
  cliente text not null default '',
  linea text not null default '',
  referencia text not null default '',
  recibido date,
  entrega date,
  cantidad numeric,
  saldo numeric,
  estado text not null default '',
  primary key (planeador, origen)
);
create index if not exists pedidos_codigo_idx on pedidos(codigo);

-- Programación del personal: el turno de cada persona por día (próximas semanas).
-- turno: código de turnos_def (1, 1-A, 4…) o novedad (VAC, INCP, LNR…).
create table if not exists programacion (
  cedula text not null,
  fecha date not null,
  turno text not null,
  primary key (cedula, fecha)
);
create index if not exists programacion_fecha_idx on programacion(fecha);

-- Grupo del operario en la programación (supervisor a cargo, FIJO o MAQ 1-4).
alter table operarios add column if not exists grupo text not null default '';

alter table pedidos enable row level security;
alter table programacion enable row level security;
create policy "lectura autenticados" on pedidos for select using (auth.role() = 'authenticated');
create policy "lectura autenticados" on programacion for select using (auth.role() = 'authenticated');
create policy "escritura admin" on pedidos for all using (es_admin()) with check (es_admin());
create policy "escritura admin" on programacion for all using (es_admin()) with check (es_admin());
