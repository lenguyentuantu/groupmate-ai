CREATE TABLE "planning_draft" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_draft_revision" (
	"draft_id" integer NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_draft_revision_draft_id_version_pk" PRIMARY KEY("draft_id","version")
);
--> statement-breakpoint
ALTER TABLE "planning_draft" ADD CONSTRAINT "planning_draft_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_draft_revision" ADD CONSTRAINT "planning_draft_revision_draft_id_planning_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."planning_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_draft_revision" ADD CONSTRAINT "planning_draft_revision_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_draft_project_idx" ON "planning_draft" USING btree ("project_id");