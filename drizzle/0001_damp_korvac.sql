CREATE TABLE "affiliate_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"url" text,
	"image_url" text,
	"price_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"commission_rate" real,
	"commission_cents" integer,
	"score" real DEFAULT 0 NOT NULL,
	"rating" real,
	"review_count" integer,
	"sales_rank" integer,
	"operating" boolean DEFAULT false NOT NULL,
	"operating_since" timestamp with time zone,
	"notes" text,
	"raw" jsonb,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_products_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"product_external_id" text,
	"product_name" text DEFAULT '' NOT NULL,
	"category" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"amount_usd_cents" integer,
	"usd_rate" real,
	"occurred_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	CONSTRAINT "commissions_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE INDEX "affiliate_products_score_idx" ON "affiliate_products" USING btree ("score");--> statement-breakpoint
CREATE INDEX "affiliate_products_operating_idx" ON "affiliate_products" USING btree ("operating");--> statement-breakpoint
CREATE INDEX "commissions_occurred_idx" ON "commissions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "commissions_source_idx" ON "commissions" USING btree ("source");