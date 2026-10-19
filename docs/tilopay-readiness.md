# Preparación de Tilopay

## Estado de la revisión

La aplicación tiene cobros regulares por efectivo (`CASH`), SINPE (`SINPE`), tarjeta (`CARD`) y otro (`OTHER`). `PaymentMethodDialog` solicita el método y una referencia opcional; `RestaurantService.closeVisit` registra el cierre en una transacción y lo vincula a la jornada y al turno de caja activos. Actualmente no existe una integración con una pasarela ni una verificación de transacciones de Tilopay.

El alcance confirmado es cobrar órdenes del restaurante. El usuario confirmó que todavía no cuenta con comercio ni ambiente de pruebas de Tilopay. Falta identificar el producto contratado y disponer de su contrato oficial de integración. No se encontraron variables de Tilopay en este entorno. Las consultas a los dominios oficiales `docs.tilopay.com`, `tilopay.com` y `app.tilopay.com` fueron rechazadas por el proxy con CONNECT 403. La revisión no verificó endpoints, formatos de notificación ni autenticación del proveedor.

Esta entrega agrega el estado de Tilopay al selector de cobro y el endpoint autenticado `GET /api/v1/restaurant/payment-options`. Los cuatro métodos regulares permanecen disponibles, incluso si esa consulta falla o la API aún no incluye el endpoint. Tilopay aparece deshabilitado como pendiente de activación; el servidor rechaza usarlo como un método manual para cerrar una cuenta. No se agregó un adaptador de cobro, no se modificó el esquema de pagos ni se hacen llamadas al proveedor.

La preparación de la interfaz no constituye una integración operativa: conectar el checkout, consultar su resultado y autenticar sus notificaciones es trabajo pendiente que requiere el contrato oficial del producto habilitado al comercio. Configurar una variable o recibir una redirección no habilita la opción por sí solo.

## Cobros de órdenes: comportamiento a conservar

- Los cuatro métodos regulares siguen disponibles. La indisponibilidad de Tilopay no debe impedir registrar un pago regular.
- `CARD` conserva su significado de pago recibido y registrado por el personal. Un cobro iniciado por la plataforma necesita un resultado verificable del proveedor.
- Los recibos y reportes deben identificar Tilopay de forma explícita. Un ingreso por Tilopay no aumenta el efectivo físico de caja.
- Un enlace de pago creado, una redirección de regreso o una selección de método no prueban que se haya recibido dinero.

## Flujo que debe implementar la opción adicional

1. El servidor valida restaurante, permisos, cuenta, moneda e importe obtenido de los productos, impuestos, servicio y promociones. El navegador no determina el importe autorizado.
2. Se registra un intento con identificador propio, referencia de la cuenta, restaurante, importe y moneda, revisión del consumo y clave de idempotencia. Se registra antes de contactar al proveedor para poder reconciliar respuestas perdidas o tardías.
3. El adaptador de Tilopay inicia el flujo del producto contratado conforme a su documentación oficial. Las credenciales quedan en el servidor; si se elige un checkout alojado, los datos de tarjeta se introducen directamente en el proveedor.
4. El retorno al navegador informa el estado, pero la confirmación del pago procede de una notificación autenticada o una consulta al proveedor desde el servidor. Se verifican comercio, referencia, importe, moneda y resultado final.
5. La confirmación se procesa de forma idempotente. Las notificaciones repetidas no duplican pagos, cierres ni recibos. Un timeout queda pendiente de reconciliación y no habilita de inmediato un segundo cobro por otro medio.
6. Se muestra al personal el resultado y la acción correspondiente: continuar, reintentar tras rechazo confirmado, o revisar un estado pendiente. Una orden ya pagada no debe volver a cobrarse.

## Integración con las jornadas de caja

La jornada distingue el momento en que se recibe un pago del momento en que se entrega y cierra una cuenta. Los pagos electrónicos anticipados requieren un registro de cobro asociado a una jornada y una conciliación independiente del cierre de la orden; no deben desaparecer de un cierre de caja porque la orden siga abierta. Una confirmación tardía de Tilopay no debe modificar silenciosamente un cierre de caja ya sellado ni perderse por falta de una caja abierta.

Antes de activar el proveedor deben resolverse las reglas para estos casos: cobro antes de preparar un domicilio, cobro al cerrar una cuenta de salón, relevo o cierre mientras existe un pago pendiente y confirmación que llega después del cierre de la jornada. El consumo no puede cambiar libremente durante un intento que todavía podría cobrar el importe anterior. Los cambios y cancelaciones de una orden ya pagada necesitan un ajuste o un reembolso definido por el producto contratado.

## Datos de Tilopay necesarios

- Producto habilitado: checkout alojado, SDK u otra modalidad indicada por Tilopay.
- Documentación oficial aplicable al comercio y entorno de pruebas.
- País, moneda y unidad del importe que espera la API, identificador del comercio y credenciales requeridas por ese producto.
- Creación y consulta de transacciones; referencias e idempotencia disponibles.
- Notificaciones y verificación de su autenticidad; resultados finales y estados pendientes.
- URL de retorno y URL de notificación que deban registrarse en Tilopay.
- Condiciones de pruebas, aprobación para producción y tratamiento de anulaciones/reembolsos.

Las credenciales se introducirán en la configuración segura de Railway. No deben compartirse en el chat, guardarse en el repositorio ni incluirse en variables públicas de Vercel.

## Verificación pendiente

La integración deberá probar aprobaciones, rechazos, abandono, timeout después de iniciar un cobro, notificaciones repetidas o fuera de orden, importes o referencias alterados, actualización del consumo durante el pago, alternancia con métodos regulares y conciliación con jornadas pendientes o cerradas. La aceptación final requiere ejecutar pruebas contra el ambiente oficial de Tilopay además de las pruebas locales.

## Activación cuando esté disponible la cuenta

1. Solicitar a Tilopay un comercio para cobros de órdenes, el ambiente de pruebas y la guía del producto contratado. Confirmar moneda y si la plataforma requiere un comercio diferente por cada restaurante; AssetTrack es multiempresa.
2. Con esa guía, implementar el adaptador, el registro persistente de intentos/cobros y la confirmación verificable descritos arriba. Configurar las credenciales en Railway y registrar las URLs de retorno/notificación que requiera Tilopay.
3. Probar el checkout oficial y la conciliación en staging, incluidos todos los casos pendientes de esta nota. El modo de pruebas debe mostrarse explícitamente y no debe generar cobros de producción.
4. Después de aprobar la integración, publicar una versión conjunta de API y web que habilite Tilopay. Los pagos regulares seguirán disponibles.

## Comprobaciones de esta preparación

Se verificaron los cuatro métodos regulares en las pruebas del servicio y en PostgreSQL, incluidos sus totales por método y el efecto exclusivo del efectivo en el saldo físico de caja. La selección no confirmada de Tilopay fue rechazada sin cerrar la cuenta ni generar recibo.

En navegador se verificaron los cuatro métodos y la continuidad del cierre cuando la consulta de disponibilidad falla, está desconectada o la API aún no tiene el endpoint; también los roles de mesero, bar y administración y el tamaño del diálogo en una pantalla de teléfono. Pasaron los once escenarios existentes de selección de impresión y recibo RawBT con API simulada. Estas verificaciones no incluyen cobros en Tilopay ni impresión física.
