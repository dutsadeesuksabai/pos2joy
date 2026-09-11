ALTER TABLE "queue_entries" ADD COLUMN "service_day" date NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "ticket_no" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_branch_id_service_day_ticket_no_unique" UNIQUE("branch_id","service_day","ticket_no");--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "ticket_no_positive" CHECK ("queue_entries"."ticket_no" > 0);