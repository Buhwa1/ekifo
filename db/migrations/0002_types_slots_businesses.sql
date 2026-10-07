CREATE TYPE "public"."booking_mode" AS ENUM('LEASE', 'SLOT');--> statement-breakpoint
CREATE TYPE "public"."business_status" AS ENUM('PENDING', 'PUBLISHED', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."property_group" AS ENUM('STAY', 'BUSINESS', 'LEISURE');--> statement-breakpoint
ALTER TYPE "public"."price_cycle" ADD VALUE 'PER_HOUR';--> statement-breakpoint
ALTER TYPE "public"."price_cycle" ADD VALUE 'PER_EVENT_SLOT';--> statement-breakpoint
ALTER TYPE "public"."unit_status" ADD VALUE 'MAINTENANCE';--> statement-breakpoint
ALTER TYPE "public"."unit_status" ADD VALUE 'UNDER_CONSTRUCTION';--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_id" uuid,
	"unit_label" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"phone" text,
	"whatsapp" text,
	"instagram" text,
	"facebook" text,
	"tiktok" text,
	"website" text,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"hours" text,
	"status" "business_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "property_types" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plural" text NOT NULL,
	"group" "property_group" NOT NULL,
	"booking_mode" "booking_mode" DEFAULT 'LEASE' NOT NULL,
	"cycles" text[] NOT NULL,
	"can_have_children" boolean DEFAULT false NOT NULL,
	"can_be_child" boolean DEFAULT false NOT NULL,
	"unit_noun" text DEFAULT 'Unit' NOT NULL,
	"icon" text DEFAULT 'building' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "one_active_hold_per_unit";--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "open_from" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "open_to" integer DEFAULT 23 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "biz_property_idx" ON "businesses" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "biz_status_idx" ON "businesses" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "biz_owner_idx" ON "businesses" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_type_property_types_slug_fk" FOREIGN KEY ("type") REFERENCES "public"."property_types"("slug") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_parent_id_properties_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hold_slot_idx" ON "holds" USING btree ("unit_id","starts_at");--> statement-breakpoint
CREATE INDEX "prop_type_idx" ON "properties" USING btree ("status","type","suburb");--> statement-breakpoint
CREATE INDEX "prop_parent_idx" ON "properties" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_hold_per_unit" ON "holds" USING btree ("unit_id") WHERE status in ('PENDING_PAYMENT','HELD') and starts_at is null;