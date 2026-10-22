-- NUNCA EN PRODUCCIÓN: borra todas las personas, invitaciones y movimientos.
--
-- Escenario de demo para qa. Se puede correr las veces que haga falta:
-- borra todo lo operativo y lo vuelve a cargar con fechas relativas a "ahora"
-- en hora de Buenos Aires. Conserva el barrio (nombre, logo, color, dirección)
-- El admin se crea aparte con crear-admin-cli. Las cuentas de demo entran con "pass123" (vecinos por
-- mail, guardias por usuario: ramon, julio).
--
-- Carga también los rubros de proveedores, las franjas horarias de Alamo Alto
-- y los rubros que piden seguro (con proveedores vencido, por vencer y sin seguro).
--
-- Correrlo a la mañana de la demo: los horarios de "adentro" salen de now().

begin;

-- ---------- Limpieza (todo menos el barrio) ----------
delete from audit_log;
delete from entry_log;
delete from invitation;
delete from trade;
delete from unit_member;
delete from session;
delete from auth_token;
delete from unit;
delete from person;

do $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  nid uuid := (select id from neighborhood limit 1);
  hoy date := (now() at time zone tz)::date;
  ahora timestamptz := now();

  l12 uuid; l27 uuid; l34 uuid; l48 uuid; l55 uuid; l63 uuid; l71 uuid; l89 uuid;
  laura uuid; martin uuid; sofia uuid; diego uuid; carolina uuid; pablo uuid;
  ramon uuid; julio uuid;
  inv uuid; d int; i int; n int; dia date; entra timestamptz; g uuid;
  u uuid; autor uuid; tipo text; idx int;

  nombres text[] := array['Agustina López','Bruno Castro','Carla Molina','Damián Rojas','Elena Vega',
    'Facundo Silva','Gabriela Ortiz','Hernán Suárez','Inés Morales','Javier Romero','Karina Navarro',
    'Leandro Ríos','Micaela Herrera','Nahuel Medina','Paula Cabrera','Ramiro Aguirre','Tamara Ibáñez',
    'Ulises Correa','Victoria Luna','Walter Domínguez'];
  proveedores text[] := array['Técnico de internet','Flete mudanza','Pileta — mantenimiento',
    'Electricista','Fumigación','Delivery supermercado'];
  rubros text[] := array[null,'Flete','Piletero','Electricista',null,null]; -- uno por cada proveedor de arriba
  lotes uuid[]; autores uuid[];
