CREATE TABLE "planning_proposal" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" integer NOT NULL,
	"source_version" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"created_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_proposal_draft_id_unique" UNIQUE("draft_id")
);
--> statement-breakpoint
ALTER TABLE "planning_proposal" ADD CONSTRAINT "planning_proposal_draft_id_planning_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."planning_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_proposal" ADD CONSTRAINT "planning_proposal_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;