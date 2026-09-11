CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"price_cents" integer NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_items_branch_id_name_unique" UNIQUE("branch_id","name"),
	CONSTRAINT "menu_items_id_branch_id_organization_id_unique" UNIQUE("id","branch_id","organization_id"),
	CONSTRAINT "menu_price_nonnegative" CHECK ("menu_items"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_items_order_id_menu_item_id_unique" UNIQUE("order_id","menu_item_id"),
	CONSTRAINT "order_item_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_item_price_nonnegative" CHECK ("order_items"."unit_price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"status" text DEFAULT 'placed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_id_branch_id_organization_id_unique" UNIQUE("id","branch_id","organization_id"),
	CONSTRAINT "order_status_valid" CHECK ("orders"."status" in ('placed', 'preparing', 'served', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_branch_id_organization_id_orders_id_branch_id_organization_id_fk" FOREIGN KEY ("order_id","branch_id","organization_id") REFERENCES "public"."orders"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_branch_id_organization_id_menu_items_id_branch_id_organization_id_fk" FOREIGN KEY ("menu_item_id","branch_id","organization_id") REFERENCES "public"."menu_items"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_branch_id_organization_id_dining_tables_id_branch_id_organization_id_fk" FOREIGN KEY ("table_id","branch_id","organization_id") REFERENCES "public"."dining_tables"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;