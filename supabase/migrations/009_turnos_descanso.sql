-- Turnos de 12 horas (4 y 5): una hora de almuerzo que no se trabaja.
-- descanso = hora del reloj en que termina esa hora (13 = de 12 a 1).
alter table turnos_def add column if not exists descanso smallint check (descanso between 0 and 23);
update turnos_def set descanso = 13 where codigo = '4';
update turnos_def set descanso = 1 where codigo = '5';

-- Mi Marcador recibe la hora de descanso para no mostrar esa casilla.
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
    'diario', coalesce((select jsonb_agg(jsonb_build_object('f', fecha, 'op', operacion, 'ef', round(eficiencia, 4), 'prod', round(prod_real / nullif(horas, 0), 1), 'real', prod_real, 'meta', meta, 'horas', horas) order by fecha desc, id)
                  from mm_historico where cedula = c and fecha >= (mes - interval '1 month')), '[]'::jsonb),
    'ranking', (select jsonb_build_object('pos', pos, 'total', (select count(*) from mm_ranking_costura(mes)))
                from mm_ranking_costura(mes) where cedula = c),
    'hoy', case when t.id is null then null else jsonb_build_object(
      'fecha', t.fecha, 'turno', t.turno, 'linea', t.linea, 'estado', t.estado, 'meta_turno', t.meta_turno,
      'reportadas', (select sum(unidades_reportadas) from bh_hojas where turno_id = t.id),
      'def', (select jsonb_build_object('inicio', inicio, 'fin', fin, 'inicio_domingo', inicio_domingo, 'descanso', descanso) from turnos_def where codigo = t.turno),
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
