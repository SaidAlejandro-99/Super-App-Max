-- Métodos y Tiempos: actualizar tiempos estándar con la producción por hora del Bi-horario.
-- Ver docs/BIHORARIO.md ("Tiempos desde el Bi-horario").

-- De dónde salió cada tiempo (por ejemplo, "Bi-horario: mediana de 34 h…").
alter table tiempos add column if not exists fuente text;

create or replace function guardar_tiempos(p_codigo text, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Si el código solo existe en el plan, se crea en codigos.
  insert into codigos (codigo, cliente, descripcion, linea)
  select pl.codigo, pl.cliente, pl.descripcion, pl.linea
  from planning pl where pl.codigo = p_codigo
  on conflict (codigo) do nothing;
  insert into codigos (codigo) values (p_codigo) on conflict (codigo) do nothing;

  delete from tiempos where codigo = p_codigo;

  insert into tiempos (codigo, operacion, min, obs, val, supl, muestras, orden, tomado_at, fuente, updated_at, updated_by)
  select p_codigo,
         r->>'op',
         nullif(r->>'min', '')::numeric,
         nullif(r->>'obs', '')::numeric,
         nullif(r->>'val', '')::numeric,
         nullif(r->>'supl', '')::numeric,
         coalesce(r->'muestras', '[]'::jsonb),
         (ord - 1)::int,
         nullif(r->>'ts', '')::timestamptz,
         nullif(r->>'fuente', ''),
         now(),
         auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);

  update codigos set tiempos_updated_at = now(), updated_at = now() where codigo = p_codigo;
end;
$$;

-- Producción por hora observada en el Bi-horario, por código y operación.
-- Solo "horas limpias": con unidades, sin tiempo muerto ni llegada tarde, la persona
-- en una sola operación esa hora, sin ajuste de polivalencia (factor 1) y con meta
-- por hora (no la del turno). Así la hora completa fue de esa operación a ritmo normal.
create or replace function mt_desde_bihorario(p_desde date, p_hasta date)
returns table (codigo text, operacion text, horas int, personas int, turnos int,
               mediana numeric, p25 numeric, p75 numeric, promedio numeric, primera date, ultima date)
language sql stable security invoker set search_path = public as $$
  with r as (
    select h.codigo, b.operacion, a.cedula, g.turno_id, g.unidades, g.tm_causa, a.factor, b.meta_origen, t.fecha,
      count(*) over (partition by g.turno_id, a.cedula, g.hora) as en_la_hora
    from bh_registros g
    join bh_asignaciones a on a.id = g.asignacion_id
    join bh_bloques b on b.id = a.bloque_id
    join bh_hojas h on h.id = b.hoja_id
    join bh_turnos t on t.id = g.turno_id
    where t.fecha between p_desde and p_hasta and (g.unidades is not null or g.tm_causa is not null)
  )
  select codigo, operacion, count(*)::int, count(distinct cedula)::int, count(distinct turno_id)::int,
    percentile_cont(0.5) within group (order by unidades)::numeric,
    percentile_cont(0.25) within group (order by unidades)::numeric,
    percentile_cont(0.75) within group (order by unidades)::numeric,
    avg(unidades), min(fecha), max(fecha)
  from r
  where en_la_hora = 1 and tm_causa is null and unidades > 0 and coalesce(factor, 1) = 1 and meta_origen <> 'turno'
  group by codigo, operacion
$$;
