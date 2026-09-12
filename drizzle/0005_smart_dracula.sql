CREATE INDEX "branch_org_idx" ON "branches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "membership_user_org_idx" ON "organization_memberships" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "menu_branch_sort_idx" ON "menu_items" USING btree ("branch_id","organization_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "orders_branch_status_created_idx" ON "orders" USING btree ("branch_id","organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_table_status_created_idx" ON "orders" USING btree ("table_id","branch_id","organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "queue_branch_status_wait_idx" ON "queue_entries" USING btree ("branch_id","organization_id","status","joined_at");