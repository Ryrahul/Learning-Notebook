CREATE TABLE "access_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"user_agent" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "access_request_status_created_idx" ON "access_request" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "access_request_token_idx" ON "access_request" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE INDEX "access_request_email_idx" ON "access_request" USING btree ("email");