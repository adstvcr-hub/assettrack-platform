# Impresión de recibos cerrados (Chrome / RawBT / PR-100)

## Alcance
Solo comprobantes **internos** de cuentas efectivamente cerradas. No se imprimen comandas, órdenes abiertas, cierres de caja, facturas electrónicas ni pedidos nuevos.

La HSD01 Android 15 de Bar Mariposa imprimió físicamente por Chrome -> RawBT -> USB -> PR-100 el 18 de octubre de 2026 con RawBT esc_general, 203 dpi, 384 dots (58 mm).

## Comportamiento
- En administración, mesero y barra, un cierre exitoso muestra **Imprimir recibo**.
- El enlace RawBT se abre por gesto del usuario. En la prueba física RawBT exigió pulsar **IMPRIMIR**; la impresión silenciosa NO está implementada.
- Después del cierre, el error de impresión no revierte cobros ni inventarios.
- Administración puede **Reimprimir recibo** desde Historial de ventas durante el plazo existente de retención.
- El backend comprueba organización, estado CLOSED y acceso del administrador/responsable/operador que cerró. Reutiliza el cálculo existente y excluye ítems cancelados y componentes internos de combos.
- No se altera la base de datos ni el proceso de cierre original.

## Pruebas
- `pnpm --filter web test` comprueba ancho, monto, cancelados, descuentos, enlace RawBT, casos inválidos e IVA incluido.
- `pnpm --filter @assettrack/api test` verifica lectura segura del recibo.
- `pnpm lint && pnpm test && pnpm build` antes de habilitar el piloto.
- Prueba manual en la HSD01: cerrar una cuenta ficticia, pulsar Imprimir recibo, confirmar en RawBT, cotejar importes y probar Reimprimir.
- Desconectar USB o apagar la impresora: no debería revertirse el cierre; el usuario debe poder reimprimir más tarde.

## Limitaciones
RawBT funciona solo en equipos Android con RawBT instalado y configurado. La aplicación NO puede garantizar que la hoja haya salido: el diálogo de RawBT debe confirmarse y la reimpresión puede generar copias. Evitar confundir este recibo con una factura fiscal. La versión gratuita de RawBT puede añadir una marca en el papel.

## Activación por dispositivo
La impresión al cierre está desactivada por defecto para no afectar otros restaurantes. En la pantalla HSD01 con RawBT conectado, pulsar **Activar recibos PR-100 aquí** en la barra de sesión. Solo este navegador conserva la preferencia en almacenamiento local. En otros teléfonos no aparecerá el diálogo automáticamente. La reimpresión desde Historial se permite por acción explícita.
