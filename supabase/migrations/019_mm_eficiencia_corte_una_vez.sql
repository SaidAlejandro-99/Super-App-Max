-- La fecha de corte se calcula una sola vez por consulta (no fila por fila).
create or replace view mm_eficiencia with (security_invoker = true) as
select h.id, h.cedula, h.fecha, h.linea, coalesce(n.nombre, h.operacion) operacion, h.tipo, h.meta, h.horas, h.prod_real, h.eficiencia, h.origen
from mm_historico h
left join (values ('PREP F', 'Preparación fondo'), ('PREP T', 'Preparación tapa'), ('PEGUE FONDO', 'Pegue fondo'),
  ('PEGUE TAPA', 'Pegue tapa'), ('PEGUE REATA', 'Pegue reata'), ('CIERRE', 'Cierre'), ('BAFLE', 'Pegue bafles'),
  ('DD5', 'Costura DD5'), ('PEGUE SOL', 'Pegue solapa'), ('PREP SOLAPA', 'Preparación solapa'), ('PREP REATA', 'Preparación reata'),
  ('PRE UP', 'Preparación upanel'), ('PEGUE CIN', 'Pegue cintilla'), ('CAPUCHON', 'Capuchón'), ('PAÑUELO', 'Pegue pañuelo'),
  ('SOPLADO', 'Soplado'), ('REBORDE', 'Reborde'), ('PETALO', 'Pegue pétalos'), ('PREP BASE', 'Preparación base'),
  ('REVISION', 'Revisión')) n(excel, nombre) on n.excel = upper(h.operacion)
where h.fecha <= (select mm_corte_excel())
union all
select * from mm_bihorario where fecha > (select mm_corte_excel());

revoke all on mm_eficiencia from anon, authenticated;
