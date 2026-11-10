-- Auditoría 2026-11-10: SEG-06 (formato de cédula) y ERP-01 (bitácora de cambios).

-- Cédula: solo números, de 5 a 12 dígitos (evita que un texto raro llegue a las pantallas).
alter table operarios drop constraint if exists operarios_cedula_formato;
alter table operarios add constraint operarios_cedula_formato check (cedula ~ '^[0-9]{5,12}$');
alter table supervisores drop constraint if exists supervisores_cedula_formato;
alter table supervisores add constraint supervisores_cedula_formato check (cedula ~ '^[0-9]{5,12}$');
alter table bh_asignaciones drop constraint if exists bh_asignaciones_cedula_formato;
alter table bh_asignaciones add constraint bh_asignaciones_cedula_formato check (cedula ~ '^[0-9]{5,12}$');
alter table bh_pt_personas drop constraint if exists bh_pt_personas_cedula_formato;
alter table bh_pt_personas add constraint bh_pt_personas_cedula_formato check (cedula ~ '^[0-9]{5,12}$');

-- Bitácora: quién cambió qué, cuándo y cómo estaba antes. La llena la base (no la app),
-- así que no se puede saltar ni falsear. Solo el admin la lee.
create table if not exists bitacora (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  usuario uuid,
  correo text,
  tabla text not null,
  accion text not null,          -- INSERT | UPDATE | DELETE
  antes jsonb,
  despues jsonb
);
create index if not exists bitacora_fecha_idx on bitacora (fecha desc);
create index if not exists bitacora_tabla_idx on bitacora (tabla, fecha desc);
alter table bitacora enable row level security;
drop policy if exists "lectura admin" on bitacora;
create policy "lectura admin" on bitacora for select using (es_admin());
revoke all on bitacora from anon;
revoke insert, update, delete on bitacora from authenticated;

create or replace function bitacora_registrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  d jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- Un "guardar" que no cambió nada no se anota.
  if tg_op = 'UPDATE' and (a - 'updated_at' - 'updated_by') = (d - 'updated_at' - 'updated_by') then return null; end if;
  insert into bitacora (usuario, correo, tabla, accion, antes, despues)
  values (auth.uid(), auth.jwt() ->> 'email', tg_table_name, tg_op, a, d);
  return null;
end;
$$;
revoke all on function bitacora_registrar() from public, anon, authenticated;

-- Autor y fecha los pone la base: quien corrige queda como autor (antes quedaba quien creó la fila).
-- jsonb_populate_record ignora las columnas que la tabla no tiene.
create or replace function poner_autor_y_fecha() returns trigger
language plpgsql set search_path = public as $$
begin
  new := jsonb_populate_record(new, jsonb_build_object('updated_at', now())
    || case when auth.uid() is not null then jsonb_build_object('updated_by', auth.uid()) else '{}'::jsonb end);
  return new;
end;
$$;

do $$
declare t text;
begin
  -- Tablas de trabajo diario y datos maestros (no las cargas masivas de Excel:
  -- pedidos, planning, programacion y mm_historico, que se reemplazan completas).
  foreach t in array array['bh_turnos', 'bh_hojas', 'bh_bloques', 'bh_asignaciones', 'bh_registros', 'bh_pt', 'bh_pt_personas',
                           'operarios', 'supervisores', 'perfiles', 'tiempos', 'operaciones', 'codigos', 'causas_tm', 'config', 'turnos_def'] loop
    execute format('drop trigger if exists bitacora on %I', t);
    execute format('create trigger bitacora after insert or update or delete on %I for each row execute function bitacora_registrar()', t);
  end loop;
  foreach t in array array['bh_registros', 'bh_pt', 'bh_pt_personas', 'operarios', 'tiempos', 'codigos', 'config', 'operaciones', 'supervisores'] loop
    execute format('drop trigger if exists autor_y_fecha on %I', t);
    execute format('create trigger autor_y_fecha before insert or update on %I for each row execute function poner_autor_y_fecha()', t);
  end loop;
end $$;
