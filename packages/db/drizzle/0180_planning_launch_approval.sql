CREATE TABLE "planning_approval" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"draft_id" integer NOT NULL,
	"source_version" integer NOT NULL,
	"proposal_id" integer NOT NULL,
	"proposal_version" integer NOT NULL,
	"intent_id" uuid NOT NULL,
	"approved_by_user_id" text,
	"approved_by_actor_id" text NOT NULL,
	"approved_by_actor_name" text NOT NULL,
	"acknowledged_risk_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"baseline" jsonb NOT NULL,
	"work_item_mappings" jsonb NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_approval_intent_id_unique" UNIQUE("intent_id"),
	CONSTRAINT "planning_approval_versions_check" CHECK ("planning_approval"."source_version" > 0 AND "planning_approval"."proposal_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "planning_approval" ADD CONSTRAINT "planning_approval_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_approval" ADD CONSTRAINT "planning_approval_draft_id_planning_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."planning_draft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_approval" ADD CONSTRAINT "planning_approval_proposal_id_planning_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."planning_proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_approval" ADD CONSTRAINT "planning_approval_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planning_approval_wbs_revision_uq" ON "planning_approval" USING btree ("project_id","draft_id","source_version");--> statement-breakpoint
CREATE INDEX "planning_approval_project_idx" ON "planning_approval" USING btree ("project_id","approved_at");