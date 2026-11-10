-- En Circular el pegue de reata se hace en la máquina DD5 y se llama "DD5".
-- 4 Panel y U-panel siguen con "Pegue reata" (se hace en otra máquina).
-- La operación "Costura DD5" pasa a llamarse "DD5".

insert into operaciones (nombre, familia, tipo, updated_at)
select 'DD5', familia, tipo, now() from operaciones where nombre = 'Costura DD5'
on conflict (nombre) do nothing;

update tiempos set operacion = 'DD5', updated_at = now()
where operacion = 'Costura DD5'
   or (operacion = 'Pegue reata' and codigo in (select codigo from codigos where linea = 'CIR'));

-- Bi-horario: mismo nombre en los turnos ya registrados (la meta no cambia).
update bh_bloques set operacion = 'DD5' where operacion = 'Costura DD5';
update bh_bloques b set operacion = 'DD5'
from bh_hojas h join codigos c on c.codigo = h.codigo
where h.id = b.hoja_id and c.linea = 'CIR' and b.operacion = 'Pegue reata';

delete from operaciones where nombre = 'Costura DD5';

-- Mi Marcador: el "DD5" del Excel ya se llama igual.
create or replace view mm_eficiencia with (security_invoker = true) as
select h.id, h.cedula, h.fecha, h.linea, coalesce(n.nombre, h.operacion) operacion, h.tipo, h.meta, h.horas, h.prod_real, h.eficiencia, h.origen
from mm_historico h
left join (values ('PREP F', 'Preparación fondo'), ('PREP T', 'Preparación tapa'), ('PEGUE FONDO', 'Pegue fondo'),
  ('PEGUE TAPA', 'Pegue tapa'), ('PEGUE REATA', 'Pegue reata'), ('CIERRE', 'Cierre'), ('BAFLE', 'Pegue bafles'),
  ('PEGUE SOL', 'Pegue solapa'), ('PREP SOLAPA', 'Preparación solapa'), ('PREP REATA', 'Preparación reata'),
  ('PRE UP', 'Preparación upanel'), ('PEGUE CIN', 'Pegue cintilla'), ('CAPUCHON', 'Capuchón'), ('PAÑUELO', 'Pegue pañuelo'),
  ('SOPLADO', 'Soplado'), ('REBORDE', 'Reborde'), ('PETALO', 'Pegue pétalos'), ('PREP BASE', 'Preparación base'),
  ('REVISION', 'Revisión')) n(excel, nombre) on n.excel = upper(h.operacion)
where h.fecha <= (select mm_corte_excel())
union all
select * from mm_bihorario where fecha > (select mm_corte_excel());

revoke all on mm_eficiencia from anon, authenticated;
