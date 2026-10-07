CREATE TABLE "content_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_pack_id" uuid NOT NULL,
	"mode" varchar(20) NOT NULL,
	"brief" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"workflow_execution_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_source_pack_id_source_packs_id_fk" FOREIGN KEY ("source_pack_id") REFERENCES "public"."source_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_projects_source_pack_idx" ON "content_projects" USING btree ("source_pack_id");--> statement-breakpoint
CREATE INDEX "content_projects_created_by_idx" ON "content_projects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "content_projects_mode_idx" ON "content_projects" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "content_projects_status_idx" ON "content_projects" USING btree ("status");