ALTER TABLE "issue" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "readiness_cycle" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "readiness_assignee_user_id" text;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_readiness_assignee_user_id_user_id_fk" FOREIGN KEY ("readiness_assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_ready_idx" ON "issue" USING btree ("project_id","ready_at") WHERE "issue"."ready_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_type_check";--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_type_check" CHECK ("notification"."type" IN ('assigned', 'mentioned', 'commented', 'state_changed', 'monitoring', 'ready', 'reminder', 'escalation'));
