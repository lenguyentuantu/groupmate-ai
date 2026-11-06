ALTER TABLE "team_member" ADD COLUMN "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "weekly_availability_minutes" integer;--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "preferences" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_availability_check" CHECK ("team_member"."weekly_availability_minutes" BETWEEN 0 AND 10080);