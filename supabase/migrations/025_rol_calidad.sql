-- Rol 'calidad' (inspectores de calidad): solo consultan pedidos en el Bi-horario
-- (trazabilidad y liberación de procesos). No escriben nada: las políticas de escritura
-- exigen admin o supervisor. Además, en lectura no ven datos de personas ni de eficiencia.
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check check (rol = any (array['admin', 'supervisor', 'visita', 'calidad']));

create or replace function es_calidad() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'calidad')
$$;

-- Políticas restrictivas: se suman a las de lectura que ya existen y solo le quitan a 'calidad'
-- las tablas con cédulas, eficiencias, programación y estudios de tiempos.
do $$
declare t text;
begin
  foreach t in array array['operarios', 'mm_historico', 'programacion', 'bh_asignaciones', 'bh_registros',
                           'bh_pt', 'bh_pt_personas', 'tiempos', 'planning'] loop
    execute format('drop policy if exists "calidad sin acceso" on %I', t);
    execute format('create policy "calidad sin acceso" on %I as restrictive for select to authenticated using (not es_calidad())', t);
  end loop;
end $$;
-- De los perfiles, Calidad solo ve el suyo.
drop policy if exists "calidad solo su perfil" on perfiles;
create policy "calidad solo su perfil" on perfiles as restrictive for select to authenticated
  using (not es_calidad() or id = auth.uid());
