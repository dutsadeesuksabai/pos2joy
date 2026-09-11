CREATE TABLE "branch_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "branch_staff_branch_id_user_id_unique" UNIQUE("branch_id","user_id"),
	CONSTRAINT "branch_staff_role_valid" CHECK ("branch_staff"."role" in ('manager', 'host', 'server', 'kitchen', 'cashier'))
);
--> statement-breakpoint
ALTER TABLE "branch_staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"currency" text DEFAULT 'THB' NOT NULL,
	CONSTRAINT "branches_id_organization_id_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"label" text NOT NULL,
	"capacity" integer NOT NULL,
	"floor_id" uuid NOT NULL,
	"accessible" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"state" text DEFAULT 'available' NOT NULL,
	CONSTRAINT "dining_tables_branch_id_label_unique" UNIQUE("branch_id","label"),
	CONSTRAINT "dining_tables_id_branch_id_organization_id_unique" UNIQUE("id","branch_id","organization_id"),
	CONSTRAINT "capacity_positive" CHECK ("dining_tables"."capacity" > 0),
	CONSTRAINT "table_state_valid" CHECK ("dining_tables"."state" in ('available', 'occupied', 'reserved', 'held')),
	CONSTRAINT "disabled_table_available" CHECK ("dining_tables"."enabled" or "dining_tables"."state" = 'available')
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "floors_branch_id_name_unique" UNIQUE("branch_id","name"),
	CONSTRAINT "floors_id_branch_id_organization_id_unique" UNIQUE("id","branch_id","organization_id"),
	CONSTRAINT "floor_revision_nonnegative" CHECK ("floors"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "floors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "layout_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"canvas" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "layout_versions_floor_id_version_unique" UNIQUE("floor_id","version"),
	CONSTRAINT "layout_version_positive" CHECK ("layout_versions"."version" > 0),
	CONSTRAINT "layout_state_valid" CHECK ("layout_versions"."state" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "layout_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "organization_memberships_organization_id_user_id_unique" UNIQUE("organization_id","user_id"),
	CONSTRAINT "membership_role_valid" CHECK ("organization_memberships"."role" in ('owner', 'member'))
);
--> statement-breakpoint
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"guest_name" text NOT NULL,
	"party_size" integer NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_size_positive" CHECK ("queue_entries"."party_size" > 0),
	CONSTRAINT "queue_status_valid" CHECK ("queue_entries"."status" in ('waiting', 'offered', 'seated', 'cancelled', 'no_show'))
);
--> statement-breakpoint
ALTER TABLE "queue_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "restaurants_id_organization_id_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "restaurants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_organization_id_user_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_restaurant_id_organization_id_restaurants_id_organization_id_fk" FOREIGN KEY ("restaurant_id","organization_id") REFERENCES "public"."restaurants"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_floor_id_branch_id_organization_id_floors_id_branch_id_organization_id_fk" FOREIGN KEY ("floor_id","branch_id","organization_id") REFERENCES "public"."floors"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_versions" ADD CONSTRAINT "layout_versions_floor_id_branch_id_organization_id_floors_id_branch_id_organization_id_fk" FOREIGN KEY ("floor_id","branch_id","organization_id") REFERENCES "public"."floors"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_published_layout_per_floor" ON "layout_versions" USING btree ("floor_id") WHERE "layout_versions"."state" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "one_draft_layout_per_floor" ON "layout_versions" USING btree ("floor_id") WHERE "layout_versions"."state" = 'draft';