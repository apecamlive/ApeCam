CREATE TABLE "go_live_invites" (
	"address" text PRIMARY KEY NOT NULL,
	"note" text,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "go_live_invites" ADD CONSTRAINT "go_live_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;