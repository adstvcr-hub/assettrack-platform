# Jornadas de caja

La jornada conserva la fecha local y la zona horaria de su primera apertura. Los relevos cambian el responsable, pero no la jornada. No hay cierre automático por medianoche ni por duración: una jornada puede superar 24 horas.

Al cambiar de fecha, los nuevos cobros y movimientos requieren que el responsable elija en Caja **Continuar jornada** o registre el efectivo contado y seleccione **Cerrar jornada pendiente**. La continuación conserva la fecha original, identifica al responsable y deja un evento de auditoría. El cierre pendiente se permite sin confirmar una continuación. Después se abre una nueva jornada con la fecha actual y un efectivo inicial declarado, incluido cero.

Cada cobro cerrado queda vinculado a la jornada y al turno de caja activo. Los pagos a empleados y las facturas de proveedores se vinculan mediante su turno. El cierre suma estas relaciones, sin cortar por medianoche, y conserva la fecha y hora reales del cierre. Las operaciones financieras y el cierre usan transacciones serializables con reintentos limitados para evitar que un cobro confirmado quede fuera del cierre.

Las cajas entregadas sin responsable siguen pendientes: quien las asuma hereda la jornada anterior y puede continuarla o cerrarla. Los pedidos pueden prepararse, pero los nuevos cobros requieren una caja asumida. Las jornadas ya cerradas no bloquean abrir otra con la misma fecha; cada una tiene su identificador y su cierre único.

## Migración y despliegue

La API y la web deben desplegarse con este cambio. La migración es `20261019120000_restaurant_cash_business_days` y el arranque de la API ejecuta `prisma migrate deploy` antes de servir peticiones.

1. Detener/drainar los procesos de API de la versión anterior para que no registren cierres con las reglas antiguas durante el cambio.
2. Ejecutar la migración y arrancar la nueva API con el cliente Prisma regenerado. El Dockerfile existente realiza la generación y compilación; el comando de arranque aplica las migraciones.
3. Publicar la web de la misma revisión. Si la web alcanza una API anterior, Caja muestra que la actualización está pendiente y evita ofrecer cierres atrasados con reglas incompatibles.
4. Comprobar en el entorno destino una caja pendiente, su cierre con fecha original y la apertura de la fecha actual.

La migración recupera solo los turnos pendientes posteriores al último cierre final de cada caja. Usa la primera apertura de esa cadena y la zona horaria actualmente configurada para el negocio, que desde entonces queda fija. Incluye las ventas pendientes posteriores a esa apertura; si alguna ocurrió sin responsable entre relevos, conserva la jornada sin inventar un turno responsable.

Los cierres históricos sellados conservan sus fechas y totales. Esta migración no corrige cierres antiguos que ya hubieran sido guardados con una fecha equivocada; esas correcciones necesitan un proceso de ajuste auditado. El historial mantiene compatibilidad con registros anteriores sin identificador de jornada. La retención de datos no elimina ventas de una jornada que siga abierta.

## Consulta de proveedores

En **Caja → Historial de facturas de proveedores** se consultan facturas de jornadas abiertas y cerradas. Se puede filtrar por rango de hasta 366 días, proveedor (sin distinguir mayúsculas), estado y método de pago. La fecha se interpreta según la opción elegida:

- **Fecha de jornada de caja**: usa la fecha original de apertura, incluso con relevos o cierres posteriores. Los registros anteriores sin jornada usan su fecha local de registro.
- **Fecha de factura**: usa la fecha que se ingresó en el documento, independientemente de cuándo se registró o pagó.

El listado incluye proveedor, número, fecha de factura, fechas de registro y pago, monto, estado, método, impacto en efectivo, usuario que registró, observación y contexto de caja. Los totales abarcan todos los resultados del filtro, con páginas de 50 facturas. Solo un pago en efectivo con evidencia del método se atribuye al efectivo; los métodos desconocidos se presentan por separado. La observación conserva el texto original; no se inventa una descripción de productos cuando falta.

Cada tarjeta del **Historial de cierres** incorpora las facturas y pagos a proveedores de esa jornada. Los métodos de pago se desglosan y los pagos en efectivo se separan de otros egresos en la conciliación. Los cierres mantienen sus importes guardados. Si falta detalle o no coincide con el total sellado, se muestra un aviso y únicamente se atribuyen los métodos conocidos. Los documentos anteriores sin jornada se asocian por caja y fecha local, distinguiendo el registro del pago.

La consulta usa `GET /api/v1/restaurant/cash-registers/supplier-invoices` con `from`, `to`, `dateBy=JOURNAL|INVOICE`, `supplier`, `status`, `paymentMethod` y `page`. Requiere autenticación y el mismo permiso de consulta de Caja; siempre limita los datos al restaurante de la sesión. No necesita migraciones adicionales. La API y la web deben actualizarse juntas; una API anterior produce un aviso en la consulta de proveedores y mantiene las demás operaciones disponibles.

## Validación

- `pnpm --filter @assettrack/api test`: pruebas unitarias del servicio.
- `pnpm --filter @assettrack/api test:cash-days`: integración con PostgreSQL. Requiere `DATABASE_URL` y un rol local con permiso `CREATEDB`. Crea una base temporal aislada, aplica las migraciones anteriores, inserta datos de una caja pendiente y un cierre histórico, aplica la nueva migración y prueba el flujo real. Elimina únicamente su base temporal al terminar.
- `pnpm --filter @assettrack/api start`: aplica las migraciones con la configuración del repositorio y arranca la API. La comprobación `GET /api/v1/health` debe devolver `status: ok`. La dependencia directa `dotenv` permite cargar la configuración de Prisma durante generación y arranque.
- `pnpm --filter @assettrack/api build`, `pnpm --filter web typecheck`, `pnpm --filter web build` y `pnpm lint`.

La integración cubre jornadas de varios días, relevos, fecha local cerca de medianoche UTC, zona horaria congelada, autorización para continuar, pagos del día siguiente incluidos en el cierre original, nueva apertura, entregas de domicilio, cierre repetido y cobro concurrente con cierre final.
