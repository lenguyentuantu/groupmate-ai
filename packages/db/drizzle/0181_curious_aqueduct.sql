CREATE TABLE "monitoring_alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"finding_key" text NOT NULL,
	"issue_id" integer NOT NULL,
	"rule" text NOT NULL,
	"severity" text NOT NULL,
	"evidence" text NOT NULL,
	"explanation" text NOT NULL,
	"next_action" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "monitoring_alert_status_check" CHECK ("monitoring_alert"."status" IN ('active', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "monitoring_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"total_findings" integer DEFAULT 0 NOT NULL,
	"new_alerts" integer DEFAULT 0 NOT NULL,
	"ongoing_alerts" integer DEFAULT 0 NOT NULL,
	"resolved_alerts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitoring_run_status_check" CHECK ("monitoring_run"."status" IN ('succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "monitoring_alert" ADD CONSTRAINT "monitoring_alert_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_alert" ADD CONSTRAINT "monitoring_alert_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_run" ADD CONSTRAINT "monitoring_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_alert_project_finding_uq" ON "monitoring_alert" USING btree ("project_id","finding_key");--> statement-breakpoint
CREATE INDEX "monitoring_alert_project_status_idx" ON "monitoring_alert" USING btree ("project_id","status","last_seen_at");--> statement-breakpoint
CREATE INDEX "monitoring_run_project_idx" ON "monitoring_run" USING btree ("project_id","created_at");