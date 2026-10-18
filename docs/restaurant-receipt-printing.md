# Impresión de recibos cerrados (Chrome / RawBT / PR-100)

## Alcance
Solo comprobantes **internos** de cuentas efectivamente cerradas. No se imprimen comandas, órdenes abiertas, cierres de caja, facturas electrónicas ni pedidos nuevos.

La HSD01 Android 15 de Bar Mariposa imprimió físicamente por Chrome -> RawBT -> USB -> PR-100 el 18 de octubre de 2026 con RawBT esc_general, 203 dpi, 384 dots (58 mm).

## Comportamiento del interruptor PR-100
- **ACTIVA**: el diálogo de método de cobro muestra **Imprimir recibo al cerrar** marcado inicialmente. Tras confirmar el cierre, se muestra **Cuenta cerrada** y el botón **Imprimir recibo**, que abre RawBT mediante un toque explícito.
- **DESACTIVADA**: no se pide recibo automáticamente; el operador puede marcar **Imprimir recibo al cerrar** para esa cuenta. La selección no cambia la preferencia del dispositivo.
- En administración, mesero y barra el botón pasa a **Confirmar cierre e imprimir** al solicitar el recibo. El envío ocurre después de guardar el cierre y no modifica cobros ni inventarios.
- Si falla la recuperación del recibo, el diálogo permanece abierto con **Volver a cargar recibo**. Ese botón solo consulta el recibo, sin repetir el cierre ni el cobro.
- Reimpresión: también disponible desde Historial de ventas.
- Chrome para Android puede bloquear aperturas asíncronas de aplicaciones externas. Por eso RawBT se abre desde el enlace manual **Imprimir recibo**, no desde una petición en segundo plano.
- La prueba anterior de RawBT necesitó pulsar IMPRIMIR en su ventana. No se promete salida de papel silenciosa hasta probar una integración nativa.

## Pruebas
- `pnpm --filter web test` comprueba ancho, monto, cancelados, descuentos, enlace RawBT, casos inválidos e IVA incluido.
- `pnpm --filter @assettrack/api test` verifica lectura segura del recibo.
- `pnpm lint && pnpm test && pnpm build` antes de habilitar el piloto.
- Prueba manual en la HSD01: cerrar una cuenta ficticia, pulsar Imprimir recibo, confirmar en RawBT, cotejar importes y probar Reimprimir.
- Desconectar USB o apagar la impresora: no debería revertirse el cierre; el usuario debe poder reimprimir más tarde.

## Limitaciones
RawBT funciona solo en equipos Android con RawBT instalado y configurado. La aplicación NO puede garantizar que la hoja haya salido: el diálogo de RawBT debe confirmarse y la reimpresión puede generar copias. Evitar confundir este recibo con una factura fiscal. La versión gratuita de RawBT puede añadir una marca en el papel.

## Activación por dispositivo
La impresión al cierre está desactivada por defecto para no afectar otros restaurantes. En la pantalla HSD01 con RawBT conectado, pulsar **Activar recibos PR-100 aquí** en la barra de sesión. Solo este navegador conserva la preferencia en almacenamiento local. El diálogo de cobro permite marcar o desmarcar la impresión para un cierre concreto. RawBT debe estar instalada y configurada con la impresora y sus permisos USB; no es necesario mantener su ventana abierta para que aparezca el botón de la app. El enlace debe abrir RawBT al pulsarlo, y la salida física requiere confirmarla y verificarla en el dispositivo.
