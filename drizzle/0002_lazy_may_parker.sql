ALTER TABLE "notebook" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "notebook" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "notebook" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notebook" ADD CONSTRAINT "notebook_share_token_unique" UNIQUE("share_token");