-- NODO Base deja de existir: los comercios que lo tenían pasan a Pro.
-- El valor BASE queda en el enum solo para el historial (pagos y eventos viejos).
INSERT INTO "SubscriptionEvent" ("id", "tenantId", "subscriptionId", "type", "fromPlan", "toPlan", "actorUserId", "data", "createdAt")
SELECT gen_random_uuid(), s."tenantId", s."id", 'PLAN_CHANGED', 'BASE', 'PRO', NULL,
       '{"reason": "Se discontinuó NODO Base: pasa a NODO Pro"}'::jsonb, NOW()
FROM "Subscription" s
JOIN "Tenant" t ON t."id" = s."tenantId"
WHERE t."plan" = 'BASE';

UPDATE "Tenant" SET "plan" = 'PRO' WHERE "plan" = 'BASE';

-- Custom ya no tiene puesta en marcha: lo pendiente queda exento.
INSERT INTO "SubscriptionEvent" ("id", "tenantId", "subscriptionId", "type", "actorUserId", "data", "createdAt")
SELECT gen_random_uuid(), "tenantId", "id", 'SETUP_FEE_UPDATED', NULL,
       '{"status": "WAIVED", "reason": "Se discontinuó la puesta en marcha de NODO Custom"}'::jsonb, NOW()
FROM "Subscription"
WHERE "setupFeeStatus" = 'PENDING';

UPDATE "Subscription" SET "setupFeeStatus" = 'WAIVED', "setupFeeBlocksCustom" = false WHERE "setupFeeStatus" = 'PENDING';
