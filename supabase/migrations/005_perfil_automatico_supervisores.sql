-- Cuando se crea un usuario en Supabase Auth con el correo de un supervisor
-- registrado, se le crea solo su perfil con rol 'supervisor'. Así no hay que
-- ligarlo a mano en la tabla perfiles.

alter table supervisores add column if not exists correo text unique;

create or replace function public.perfil_para_supervisor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  select cedula, nombre into s from supervisores
  where lower(correo) = lower(new.email) and activo
  limit 1;
  if found then
    insert into perfiles (id, nombre, rol, supervisor_cedula)
    values (new.id, initcap(s.nombre), 'supervisor', s.cedula)
    on conflict (id) do update set rol = 'supervisor', supervisor_cedula = excluded.supervisor_cedula;
  end if;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario_supervisor on auth.users;
create trigger al_crear_usuario_supervisor
  after insert on auth.users
  for each row execute function public.perfil_para_supervisor();
