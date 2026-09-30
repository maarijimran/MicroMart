CREATE TYPE "OrderStatus" AS ENUM ('pending', 'awaiting_payment', 'confirmed', 'cancelled');
CREATE TYPE "SagaEventDirection" AS ENUM ('published', 'consumed');

CREATE TABLE "orders" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "status" "OrderStatus" NOT NULL DEFAULT 'pending',
  "total_amount" DECIMAL(10,2) NOT NULL, "currency" CHAR(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "order_items" (
  "id" UUID NOT NULL, "order_id" UUID NOT NULL, "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL, "unit_price_snapshot" DECIMAL(10,2) NOT NULL,
  "quantity" INTEGER NOT NULL, "subtotal" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "saga_events" (
  "id" UUID NOT NULL, "order_id" UUID NOT NULL, "event_type" TEXT NOT NULL,
  "direction" "SagaEventDirection" NOT NULL, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saga_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "saga_events_order_id_event_type_idx" ON "saga_events"("order_id", "event_type");
CREATE UNIQUE INDEX "saga_events_order_id_event_type_direction_key" ON "saga_events"("order_id", "event_type", "direction");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saga_events" ADD CONSTRAINT "saga_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
