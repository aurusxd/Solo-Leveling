CREATE TYPE "public"."created_by" AS ENUM('user', 'system', 'ai');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('quest_completed', 'quest_failed', 'exercise_logged', 'purchase', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('manual', 'cv', 'system', 'ai');--> statement-breakpoint
CREATE TYPE "public"."onboarding_phase" AS ENUM('questionnaire', 'calibration', 'active');--> statement-breakpoint
CREATE TYPE "public"."quest_status" AS ENUM('active', 'completed', 'failed', 'proposed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."quest_type" AS ENUM('exercise', 'learning', 'project', 'habit', 'other', 'boss');--> statement-breakpoint
CREATE TYPE "public"."stat" AS ENUM('strength', 'hp', 'agility', 'intelligence', 'stamina', 'discipline', 'perception');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('measured', 'self_reported', 'system');--> statement-breakpoint
CREATE TABLE "characters" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp_total" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"stat_points" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archetype" text DEFAULT 'novice' NOT NULL,
	"difficulty" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_session_id" uuid NOT NULL,
	"exercise" text NOT NULL,
	"reps" integer NOT NULL,
	"duration_sec" integer NOT NULL,
	"avg_confidence" real NOT NULL,
	"verification" "verification" NOT NULL,
	"event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stat" "stat" NOT NULL,
	"title" text NOT NULL,
	"weekly_target_points" integer NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"phase" "onboarding_phase" DEFAULT 'questionnaire' NOT NULL,
	"answers" jsonb,
	"calibration_started_at" timestamp with time zone,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "progress_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" "event_kind" NOT NULL,
	"source" "event_source" NOT NULL,
	"verification" "verification" NOT NULL,
	"xp_delta" integer DEFAULT 0 NOT NULL,
	"gold_delta" integer DEFAULT 0 NOT NULL,
	"stat_deltas" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_title" text NOT NULL,
	"price" integer NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "quest_type" NOT NULL,
	"status" "quest_status" DEFAULT 'active' NOT NULL,
	"criteria" jsonb NOT NULL,
	"reward" jsonb NOT NULL,
	"penalty" jsonb,
	"deadline_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_by" "created_by" DEFAULT 'user' NOT NULL,
	"template_key" text,
	"plan_date" date,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"window_days" integer NOT NULL,
	"report" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"camera_consent" boolean DEFAULT false NOT NULL,
	"camera_consent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"first_name" text NOT NULL,
	"language_code" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_event_id_progress_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."progress_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_profiles" ADD CONSTRAINT "onboarding_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_event_id_progress_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."progress_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_snapshots" ADD CONSTRAINT "signal_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_sessions_user_client_uq" ON "exercise_sessions" USING btree ("user_id","client_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_user_stat_uq" ON "goals" USING btree ("user_id","stat");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_events_user_idem_uq" ON "progress_events" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "progress_events_user_created_idx" ON "progress_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "quests_user_status_idx" ON "quests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "quests_deadline_idx" ON "quests" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quests_plan_uq" ON "quests" USING btree ("user_id","template_key","plan_date");--> statement-breakpoint
CREATE INDEX "signal_snapshots_user_idx" ON "signal_snapshots" USING btree ("user_id","computed_at");