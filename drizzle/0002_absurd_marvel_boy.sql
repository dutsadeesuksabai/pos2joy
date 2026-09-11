CREATE TABLE "queue_seating_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"queue_entry_id" uuid,
	"actor_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queue_seating_decision_valid" CHECK ("queue_seating_events"."decision" in ('recommended', 'override', 'walk_in'))
);
--> statement-breakpoint
ALTER TABLE "queue_seating_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "needs_accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "requested_floor_id" uuid;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "seated_table_id" uuid;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "seated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "seated_by" uuid;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "seating_reason" text;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "called_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "called_table_id" uuid;--> statement-breakpoint
ALTER TABLE "queue_seating_events" ADD CONSTRAINT "queue_event_table_tenant_fk" FOREIGN KEY ("table_id","branch_id","organization_id") REFERENCES "public"."dining_tables"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_id_branch_id_organization_id_unique" UNIQUE("id","branch_id","organization_id");--> statement-breakpoint
ALTER TABLE "queue_seating_events" ADD CONSTRAINT "queue_event_entry_tenant_fk" FOREIGN KEY ("queue_entry_id","branch_id","organization_id") REFERENCES "public"."queue_entries"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_requested_floor_tenant_fk" FOREIGN KEY ("requested_floor_id","branch_id","organization_id") REFERENCES "public"."floors"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_seated_table_tenant_fk" FOREIGN KEY ("seated_table_id","branch_id","organization_id") REFERENCES "public"."dining_tables"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_called_table_tenant_fk" FOREIGN KEY ("called_table_id","branch_id","organization_id") REFERENCES "public"."dining_tables"("id","branch_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_called_together" CHECK (("queue_entries"."called_at" is null) = ("queue_entries"."called_table_id" is null));