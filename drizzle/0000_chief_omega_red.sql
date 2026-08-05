CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"open_id" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone,
	"scope" text,
	"can_post_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_id" uuid,
	"template" text DEFAULT 'viral' NOT NULL,
	"title" text NOT NULL,
	"hook" text NOT NULL,
	"scenes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"ref_id" uuid,
	"message" text,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'creative_center' NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"country" text DEFAULT 'BR' NOT NULL,
	"category" text,
	"score" real DEFAULT 0 NOT NULL,
	"rank" integer,
	"post_count" integer,
	"view_count" integer,
	"growth_rate" real,
	"raw" jsonb,
	"history" jsonb DEFAULT '[]'::jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trends_unique" UNIQUE("source","kind","name","country")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"video_url" text,
	"video_key" text,
	"thumb_url" text,
	"thumb_key" text,
	"duration_seconds" real,
	"size_bytes" integer,
	"caption" text DEFAULT '' NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"privacy_level" text DEFAULT 'SELF_ONLY' NOT NULL,
	"tiktok_publish_id" text,
	"tiktok_post_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rendered_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_status_idx" ON "ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_started_idx" ON "jobs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "trends_score_idx" ON "trends" USING btree ("score");--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("status");