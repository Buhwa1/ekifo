DROP INDEX "prop_search_idx";--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN "category";--> statement-breakpoint
DROP TYPE "public"."category";