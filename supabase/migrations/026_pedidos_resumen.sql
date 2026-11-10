-- Resumen por pedido para la pestaña Pedidos: lo pedido, lo fabricado al cierre (líneas
-- principales), lo enlainado (Liner) y lo prensado (Prensa). Sin datos de personas, así que
-- también lo usa Calidad.
-- - El pedido se agrupa por número (sin lote: 9705-1 y 9705-2 son el 9705) y código.
-- - Fabricado: lo reportado al terminar el turno en Panel, Circular, 4 Panel y U-panel, en las
--   referencias anotadas con ese pedido o, si no tienen pedido, con el mismo código dentro de las
--   fechas del pedido (30 días antes de recibirlo a 7 después de la entrega).
-- - Liner y Prensa se anotan por código: cuentan los del mismo código en esas fechas (14 días
--   después de la entrega, porque van después de la costura).
create or replace function pedidos_resumen()
returns table (pedido text, codigo text, cliente text, referencia text, cantidad numeric, recibido date, entrega date,
               fabricado numeric, turnos bigint, en_proceso boolean, primera date, ultima date,
               enlainado numeric, prensado numeric, prensa_pallet numeric, prensa_bulto numeric)
language sql stable security definer set search_path = public as $$
  with lote as (
    -- Un lote puede venir de los dos archivos (base de pedidos y plan): se completa uno con el otro.
    select planeador, split_part(planeador, '-', 1) num, max(codigo) codigo, max(cliente) cliente,
      (array_agg(referencia order by length(coalesce(referencia, '')) desc))[1] referencia,
      coalesce(max(cantidad) filter (where origen = 'bdd'), max(cantidad)) cantidad,
      min(recibido) recibido, max(entrega) entrega
    from pedidos group by planeador
  ), ped as (
    select num, codigo, max(cliente) cliente, (array_agg(referencia order by length(coalesce(referencia, '')) desc))[1] referencia,
      sum(cantidad) cantidad, min(recibido) recibido, max(entrega) entrega
    from lote where num ~ '^[0-9]{3,}$' group by num, codigo
  ), hojas as (
    -- Referencias anotadas con el pedido.
    select p.num, p.codigo, h.unidades_reportadas, t.id turno_id, t.fecha, t.estado
    from bh_hojas h
    join bh_turnos t on t.id = h.turno_id and t.linea in ('PANEL', 'CIRCULAR', '4PANEL', 'UPANEL')
    join ped p on p.codigo = h.codigo and p.num = split_part(h.pedido, '-', 1)
    union all
    -- Sin pedido anotado: van a UN solo pedido de ese código (el de entrega más próxima en esas fechas).
    select q.num, q.codigo, h.unidades_reportadas, t.id, t.fecha, t.estado
    from bh_hojas h
    join bh_turnos t on t.id = h.turno_id and t.linea in ('PANEL', 'CIRCULAR', '4PANEL', 'UPANEL')
    cross join lateral (
      select p.num, p.codigo from ped p
      where p.codigo = h.codigo and (p.recibido is null or t.fecha >= p.recibido - 30) and (p.entrega is null or t.fecha <= p.entrega + 7)
      order by p.entrega nulls last, p.num limit 1) q
    where h.pedido is null
  ), fab as (
    select num, codigo,
      sum(unidades_reportadas) filter (where estado = 'terminado') fabricado,
      count(distinct turno_id) turnos, bool_or(estado = 'abierto') en_proceso, min(fecha) primera, max(fecha) ultima
    from hojas group by num, codigo
  ), pt as (
    -- Cada registro de Liner o Prensa va a UN solo pedido de ese código: primero el que ya se
    -- estaba fabricando para esa fecha y, entre ellos, el de entrega más próxima.
    select q.num, q.codigo,
      sum(x.cantidad) filter (where t.linea = 'LINER') enlainado,
      sum(x.cantidad) filter (where t.linea = 'PRENSA') prensado,
      sum(x.cantidad) filter (where t.linea = 'PRENSA' and x.presentacion = 'pallet') prensa_pallet,
      sum(x.cantidad) filter (where t.linea = 'PRENSA' and x.presentacion = 'bulto') prensa_bulto,
      min(t.fecha) primera, max(t.fecha) ultima
    from bh_pt x
    join bh_turnos t on t.id = x.turno_id
    cross join lateral (
      select p.num, p.codigo from ped p
      left join fab f on f.num = p.num and f.codigo = p.codigo
      where p.codigo = x.codigo and (p.recibido is null or t.fecha >= p.recibido - 30) and (p.entrega is null or t.fecha <= p.entrega + 14)
      order by (f.primera is not null and f.primera <= t.fecha) desc, p.entrega nulls last, p.num limit 1) q
    group by q.num, q.codigo
  )
  select p.num, p.codigo, p.cliente, p.referencia, p.cantidad, p.recibido, p.entrega,
    coalesce(f.fabricado, 0), coalesce(f.turnos, 0), coalesce(f.en_proceso, false),
    least(f.primera, x.primera), greatest(f.ultima, x.ultima),
    coalesce(x.enlainado, 0), coalesce(x.prensado, 0), coalesce(x.prensa_pallet, 0), coalesce(x.prensa_bulto, 0)
  from ped p
  left join fab f on f.num = p.num and f.codigo = p.codigo
  left join pt x on x.num = p.num and x.codigo = p.codigo
  where f.num is not null or x.num is not null
$$;
revoke all on function pedidos_resumen() from public, anon;
grant execute on function pedidos_resumen() to authenticated;
