DO $$ BEGIN
 CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."favorite_entity_type" AS ENUM('team', 'league');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'live', 'final', 'suspended', 'postponed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "league" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"external_ids" jsonb,
	"name" text NOT NULL,
	"country" text,
	"logo_url" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"quarter_duration_mins" integer NOT NULL,
	"ot_duration_mins" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider_ref" text,
	"label" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"external_ids" jsonb,
	"team_id" uuid,
	"full_name" text NOT NULL,
	"position" text,
	"jersey_number" integer,
	"height_cm" integer,
	"weight_kg" integer,
	"country" text,
	"photo_url" text,
	"canonical_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"external_ids" jsonb,
	"name" text NOT NULL,
	"short_name" text,
	"code" text,
	"logo_url" text,
	"country" text,
	"canonical_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_season" (
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"conference" text,
	"group_name" text,
	CONSTRAINT "team_season_team_id_season_id_pk" PRIMARY KEY("team_id","season_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"external_ids" jsonb,
	"season_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"tipoff_at" timestamp with time zone NOT NULL,
	"status" "game_status" DEFAULT 'scheduled' NOT NULL,
	"period" integer,
	"clock" text,
	"home_score" integer DEFAULT 0 NOT NULL,
	"away_score" integer DEFAULT 0 NOT NULL,
	"period_scores" jsonb,
	"venue" text,
	"stats_synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_game_stat" (
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"seconds_played" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"rebounds_off" integer DEFAULT 0 NOT NULL,
	"rebounds_def" integer DEFAULT 0 NOT NULL,
	"steals" integer DEFAULT 0 NOT NULL,
	"blocks" integer DEFAULT 0 NOT NULL,
	"turnovers" integer DEFAULT 0 NOT NULL,
	"fouls" integer DEFAULT 0 NOT NULL,
	"fg_made" integer DEFAULT 0 NOT NULL,
	"fg_att" integer DEFAULT 0 NOT NULL,
	"three_made" integer DEFAULT 0 NOT NULL,
	"three_att" integer DEFAULT 0 NOT NULL,
	"ft_made" integer DEFAULT 0 NOT NULL,
	"ft_att" integer DEFAULT 0 NOT NULL,
	"plus_minus" integer,
	"is_starter" boolean DEFAULT false NOT NULL,
	CONSTRAINT "player_game_stat_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "standing" (
	"season_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"win_pct" numeric(5, 3) DEFAULT '0' NOT NULL,
	"points_for" integer DEFAULT 0 NOT NULL,
	"points_against" integer DEFAULT 0 NOT NULL,
	"streak" text,
	"games_behind" numeric(5, 1),
	"conference" text,
	"group_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standing_season_id_team_id_pk" PRIMARY KEY("season_id","team_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_game_stat" (
	"game_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"rebounds_off" integer DEFAULT 0 NOT NULL,
	"rebounds_def" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"steals" integer DEFAULT 0 NOT NULL,
	"blocks" integer DEFAULT 0 NOT NULL,
	"turnovers" integer DEFAULT 0 NOT NULL,
	"fouls" integer DEFAULT 0 NOT NULL,
	"fg_made" integer DEFAULT 0 NOT NULL,
	"fg_att" integer DEFAULT 0 NOT NULL,
	"three_made" integer DEFAULT 0 NOT NULL,
	"three_att" integer DEFAULT 0 NOT NULL,
	"ft_made" integer DEFAULT 0 NOT NULL,
	"ft_att" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "team_game_stat_game_id_team_id_pk" PRIMARY KEY("game_id","team_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"push_token" text,
	"platform" "device_platform" NOT NULL,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_push_token_unique" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "favorite" (
	"device_id" uuid NOT NULL,
	"entity_type" "favorite_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_device_id_entity_type_entity_id_pk" PRIMARY KEY("device_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "play_by_play" (
	"game_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"period" integer NOT NULL,
	"clock" text,
	"event_type" text NOT NULL,
	"team_id" uuid,
	"player_id" uuid,
	"detail" jsonb,
	CONSTRAINT "play_by_play_game_id_seq_pk" PRIMARY KEY("game_id","seq")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "season" ADD CONSTRAINT "season_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player" ADD CONSTRAINT "player_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player" ADD CONSTRAINT "player_canonical_id_player_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team" ADD CONSTRAINT "team_canonical_id_team_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_season" ADD CONSTRAINT "team_season_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_season" ADD CONSTRAINT "team_season_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game" ADD CONSTRAINT "game_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game" ADD CONSTRAINT "game_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game" ADD CONSTRAINT "game_home_team_id_team_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game" ADD CONSTRAINT "game_away_team_id_team_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_game_stat" ADD CONSTRAINT "player_game_stat_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_game_stat" ADD CONSTRAINT "player_game_stat_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_game_stat" ADD CONSTRAINT "player_game_stat_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "standing" ADD CONSTRAINT "standing_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "standing" ADD CONSTRAINT "standing_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_game_stat" ADD CONSTRAINT "team_game_stat_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_game_stat" ADD CONSTRAINT "team_game_stat_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorite" ADD CONSTRAINT "favorite_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "play_by_play" ADD CONSTRAINT "play_by_play_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "play_by_play" ADD CONSTRAINT "play_by_play_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "play_by_play" ADD CONSTRAINT "play_by_play_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "league_provider_ref_unique" ON "league" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_league_id_idx" ON "season" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "player_provider_ref_unique" ON "player" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_team_id_idx" ON "player" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_provider_ref_unique" ON "team" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game_provider_ref_unique" ON "game" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_league_id_tipoff_at_idx" ON "game" USING btree ("league_id","tipoff_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_home_team_id_tipoff_at_idx" ON "game" USING btree ("home_team_id","tipoff_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_away_team_id_tipoff_at_idx" ON "game" USING btree ("away_team_id","tipoff_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_live_status_idx" ON "game" USING btree ("status") WHERE "game"."status" = 'live';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_game_stat_team_id_idx" ON "player_game_stat" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "favorite_entity_type_entity_id_idx" ON "favorite" USING btree ("entity_type","entity_id");