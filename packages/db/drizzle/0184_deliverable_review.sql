CREATE TABLE "deliverable_submission" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"issue_id" integer NOT NULL,
	"version" integer NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"submitted_by_user_id" text,
	"submitted_by_actor_id" text NOT NULL,
	"submitted_by_actor_name" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_status" text DEFAULT 'not_requested' NOT NULL,
	"review_attempt_count" integer DEFAULT 0 NOT NULL,
	"review_requested_by_user_id" text,
	"review_started_at" timestamp with time zone,
	"review_result" jsonb,
	"review_model" text,
	"reviewed_at" timestamp with time zone,
	"review_error" text,
	"decision" text,
	"decision_comment" text,
	"decided_by_user_id" text,
	"decided_by_actor_id" text,
	"decided_by_actor_name" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "deliverable_submission_version_check" CHECK ("deliverable_submission"."version" > 0),
	CONSTRAINT "deliverable_submission_review_status_check" CHECK ("deliverable_submission"."review_status" IN ('not_requested', 'pending', 'completed', 'failed')),
	CONSTRAINT "deliverable_submission_review_attempt_check" CHECK ("deliverable_submission"."review_attempt_count" >= 0 AND "deliverable_submission"."review_attempt_count" <= 3),
	CONSTRAINT "deliverable_submission_decision_check" CHECK ("deliverable_submission"."decision" IS NULL OR "deliverable_submission"."decision" IN ('ACCEPT', 'REQUEST_REVISION'))
);
--> statement-breakpoint
ALTER TABLE "deliverable_submission" ADD CONSTRAINT "deliverable_submission_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_submission" ADD CONSTRAINT "deliverable_submission_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_submission" ADD CONSTRAINT "deliverable_submission_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_submission" ADD CONSTRAINT "deliverable_submission_review_requested_by_user_id_user_id_fk" FOREIGN KEY ("review_requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_submission" ADD CONSTRAINT "deliverable_submission_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_submission_issue_version_uq" ON "deliverable_submission" USING btree ("issue_id","version");--> statement-breakpoint
CREATE INDEX "deliverable_submission_issue_idx" ON "deliverable_submission" USING btree ("issue_id","submitted_at");--> statement-breakpoint
CREATE INDEX "deliverable_submission_project_idx" ON "deliverable_submission" USING btree ("project_id","submitted_at");--> statement-breakpoint
CREATE TRIGGER deliverable_submission_rev AFTER INSERT OR UPDATE OR DELETE ON deliverable_submission
  FOR EACH ROW EXECUTE FUNCTION rev_issue_child('issue_id', 'detail');
