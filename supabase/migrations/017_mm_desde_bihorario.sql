-- Mi Marcador se llena solo con el Bi-horario. El histórico del Excel vale hasta la
-- fecha de corte (config 'mm_corte_excel'); de ahí en adelante, solo el Bi-horario.

-- Fecha de corte: la de config o, si no está, el último día cargado del Excel.
create or replace function mm_corte_excel() returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::date from config where clave = 'mm_corte_excel'),
                  (select max(fecha) from mm_historico where origen = 'excel'))
$$;

insert into config (clave, valor) values ('mm_corte_excel', '"2026-10-20"')
on conflict (clave) do nothing;

-- Eficiencia diaria desde el Bi-horario: una fila por persona, día y operación,
-- con el mismo criterio de la hoja (minutos ganados ÷ minutos disponibles, la hora
-- repartida entre operaciones según lo ganado en cada una). Entra el turno en curso.
-- Fuera: metas por turno (Prensa y Liner), filas sin horas y filas de más de 200 %
-- (casi siempre una meta mal digitada).
create or replace view mm_bihorario with (security_invoker = true) as
with reg as (
  select g.turno_id, g.hora, g.unidades, a.cedula, t.fecha, t.linea, b.operacion,
    case when b.meta_origen <> 'turno' then nullif(b.meta_hora * coalesce(a.factor, 1), 0) end meta_ef,
    case when g.tm_causa is not null and c.tipo <> 'tardanza' then coalesce(g.tm_minutos, 0) else 0 end tm
  from bh_registros g
  join bh_asignaciones a on a.id = g.asignacion_id
  join bh_bloques b on b.id = a.bloque_id
  join bh_turnos t on t.id = g.turno_id
  left join causas_tm c on c.codigo = g.tm_causa
  where g.unidades is not null or g.tm_causa is not null
), rep as (
  select r.*, (60 - max(r.tm) over w)
    * case when count(*) over w = 1 then 1
           when bool_and(r.meta_ef is not null) over w and sum(coalesce(r.unidades, 0) / r.meta_ef) over w > 0
             then (coalesce(r.unidades, 0) / r.meta_ef) / sum(coalesce(r.unidades, 0) / r.meta_ef) over w
           else 1.0 / count(*) over w end as min_disp
  from reg r window w as (partition by r.turno_id, r.cedula, r.hora)
), dia as (
  select cedula, fecha, operacion, min(linea) linea,
    sum(min_disp) / 60.0 horas, sum(coalesce(unidades, 0)) prod_real,
    sum(coalesce(unidades, 0) / meta_ef) ganadas,
    sum(meta_ef * min_disp) / nullif(sum(min_disp), 0) meta
  from rep where meta_ef is not null
  group by 1, 2, 3
)
select null::bigint id, d.cedula, d.fecha, d.linea, d.operacion, upper(coalesce(o.tipo, '')) tipo,
  round(d.meta, 1) meta, round(d.horas, 2) horas, d.prod_real, round(d.ganadas / d.horas, 4) eficiencia,
  'bihorario'::text origen
from dia d left join operaciones o on o.nombre = d.operacion
where d.horas > 0 and d.ganadas / d.horas <= 2;

-- Lo que lee Mi Marcador: Excel hasta el corte y Bi-horario después.
-- Los nombres abreviados del Excel se pasan a los del Bi-horario cuando la equivalencia es clara.
create or replace view mm_eficiencia with (security_invoker = true) as
select h.id, h.cedula, h.fecha, h.linea, coalesce(n.nombre, h.operacion) operacion, h.tipo, h.meta, h.horas, h.prod_real, h.eficiencia, h.origen
from mm_historico h
left join (values ('PREP F', 'Preparación fondo'), ('PREP T', 'Preparación tapa'), ('PEGUE FONDO', 'Pegue fondo'),
  ('PEGUE TAPA', 'Pegue tapa'), ('PEGUE REATA', 'Pegue reata'), ('CIERRE', 'Cierre'), ('BAFLE', 'Pegue bafles'),
  ('DD5', 'Costura DD5'), ('PEGUE SOL', 'Pegue solapa'), ('PREP SOLAPA', 'Preparación solapa'), ('PREP REATA', 'Preparación reata'),
  ('PRE UP', 'Preparación upanel'), ('PEGUE CIN', 'Pegue cintilla'), ('CAPUCHON', 'Capuchón'), ('PAÑUELO', 'Pegue pañuelo'),
  ('SOPLADO', 'Soplado'), ('REBORDE', 'Reborde'), ('PETALO', 'Pegue pétalos'), ('PREP BASE', 'Preparación base'),
  ('REVISION', 'Revisión')) n(excel, nombre) on n.excel = upper(h.operacion)
where h.fecha <= mm_corte_excel()
union all
select * from mm_bihorario where fecha > mm_corte_excel();

-- Las vistas solo se leen desde las funciones de Mi Marcador.
revoke all on mm_bihorario, mm_eficiencia from anon, authenticated;
