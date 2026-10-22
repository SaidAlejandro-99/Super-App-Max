-- Módulo 3: Mi Marcador (tarjeta del operario). Ver docs/MI_MARCADOR.md.

-- Nivel del operario (1, 2 o 3). Solo el admin lo cambia.
alter table operarios add column if not exists nivel smallint not null default 1 check (nivel between 1 and 3);

create or replace function nivel_solo_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sin usuario (auth.uid() nulo) es una carga directa desde la base de datos.
  if new.nivel is distinct from old.nivel and auth.uid() is not null and not es_admin() then
    raise exception 'Solo el administrador cambia el nivel';
  end if;
  return new;
end;
$$;
drop trigger if exists operarios_nivel_admin on operarios;
create trigger operarios_nivel_admin before update on operarios
  for each row execute function nivel_solo_admin();

-- Histórico de eficiencia: una fila por operario, día y operación.
-- Hoy se carga desde el Excel de bi-horarios (origen 'excel'); las ausencias no entran.
create table if not exists mm_historico (
  id bigint generated always as identity primary key,
  cedula text not null,
  fecha date not null,
  linea text not null default '',
  operacion text not null default '',
  tipo text not null default '',          -- COSTURA | MANUAL
  meta numeric,
  horas numeric,
  prod_real numeric,
  eficiencia numeric not null,
  origen text not null default 'excel'
);
create index if not exists mm_historico_cedula_idx on mm_historico (cedula, fecha);
create index if not exists mm_historico_fecha_idx on mm_historico (fecha);

alter table mm_historico enable row level security;
create policy "lectura staff" on mm_historico for select using (es_staff());
create policy "escritura admin" on mm_historico for all using (es_admin()) with check (es_admin());

-- Fecha de hoy en Barranquilla.
create or replace function mm_hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date $$;

-- Ranking de costura del mes: promedio de eficiencia en operaciones de costura,
-- solo operarios activos con 5 registros o más en el mes.
create or replace function mm_ranking_costura(p_mes date)
returns table (cedula text, nombre text, linea text, ef numeric, n bigint, pos bigint)
language sql stable security definer set search_path = public as $$
  select h.cedula, o.nombre, o.linea, avg(h.eficiencia) as ef, count(*) as n,
         row_number() over (order by avg(h.eficiencia) desc, count(*) desc) as pos
  from mm_historico h join operarios o on o.cedula = h.cedula and o.activo
  where h.tipo = 'COSTURA' and h.fecha >= p_mes and h.fecha < p_mes + interval '1 month'
  group by h.cedula, o.nombre, o.linea
  having count(*) >= 5
$$;
revoke all on function mm_ranking_costura(date) from public, anon, authenticated;

-- Mes "en curso": el del último dato cargado.
create or replace function mm_mes_actual() returns date
language sql stable security definer set search_path = public as $$
  select coalesce(date_trunc('month', max(fecha))::date, date_trunc('month', mm_hoy())::date) from mm_historico
$$;

-- Portada pública: frase, destacado y Top 10 de costura. Sin cédulas.
create or replace function mm_portada() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'frase', (select valor from config where clave = 'mm_frase'),
    'destacado', (select valor from config where clave = 'mm_destacado'),
    'mes', mm_mes_actual(),
    'top', coalesce((select jsonb_agg(jsonb_build_object('pos', pos, 'nombre', nombre, 'linea', linea, 'ef', round(ef, 4)) order by pos)
                     from mm_ranking_costura(mm_mes_actual()) where pos <= 10), '[]'::jsonb)
  )
$$;

