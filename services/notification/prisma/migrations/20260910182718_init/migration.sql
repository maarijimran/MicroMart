-- CreateTable
CREATE TABLE "notifications_log" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_log_order_id_event_type_key" ON "notifications_log"("order_id", "event_type");
