CREATE TYPE "public"."fulfillment_kind" AS ENUM('counter', 'pickup', 'ship');--> statement-breakpoint
CREATE TYPE "public"."helcim_device_kind" AS ENUM('smart_terminal', 'card_reader');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('in_person', 'online');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'approved', 'declined', 'cancelled', 'timed_out', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."stock_reason" AS ENUM('receive', 'sale', 'online_sale', 'adjust', 'return', 'void');--> statement-breakpoint
CREATE TABLE "helcim_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_key" text NOT NULL,
	"api_token_enc" text NOT NULL,
	"verifier_token_enc" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "helcim_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" "helcim_device_kind" NOT NULL,
	"label" text NOT NULL,
	"location" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_ping_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_counters" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"next" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"channel" "order_channel" NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"fulfillment" "fulfillment_kind" DEFAULT 'counter' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"customer_name" text,
	"customer_email" text,
	"ship_to" jsonb,
	"created_by_membership_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"channel" "order_channel" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"device_id" uuid,
	"idempotency_key" text NOT NULL,
	"helcim_transaction_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"needs_review" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"shipping_allowed" boolean DEFAULT true NOT NULL,
	"pickup_allowed" boolean DEFAULT true NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "stock_reason" NOT NULL,
	"order_id" uuid,
	"note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"webhook_id" text NOT NULL,
	"type" text NOT NULL,
	"helcim_id" text,
	"result" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "helcim_connections" ADD CONSTRAINT "helcim_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helcim_devices" ADD CONSTRAINT "helcim_devices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helcim_devices" ADD CONSTRAINT "helcim_devices_connection_id_helcim_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."helcim_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_counters" ADD CONSTRAINT "order_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_membership_id_memberships_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_device_id_helcim_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."helcim_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "helcim_connections_ws" ON "helcim_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "helcim_connections_key" ON "helcim_connections" USING btree ("connection_key");--> statement-breakpoint
CREATE UNIQUE INDEX "helcim_devices_conn_code" ON "helcim_devices" USING btree ("connection_id","code");--> statement-breakpoint
CREATE INDEX "order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_ws_number" ON "orders" USING btree ("workspace_id","order_number");--> statement-breakpoint
CREATE INDEX "orders_ws_status" ON "orders" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idem" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_txn" ON "payments" USING btree ("helcim_transaction_id");--> statement-breakpoint
CREATE INDEX "payments_order" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_ws_status" ON "payments" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_pending_per_device" ON "payments" USING btree ("device_id") WHERE status = 'pending' and device_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_ws_sku" ON "products" USING btree ("workspace_id","sku");--> statement-breakpoint
CREATE INDEX "products_ws_active" ON "products" USING btree ("workspace_id","active");--> statement-breakpoint
CREATE INDEX "stock_movements_product" ON "stock_movements" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_order" ON "stock_movements" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_webhook_id" ON "webhook_events" USING btree ("webhook_id");