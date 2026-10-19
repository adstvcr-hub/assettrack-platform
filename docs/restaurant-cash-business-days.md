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

## Validación

- `pnpm --filter @assettrack/api test`: pruebas unitarias del servicio.
- `pnpm --filter @assettrack/api test:cash-days`: integración con PostgreSQL. Requiere `DATABASE_URL` y un rol local con permiso `CREATEDB`. Crea una base temporal aislada, aplica las migraciones anteriores, inserta datos de una caja pendiente y un cierre histórico, aplica la nueva migración y prueba el flujo real. Elimina únicamente su base temporal al terminar.
- `pnpm --filter @assettrack/api start`: aplica las migraciones con la configuración del repositorio y arranca la API. La comprobación `GET /api/v1/health` debe devolver `status: ok`. La dependencia directa `dotenv` permite cargar la configuración de Prisma durante generación y arranque.
- `pnpm --filter @assettrack/api build`, `pnpm --filter web typecheck`, `pnpm --filter web build` y `pnpm lint`.

La integración cubre jornadas de varios días, relevos, fecha local cerca de medianoche UTC, zona horaria congelada, autorización para continuar, pagos del día siguiente incluidos en el cierre original, nueva apertura, entregas de domicilio, cierre repetido y cobro concurrente con cierre final.
