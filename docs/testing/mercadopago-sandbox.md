# Mercado Pago Checkout Pro — sandbox cerrado

## Estado y límites

La integración opera exclusivamente con credenciales de prueba y permanece
cerrada por defecto:

- `REAL_MONEY_ENABLED=false`.
- `FIAT_SANDBOX_CHECKOUT_ENABLED=false` hasta completar el webhook y la prueba
  cerrada.
- `FIAT_SANDBOX_ACTIVATION_ENABLED=false`; pagar en sandbox no activa mineros ni
  genera ZYXE.
- Ningún `FiatProductVersion` se publica como `ACTIVE` durante el despliegue.
- El backend acepta cantidad `1`, moneda `COP`, precio y producto tomados del
  catálogo autoritativo; nunca confía en importes enviados por el navegador.

El flujo implementado es:

```text
confirmación económica
  -> orden e intento idempotentes
  -> Checkout Pro alojado
  -> webhook firmado y persistido
  -> consulta autoritativa GET /v1/payments/{id}
  -> verificación de vendedor, aplicación, entorno, referencia, moneda e importe
  -> orden PAID + un único Entitlement PURCHASED
```

## Lo que debe configurar el propietario

No copies valores secretos al chat, al repositorio ni a Vercel.

1. Abre Mercado Pago Developers y selecciona la aplicación de prueba de Fauzet.
2. En **Webhooks**, elige el ambiente de prueba y agrega esta URL HTTPS:

   ```text
   https://fauzet-api-4day2f4t7q-uc.a.run.app/v1/fiat/webhooks/mercadopago
   ```

3. Suscribe únicamente el evento **Pagos** y guarda la configuración.
4. Copia el secreto de firma generado por Mercado Pago directamente a Google
   Secret Manager con el nombre `fauzet-mercadopago-webhook-secret`. Cloud Run
   lo montará como `MERCADOPAGO_WEBHOOK_SECRET`; no lo pegues en ninguna
   variable `NEXT_PUBLIC_*`.
5. Confirma que existe un comprador de prueba colombiano distinto del vendedor
   de prueba. Conserva sus credenciales solamente para la prueba manual.
6. Informa a desarrollo únicamente que los pasos anteriores están listos; no
   envíes el secreto, el Access Token ni la contraseña del comprador.

Además del secreto, Cloud Run utilizará estos nombres de configuración:

```text
MERCADOPAGO_MODE=test
MERCADOPAGO_ACCESS_TOKEN=<referencia de Secret Manager>
MERCADOPAGO_WEBHOOK_SECRET=<referencia de Secret Manager>
MERCADOPAGO_APPLICATION_ID=<id numérico no secreto>
MERCADOPAGO_SELLER_USER_ID=<id numérico no secreto>
FIAT_SANDBOX_CHECKOUT_ALLOWED_USERS=<UUID o email de la cuenta cerrada>
```

## Prueba cerrada y orden de habilitación

1. Mantener todos los gates apagados y desplegar código/migración.
2. Probar una notificación firmada con el simulador de Webhooks de Mercado Pago.
3. Publicar solamente `MINER_DRIPPER_MINI` en sandbox.
4. Añadir una sola cuenta Fauzet de prueba a la allowlist.
5. Activar `FIAT_SANDBOX_CHECKOUT_ENABLED=true`; mantener activación y dinero real
   en `false`.
6. Abrir el checkout desde `/app/store/fiat`, pagar con el comprador de prueba y
   comprobar que la orden llega a `PAID` y existe exactamente un entitlement.
7. Repetir el webhook y la consulta para demostrar que no se duplica el beneficio.
8. Simular importe/vendedor incorrecto y comprobar `HELD`, sin entitlement.
9. Apagar de nuevo el gate si falla cualquier conciliación.

La documentación actual de Mercado Pago advierte que algunas compras hechas con
credenciales de prueba no generan notificaciones reales. Por eso la firma se
prueba con el simulador y el reconciliador vuelve a consultar los pagos pendientes.

## Verificación automatizada

```powershell
pnpm --filter @fauzet/api test
pnpm --filter @fauzet/api typecheck

$env:RUN_INTEGRATION='true'
pnpm --filter @fauzet/api test -- prisma-fiat-payment-store.integration.test.ts
Remove-Item Env:RUN_INTEGRATION
```

Las pruebas PostgreSQL cubren reserva/replay idempotente, acreditación exactamente
una vez, repetición de webhook aun si cambia el cuerpo no firmado, retención por
identidad incorrecta, doble pago aprobado, reembolso total previo al fulfillment y
revocación segura del entitlement.

## Operación

Ejecutar periódicamente:

```powershell
pnpm fiat:reconcile
```

El reconciliador reclama eventos fallidos o pendientes mediante un lease, consulta
Mercado Pago y aplica backoff/dead-letter. Cualquier `HELD`, `DISPUTED`,
`DEAD_LETTER`, reembolso o contracargo debe producir una alerta operativa antes de
habilitar dinero real.
