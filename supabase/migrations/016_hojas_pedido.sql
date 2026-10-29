-- Cada referencia del Bi-horario guarda el pedido con que se agregó ("8868-1").
-- Sirve para ver todo lo fabricado de un pedido (Bi-horario → Pedidos).
alter table bh_hojas add column if not exists pedido text;
create index if not exists bh_hojas_pedido_idx on bh_hojas(pedido);