begin
  perform setseed(0.42);

  -- Rubros y franjas de proveedores (L-V todo el año, sábado solo Piletero y Agua)
  insert into trade (neighborhood_id, name)
  select nid, t from unnest(array['Jardinero','Piletero','Electricista','Plomero','Carpintero','Albañil',
    'Corralón','Gasista','Techista','Agua','Flete']) t;
  -- Piden seguro vigente: Albañil, Gasista, Electricista y Techista; aviso a 15 días.
  update trade set requires_insurance = true where name in ('Albañil','Gasista','Electricista','Techista');
  update neighborhood set insurance_warn_days = 15 where id = nid;
  update neighborhood set provider_windows = jsonb_build_array(
    jsonb_build_object('days', jsonb_build_array(1,2,3,4,5), 'from', '08:00', 'to', '17:00',
      'season', jsonb_build_object('from', '04-01', 'to', '10-31'), 'trades', null),
    jsonb_build_object('days', jsonb_build_array(1,2,3,4,5), 'from', '08:00', 'to', '18:00',
      'season', jsonb_build_object('from', '11-01', 'to', '03-31'), 'trades', null),
    jsonb_build_object('days', jsonb_build_array(6), 'from', '08:00', 'to', '13:00', 'season', null,
      'trades', jsonb_build_array((select id from trade where name = 'Piletero'),
                                  (select id from trade where name = 'Agua'))))
  where id = nid;

  -- Lotes
  insert into unit (neighborhood_id, label) values (nid, 'Lote 12') returning id into l12;
  insert into unit (neighborhood_id, label) values (nid, 'Lote 27') returning id into l27;
  insert into unit (neighborhood_id, label) values (nid, 'Lote 34') returning id into l34;
  insert into unit (neighborhood_id, label) values (nid, 'Lote 48') returning id into l48;
  insert into unit (neighborhood_id, label) values (nid, 'Lote 55') returning id into l55;
  insert into unit (neighborhood_id, label) values (nid, 'Lote 63') returning id into l63;
  insert into unit (neighborhood_id, label) values (nid, 'Lote 71') returning id into l71;
  insert into unit (neighborhood_id, label) values (nid, 'Lote 89') returning id into l89;

  -- Vecinos (sin contraseña: se activan con "Copiar link de alta")
  insert into person (neighborhood_id, email, name, role, status) values
    (nid, 'laura.fernandez@example.com', 'Laura Fernández', 'resident', 'invited') returning id into laura;
  insert into person (neighborhood_id, email, name, role, status) values
    (nid, 'martin.ruiz@example.com', 'Martín Ruiz', 'resident', 'invited') returning id into martin;
  insert into person (neighborhood_id, email, name, role, status) values
    (nid, 'sofia.acosta@example.com', 'Sofía Acosta', 'resident', 'invited') returning id into sofia;
  insert into person (neighborhood_id, email, name, role, status) values
    (nid, 'diego.acosta@example.com', 'Diego Acosta', 'resident', 'invited') returning id into diego;
  insert into person (neighborhood_id, email, name, role, status) values
    (nid, 'carolina.mendez@example.com', 'Carolina Méndez', 'resident', 'invited') returning id into carolina;
  insert into person (neighborhood_id, email, name, role, status) values
    (nid, 'pablo.gimenez@example.com', 'Pablo Giménez', 'resident', 'invited') returning id into pablo;

  insert into unit_member (unit_id, person_id) values
    (l12, laura), (l27, martin), (l34, sofia), (l34, diego), (l48, carolina), (l55, pablo);

  -- Guardias (con usuario: la contraseña se pone desde Administración → Guardias)
  insert into person (neighborhood_id, username, name, role, status) values
    (nid, 'ramon', 'Ramón Sosa', 'guard', 'invited') returning id into ramon;
  insert into person (neighborhood_id, username, name, role, status) values
    (nid, 'julio', 'Julio Benítez', 'guard', 'invited') returning id into julio;

  lotes := array[l12, l27, l34, l48, l55];
  autores := array[laura, martin, sofia, carolina, pablo];

  -- ---------- Historia: las últimas dos semanas ----------
  for d in 1..14 loop
    dia := hoy - d;
    n := 3 + floor(random() * 5)::int;
    for i in 1..n loop
      u := lotes[1 + floor(random() * 5)::int];
      autor := (select person_id from unit_member where unit_id = u limit 1);
      tipo := case when random() < 0.25 then 'proveedor' else 'visita' end;
      idx := 1 + floor(random() * 6)::int;
      entra := (dia + time '09:00' + (floor(random() * 11 * 60)::int || ' minutes')::interval) at time zone tz;
      g := case when extract(hour from entra at time zone tz) < 15 then ramon else julio end;

      insert into invitation (unit_id, created_by, kind, guest_name, guest_doc, plate,
        valid_from, valid_to, capacity, token, created_at, trade_id)
      values (u, autor, tipo,
        case when tipo = 'proveedor' then proveedores[idx]
             else nombres[1 + floor(random() * 20)::int] end,
        to_char(20000000 + floor(random() * 25000000)::int, 'FM99G999G999'),
        case when random() < 0.5 then 'A' || chr(65 + floor(random() * 26)::int) || ' '
          || lpad(floor(random() * 1000)::int::text, 3, '0') || ' ' || chr(65 + floor(random() * 26)::int)
          || chr(65 + floor(random() * 26)::int) end,
        dia, dia, 1, md5(random()::text), entra - interval '1 day',
        case when tipo = 'proveedor' then (select id from trade where name = rubros[idx]) end)
      returning id into inv;

      insert into entry_log (invitation_id, unit_id, guard_id, entered_at, exited_at, exit_guard_id,
        guest_name, guest_doc, plate)
      select inv, i2.unit_id, g, entra, entra + ((40 + floor(random() * 200)::int) || ' minutes')::interval,
        g, i2.guest_name, i2.guest_doc, i2.plate
      from invitation i2 where i2.id = inv;
    end loop;
  end loop;

  -- ---------- Hoy ----------
  -- La empleada de los Acosta: frecuente, lunes a viernes, adentro desde hace 3 horas.
  insert into invitation (unit_id, created_by, kind, frequent_as, guest_name, guest_doc,
    valid_from, valid_to, weekdays, capacity, token, created_at)
  values (l34, sofia, 'frecuente', 'visita', 'Rosa Benítez', '28.111.222',
    hoy - 20, hoy + 10, null, 999, md5(random()::text), ahora - interval '20 days')
  returning id into inv;
  for d in 1..14 loop
    dia := hoy - d;
    if extract(isodow from dia) < 6 then
      insert into entry_log (invitation_id, unit_id, guard_id, entered_at, exited_at, exit_guard_id, guest_name, guest_doc)
      values (inv, l34, ramon, (dia + time '08:30') at time zone tz, (dia + time '17:05') at time zone tz, julio,
        'Rosa Benítez', '28.111.222');
    end if;
  end loop;
  insert into entry_log (invitation_id, unit_id, guard_id, entered_at, guest_name, guest_doc)
  values (inv, l34, ramon, ahora - interval '3 hours', 'Rosa Benítez', '28.111.222');

  -- El plomero de los Méndez: proveedor de hoy, con nota, adentro hace una hora.
  insert into invitation (unit_id, created_by, kind, guest_name, guest_doc, plate,
    valid_from, valid_to, capacity, token, note, created_at, trade_id)
  values (l48, carolina, 'proveedor', 'Hugo Ríos', '25.987.654', 'AE 482 KL',
    hoy, hoy, 1, md5(random()::text), 'Es el plomero, va directo al lote 48. Pérdida en la cocina.',
    ahora - interval '1 day', (select id from trade where name = 'Plomero'))
  returning id into inv;
  insert into entry_log (invitation_id, unit_id, guard_id, entered_at, guest_name, guest_doc, plate)
  values (inv, l48, ramon, ahora - interval '1 hour', 'Hugo Ríos', '25.987.654', 'AE 482 KL');

  -- El jardinero de los Fernández: frecuente de proveedor lun/mié/sáb. El sábado
  -- choca con su horario (los sábados solo entran Piletero y Agua).
  insert into invitation (unit_id, created_by, kind, frequent_as, guest_name, guest_doc,
    valid_from, valid_to, weekdays, capacity, token, created_at, trade_id)
  values (l12, laura, 'frecuente', 'proveedor', 'Ariel Gómez', '30.555.666',
    hoy - 10, hoy + 60, '{1,3,6}', 999, md5(random()::text), ahora - interval '10 days',
    (select id from trade where name = 'Jardinero'));

  -- Seguros: albañil con la póliza vencida hace 9 días (la barrera lo rechaza),
  -- gasista frecuente que vence en 5 días (cae en el aviso de 15) y electricista sin seguro.
  insert into invitation (unit_id, created_by, kind, guest_name, guest_doc, plate,
    valid_from, valid_to, capacity, token, created_at, trade_id,
    insurance_company, insurance_policy, insurance_expires_on)
  values (l27, martin, 'proveedor', 'Ramiro Peralta', '27.345.901', 'AD 301 MN',
    hoy, hoy, 1, md5(random()::text), ahora - interval '1 day', (select id from trade where name = 'Albañil'),
    'La Segunda', 'AP-4471823', hoy - 9);
  insert into invitation (unit_id, created_by, kind, frequent_as, guest_name, guest_doc,
    valid_from, valid_to, weekdays, capacity, token, created_at, trade_id,
    insurance_company, insurance_policy, insurance_expires_on)
  values (l34, sofia, 'frecuente', 'proveedor', 'Osvaldo Benavídez', '22.870.134',
    hoy - 30, hoy + 60, null, 999, md5(random()::text), ahora - interval '30 days',
    (select id from trade where name = 'Gasista'),
    'Sancor Seguros', '0082-559310', hoy + 5);
  insert into invitation (unit_id, created_by, kind, guest_name, guest_doc,
    valid_from, valid_to, capacity, token, created_at, trade_id)
  values (l55, pablo, 'proveedor', 'Gustavo Lescano', '29.654.312',
    hoy, hoy, 1, md5(random()::text), ahora - interval '1 day', (select id from trade where name = 'Electricista'));

  -- Visita de ayer que nunca registró la salida: la garita la marca en amarillo.
  insert into invitation (unit_id, created_by, kind, guest_name, guest_doc, plate,
    valid_from, valid_to, capacity, token, created_at)
  values (l27, martin, 'visita', 'Tomás Álvarez', '35.444.120', 'AC 915 PR',
    hoy - 1, hoy - 1, 1, md5(random()::text), ahora - interval '2 days')
  returning id into inv;
  insert into entry_log (invitation_id, unit_id, guard_id, entered_at, guest_name, guest_doc, plate)
  values (inv, l27, julio, ahora - interval '9 hours', 'Tomás Álvarez', '35.444.120', 'AC 915 PR');

  -- Por llegar: visita con nota (la estrella de la demo).
  insert into invitation (unit_id, created_by, kind, guest_name, guest_doc, plate,
    valid_from, valid_to, capacity, token, note, created_at)
  values (l12, laura, 'visita', 'Federico Paz', '32.456.789', 'AB 123 CD',
    hoy, hoy, 1, md5(random()::text), 'Viene en un Gol rojo. Trae una torta, dejalo pasar con el auto.',
    ahora - interval '5 hours');

  insert into invitation (unit_id, created_by, kind, guest_name, valid_from, valid_to, capacity, token, created_at)
  values (l27, martin, 'visita', 'Valentina Ruiz', hoy, hoy, 1, md5(random()::text), ahora - interval '3 hours');

  -- Cumpleaños en lo de Pablo: una invitación por invitado. Uno ya vino y se fue.
  insert into invitation (unit_id, created_by, kind, guest_name, valid_from, valid_to, capacity, token, note, created_at)
  values (l55, pablo, 'visita', 'Lucía Gómez', hoy, hoy, 1, md5(random()::text),
    'Cumpleaños de Pablo, a partir de las 19.', ahora - interval '1 day');
  insert into invitation (unit_id, created_by, kind, guest_name, valid_from, valid_to, capacity, token, created_at)
  values (l55, pablo, 'visita', 'Nicolás Pérez', hoy, hoy, 1, md5(random()::text), ahora - interval '1 day'),
         (l55, pablo, 'visita', 'Camila Torres', hoy, hoy, 1, md5(random()::text), ahora - interval '1 day');
  insert into invitation (unit_id, created_by, kind, guest_name, guest_doc, valid_from, valid_to, capacity, token, created_at)
  values (l55, pablo, 'visita', 'Joaquín Díaz', '40.222.333', hoy, hoy, 1, md5(random()::text), ahora - interval '1 day')
  returning id into inv;
  insert into entry_log (invitation_id, unit_id, guard_id, entered_at, exited_at, exit_guard_id, guest_name, guest_doc)
  values (inv, l55, ramon, ahora - interval '2 hours', ahora - interval '40 minutes', ramon, 'Joaquín Díaz', '40.222.333');

  -- Anulada por la vecina: para mostrar el rechazo en la barrera.
  insert into invitation (unit_id, created_by, kind, guest_name, guest_doc,
    valid_from, valid_to, capacity, token, revoked_at, created_at)
  values (l12, laura, 'visita', 'Marcos Quiroga', '31.777.888', hoy, hoy, 1, md5(random()::text),
    ahora - interval '2 hours', ahora - interval '1 day');
end $$;

-- Cuentas de demo activas con contraseña "pass123" (afuera del DO: los "$" del
-- hash cortarían el $$). El admin real conserva la suya.
update person set status = 'active',
  password_hash = '$argon2id$v=19$m=65536,p=4,t=3$li5rZ6mus5rcE94H22DcFA$r7hFLYCvBzLGVSPc8Q9zShDYF6fGEsCs1NgBHbiCOGw'
;

commit;

-- Resumen
select 'personas' as que, count(*) from person
union all select 'lotes', count(*) from unit
union all select 'invitaciones', count(*) from invitation
union all select 'movimientos', count(*) from entry_log
union all select 'adentro ahora', count(*) from entry_log where exited_at is null;
