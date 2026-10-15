-- Vender en NODO: mail donde la tienda recibe los pedidos. Solo aditiva.

ALTER TABLE "Storefront" ADD COLUMN "ordersEmail" TEXT;
