CREATE TABLE "agent_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"version" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" varchar(200) NOT NULL,
	"purpose" text NOT NULL,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"allowed_tools" text[],
	"system_prompt" text NOT NULL,
	"prompt_version" varchar(200) NOT NULL,
	"model_policy" varchar(100) NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_definitions_slug_version_unique" UNIQUE("slug","version")
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid,
	"workflow_execution_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_definition_id" uuid NOT NULL,
	"workflow_execution_id" uuid,
	"workflow_step_id" uuid,
	"model_provider" varchar(50) NOT NULL,
	"model_name" varchar(200) NOT NULL,
	"prompt_version" varchar(200) NOT NULL,
	"status" varchar(50) NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"usage_metadata" jsonb,
	"latency_ms" integer,
	"error_metadata" jsonb,
	"correlation_id" varchar(200),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_execution_id" uuid NOT NULL,
	"step_id" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"decided_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tool_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"tool_name" varchar(100) NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"status" varchar(50) NOT NULL,
	"latency_ms" integer,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"version" varchar(50) NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_definitions_slug_version_unique" UNIQUE("slug","version")
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"status" varchar(50) NOT NULL,
	"input" jsonb,
	"state" jsonb,
	"error" jsonb,
	"correlation_id" varchar(200),
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_execution_id" uuid NOT NULL,
	"step_id" varchar(100) NOT NULL,
	"agent_definition_id" uuid,
	"status" varchar(50) NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_steps_execution_step_attempt_unique" UNIQUE("workflow_execution_id","step_id","attempt")
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workflow_step_id_workflow_steps_id_fk" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_definitions_slug_idx" ON "agent_definitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "agent_events_agent_run_idx" ON "agent_events" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "agent_events_execution_idx" ON "agent_events" USING btree ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX "agent_runs_definition_idx" ON "agent_runs" USING btree ("agent_definition_id");--> statement-breakpoint
CREATE INDEX "agent_runs_execution_idx" ON "agent_runs" USING btree ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX "agent_runs_correlation_id_idx" ON "agent_runs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "agent_runs_created_at_idx" ON "agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "approvals_execution_idx" ON "approvals" USING btree ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tool_runs_agent_run_idx" ON "tool_runs" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_slug_idx" ON "workflow_definitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_executions_definition_idx" ON "workflow_executions" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_correlation_id_idx" ON "workflow_executions" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_execution_idx" ON "workflow_steps" USING btree ("workflow_execution_id");