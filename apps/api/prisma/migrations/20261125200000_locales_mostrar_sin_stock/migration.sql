-- Los locales no publican stock (solo listan lo disponible): «ocultar sin stock» los escondía enteros.
UPDATE "ProviderSyncConfig" SET "zeroStockAction" = 'KEEP' WHERE "provider" LIKE 'LIST\_RETAIL\_%' AND "zeroStockAction" <> 'KEEP';
