-- Mi Marcador también cuenta a quienes no se anotan hora a hora:
-- - al cierre (patinador, soplado, perforación de bafles): fabricado del turno ÷ meta del turno;
-- - promedio (pie de máquina, líder de manguita): eficiencia del DD5 o de manguita en ese turno.
-- La revisión en pareja ya entra sola: cada persona lleva la cantidad de la pareja.
create or replace view mm_bihorario with (security_invoker = true) as
with reg as (
  select g.turno_id, g.hora, g.unidades, a.cedula, t.fecha, t.linea, b.operacion, b.area,
    case when b.meta_origen not in ('turno', 'promedio') then nullif(b.meta_hora * coalesce(a.factor, 1), 0) end meta_ef,
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
), normal as (
  select d.cedula, d.fecha, d.linea, d.operacion, round(d.meta, 1) meta, round(d.horas, 2) horas, d.prod_real, d.ganadas / d.horas ef
  from dia d where d.horas > 0
),
-- Eficiencia de cada grupo por turno (DD5 y manguita).
grupo as (
  select turno_id, case when area = 'manguita' then 'manguita' else operacion end ref,
    sum(coalesce(unidades, 0) / meta_ef) / nullif(sum(min_disp) / 60.0, 0) ef
  from rep where meta_ef is not null and (operacion = 'DD5' or area = 'manguita')
  group by 1, 2
),
-- Horas de trabajo del turno (sin la hora de almuerzo de los turnos de 12 h).
horas_turno as (
  select codigo, (extract(epoch from (fin::time - inicio::time)) / 3600 + 24)::numeric % 24
    - case when descanso is not null then 1 else 0 end h
  from turnos_def
),
especial as (
  select a.cedula, t.fecha, t.linea, b.operacion,
    case when b.meta_origen = 'turno' then t.meta_turno end meta,
    ht.h horas,
    case when b.meta_origen = 'turno' then
           case when t.estado = 'terminado' and t.meta_turno > 0
                then (select sum(h.unidades_reportadas) from bh_hojas h where h.turno_id = t.id) / t.meta_turno end
         else (select g.ef from grupo g where g.turno_id = t.id and g.ref = b.ref) end ef
  from bh_asignaciones a
  join bh_bloques b on b.id = a.bloque_id
  join bh_turnos t on t.id = a.turno_id
  left join horas_turno ht on ht.codigo = t.turno
  where b.meta_origen in ('turno', 'promedio')
), especial_dia as (
  select cedula, fecha, min(linea) linea, operacion, max(meta) meta, sum(horas) horas, null::numeric prod_real, avg(ef) ef
  from especial where ef is not null
  group by cedula, fecha, operacion
)
select null::bigint id, x.cedula, x.fecha, x.linea, x.operacion, upper(coalesce(o.tipo, '')) tipo,
  x.meta, x.horas, x.prod_real, round(x.ef, 4) eficiencia, 'bihorario'::text origen
from (select * from normal union all select * from especial_dia) x
left join operaciones o on o.nombre = x.operacion
where x.ef <= 2;

revoke all on mm_bihorario from anon, authenticated;
