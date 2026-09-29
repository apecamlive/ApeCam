CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "burns" (
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"from_address" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"usd_value" numeric,
	"final" boolean DEFAULT false NOT NULL,
	"burned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "burns_tx_hash_log_index_pk" PRIMARY KEY("tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "buybacks" (
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"apecam_amount" numeric(78, 0) NOT NULL,
	"spent_amount" numeric(78, 0) NOT NULL,
	"spent_asset" text NOT NULL,
	"usd_value" numeric,
	"avg_price_usd" numeric,
	"final" boolean DEFAULT false NOT NULL,
	"bought_at" timestamp with time zone NOT NULL,
	CONSTRAINT "buybacks_tx_hash_log_index_pk" PRIMARY KEY("tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stream_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stream_id" uuid,
	"wallet_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"raw_balance" numeric(78, 0) NOT NULL,
	"price_usd" numeric NOT NULL,
	"usd_value" numeric NOT NULL,
	"passed" boolean NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"total_apecam" numeric(78, 0) NOT NULL,
	"scale_factor" numeric DEFAULT '1' NOT NULL,
	"status" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"reason" text,
	"snapshot_url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_one_per_user" UNIQUE("stream_id","reporter_user_id")
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" date NOT NULL,
	"valid_minutes" integer NOT NULL,
	"apecam_amount" numeric(78, 0) NOT NULL,
	"scale_factor" numeric DEFAULT '1' NOT NULL,
	"status" text NOT NULL,
	"payout_batch_id" uuid,
	"payout_wallet" text,
	"payout_tx_hash" text,
	"paid_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "rewards_user_period" UNIQUE("user_id","period")
);
--> statement-breakpoint
CREATE TABLE "stream_minutes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stream_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"minute_at" timestamp with time zone NOT NULL,
	"viewers" integer NOT NULL,
	"holding_ok" boolean NOT NULL,
	"viewers_ok" boolean NOT NULL,
	"video_ok" boolean NOT NULL,
	"no_report_ok" boolean NOT NULL,
	"valid" boolean NOT NULL,
	CONSTRAINT "stream_minutes_stream_minute" UNIQUE("stream_id","minute_at")
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"end_reason" text,
	"livekit_room" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"current_viewers" integer DEFAULT 0 NOT NULL,
	"peak_viewers" integer DEFAULT 0 NOT NULL,
	"blurred" boolean DEFAULT false NOT NULL,
	"thumbnail_url" text,
	"last_frame_ok_at" timestamp with time zone,
	"warning_until" timestamp with time zone,
	"rpc_failures" integer DEFAULT 0 NOT NULL,
	"egress_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streams_livekit_room_unique" UNIQUE("livekit_room")
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" text NOT NULL,
	"contract" text NOT NULL,
	"ticker" text,
	"name" text,
	"logo_url" text,
	"logo_source" text,
	"decimals" integer,
	"price_usd" numeric,
	"market_cap_usd" numeric,
	"change_24h" numeric,
	"liquidity_usd" numeric,
	"volume_24h_usd" numeric,
	"price_updated_at" timestamp with time zone,
	"buy_url" text,
	"chart_url" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_chain_contract" UNIQUE("chain","contract")
);
--> statement-breakpoint
CREATE TABLE "treasury_transfers" (
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"to_address" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"matched_reward_ids" uuid[],
	CONSTRAINT "treasury_transfers_tx_hash_log_index_pk" PRIMARY KEY("tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_family" text NOT NULL,
	"address" text NOT NULL,
	"source" text DEFAULT 'external' NOT NULL,
	"is_payout" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wallets_family_address" UNIQUE("chain_family","address")
);
--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_checks" ADD CONSTRAINT "holding_checks_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_checks" ADD CONSTRAINT "holding_checks_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_checks" ADD CONSTRAINT "holding_checks_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_actions" ADD CONSTRAINT "mod_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_payout_batch_id_payout_batches_id_fk" FOREIGN KEY ("payout_batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_minutes" ADD CONSTRAINT "stream_minutes_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_minutes" ADD CONSTRAINT "stream_minutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_minutes" ADD CONSTRAINT "stream_minutes_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_stream" ON "chat_messages" USING btree ("stream_id","created_at");--> statement-breakpoint
CREATE INDEX "holding_checks_stream" ON "holding_checks" USING btree ("stream_id","checked_at");--> statement-breakpoint
CREATE INDEX "reports_open" ON "reports" USING btree ("status","created_at") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "stream_minutes_user_day" ON "stream_minutes" USING btree ("user_id","minute_at") WHERE "stream_minutes"."valid";--> statement-breakpoint
CREATE UNIQUE INDEX "streams_one_active_per_wallet" ON "streams" USING btree ("wallet_id") WHERE "streams"."status" in ('starting','live');--> statement-breakpoint
CREATE INDEX "streams_live" ON "streams" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "streams_token" ON "streams" USING btree ("token_id","status");--> statement-breakpoint
CREATE INDEX "streams_user" ON "streams" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "tokens_ticker_trgm" ON "tokens" USING gin ("ticker" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_one_payout" ON "wallets" USING btree ("user_id") WHERE "wallets"."is_payout";--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_one_embedded" ON "wallets" USING btree ("user_id") WHERE "wallets"."source" = 'embedded';