-- Tarjeta de un operario por su cédula exacta. Devuelve null si no existe o
-- está retirado. No devuelve la cédula ni datos de otras personas.
create or replace function mm_tarjeta(p_cedula text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  o record; mes date := mm_mes_actual(); hoy date := mm_hoy(); t record; res jsonb;
begin
  if c = '' then return null; end if;
  select * into o from operarios where cedula = c and activo;
  if not found then return null; end if;

  select * into t from bh_turnos bt
  where bt.fecha >= hoy - 1 and (bt.fecha = hoy or bt.estado = 'abierto')
    and exists (select 1 from bh_asignaciones a where a.turno_id = bt.id and a.cedula = c)
  order by bt.fecha desc, bt.created_at desc limit 1;

  res := jsonb_build_object(
    'nombre', o.nombre, 'linea', o.linea, 'rol', o.rol, 'nivel', o.nivel, 'mes', mes,
    'global', (select jsonb_build_object('ef', round(avg(eficiencia), 4), 'dias', count(distinct fecha), 'desde', min(fecha))
               from mm_historico where cedula = c),
    'historico', coalesce((select jsonb_agg(jsonb_build_object('mes', m, 'ef', round(ef, 4), 'n', n) order by m)
                  from (select date_trunc('month', fecha)::date m, avg(eficiencia) ef, count(*) n
                        from mm_historico where cedula = c group by 1) x), '[]'::jsonb),
    'operaciones', coalesce((select jsonb_agg(jsonb_build_object('op', operacion, 'tipo', tipo, 'n', n, 'ef', round(ef, 4)) order by n desc)
                  from (select operacion, tipo, count(*) n, avg(eficiencia) ef
                        from mm_historico where cedula = c group by 1, 2) x), '[]'::jsonb),
    'diario', coalesce((select jsonb_agg(jsonb_build_object('f', fecha, 'op', operacion, 'ef', round(eficiencia, 4), 'prod', round(prod_real / nullif(horas, 0), 1)) order by fecha desc, id)
                  from mm_historico where cedula = c and fecha >= (mes - interval '1 month')), '[]'::jsonb),
    'ranking', (select jsonb_build_object('pos', pos, 'total', (select count(*) from mm_ranking_costura(mes)))
                from mm_ranking_costura(mes) where cedula = c),
    'hoy', case when t.id is null then null else jsonb_build_object(
      'fecha', t.fecha, 'turno', t.turno, 'linea', t.linea, 'estado', t.estado, 'meta_turno', t.meta_turno,
      'reportadas', (select sum(unidades_reportadas) from bh_hojas where turno_id = t.id),
      'def', (select jsonb_build_object('inicio', inicio, 'fin', fin, 'inicio_domingo', inicio_domingo) from turnos_def where codigo = t.turno),
      'asig', (select jsonb_agg(jsonb_build_object(
          'operacion', b.operacion, 'meta_hora', b.meta_hora, 'meta_origen', b.meta_origen, 'factor', a.factor, 'codigo', h.codigo,
          'regs', coalesce((select jsonb_agg(jsonb_build_object('hora', r.hora, 'unidades', r.unidades, 'tm_causa', r.tm_causa,
                    'tm_minutos', r.tm_minutos, 'tm_tipo', ca.tipo, 'tm_txt', coalesce(nullif(ca.corta, ''), ca.descripcion), 'at', r.updated_at) order by r.hora)
                  from bh_registros r left join causas_tm ca on ca.codigo = r.tm_causa where r.asignacion_id = a.id), '[]'::jsonb)
        ) order by h.orden, b.orden)
        from bh_asignaciones a join bh_bloques b on b.id = a.bloque_id join bh_hojas h on h.id = b.hoja_id
        where a.turno_id = t.id and a.cedula = c)
    ) end
  );
  return res;
end;
$$;

revoke all on function mm_portada() from public;
revoke all on function mm_tarjeta(text) from public;
grant execute on function mm_portada() to anon, authenticated;
grant execute on function mm_tarjeta(text) to anon, authenticated;

-- Textos iniciales.
insert into config (clave, valor) values
  ('mm_frase', '"Puntada a puntada se arma un súper saco; día a día se arma un campeón."'),
  ('mm_destacado', '{"nombre": "", "motivo": "Operario del trimestre", "foto": ""}')
on conflict (clave) do nothing;
