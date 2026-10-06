CREATE TYPE "public"."category" AS ENUM('HOSTEL', 'ARCADE', 'RESIDENTIAL', 'FLEXI_STAY');--> statement-breakpoint
CREATE TYPE "public"."price_cycle" AS ENUM('PER_DAY', 'PER_MONTH', 'PER_SEMESTER');--> statement-breakpoint
CREATE TYPE "public"."flag_kind" AS ENUM('USER_REPORT', 'DUPLICATE_MEDIA', 'NON_RESPONSIVE', 'CANCELLATION_DISPUTE');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('PENDING_PAYMENT', 'HELD', 'CONFIRMED', 'REFUNDED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."landlord_status" AS ENUM('NONE', 'PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('MOBILE_MONEY_CLEARING', 'ESCROW', 'LANDLORD_PAYABLE', 'PLATFORM_REVENUE', 'PAYOUT_CLEARING', 'REFUND_CLEARING');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('PHOTO', 'VIDEO', 'TOUR_360', 'FLOOR_PLAN');--> statement-breakpoint
CREATE TYPE "public"."network" AS ENUM('MTN', 'AIRTEL');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESSFUL', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payout_method" AS ENUM('MTN', 'AIRTEL', 'BANK');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('SEEKER', 'LANDLORD', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('VACANT', 'RESERVED', 'OCCUPIED', 'UNLISTED');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'DECLINED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."water_setup" AS ENUM('NWSC', 'GRAVITY_TANK', 'BOTH', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."yaka_setup" AS ENUM('PRIVATE', 'SHARED', 'INCLUSIVE', 'NONE');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "flag_kind" NOT NULL,
	"property_id" uuid,
	"hold_id" uuid,
	"reporter_id" uuid,
	"reason" text NOT NULL,
	"status" "flag_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"amount_ugx" integer NOT NULL,
	"commission_ugx" integer NOT NULL,
	"status" "hold_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_deadline" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"held_until" timestamp with time zone,
	"move_in_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landlord_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"nin_hash" text NOT NULL,
	"nin_last4" text NOT NULL,
	"nin_photo_url" text NOT NULL,
	"selfie_url" text NOT NULL,
	"authority_doc_url" text NOT NULL,
	"status" "landlord_status" DEFAULT 'PENDING' NOT NULL,
	"reviewer_id" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_group" uuid NOT NULL,
	"account" "ledger_account" NOT NULL,
	"owner_id" uuid,
	"amount" integer NOT NULL,
	"hold_id" uuid,
	"payout_id" uuid,
	"memo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" "media_kind" DEFAULT 'PHOTO' NOT NULL,
	"url" text NOT NULL,
	"public_id" text,
	"checksum" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"body" text NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hold_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"tx_ref" text NOT NULL,
	"provider_ref" text,
	"amount_ugx" integer NOT NULL,
	"msisdn" text NOT NULL,
	"network" "network" NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"failure_text" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tx_ref_unique" UNIQUE("tx_ref")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"amount_ugx" integer NOT NULL,
	"method" "payout_method" NOT NULL,
	"destination" text NOT NULL,
	"status" "payout_status" DEFAULT 'REQUESTED' NOT NULL,
	"reviewed_by_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "category" NOT NULL,
	"district" text NOT NULL,
	"suburb" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"description" text DEFAULT '' NOT NULL,
	"yaka" "yaka_setup" DEFAULT 'PRIVATE' NOT NULL,
	"water" "water_setup" DEFAULT 'NWSC' NOT NULL,
	"security" text[] DEFAULT '{}'::text[] NOT NULL,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "property_status" DEFAULT 'DRAFT' NOT NULL,
	"review_note" text,
	"featured_until" timestamp with time zone,
	"rating_avg" double precision DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"min_price_ugx" integer,
	"vacant_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rent_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"old_rent_ugx" integer NOT NULL,
	"new_rent_ugx" integer NOT NULL,
	"notice_given" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"hold_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_hold_id_unique" UNIQUE("hold_id")
);
--> statement-breakpoint
CREATE TABLE "saved_spaces" (
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_spaces_user_id_property_id_pk" PRIMARY KEY("user_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tenancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hold_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"landlord_id" uuid NOT NULL,
	"rent_ugx" integer NOT NULL,
	"cycle" "price_cycle" NOT NULL,
	"deposit_ugx" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"requires_written" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenancies_hold_id_unique" UNIQUE("hold_id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"label" text NOT NULL,
	"price_ugx" integer NOT NULL,
	"cycle" "price_cycle" NOT NULL,
	"deposit_ugx" integer NOT NULL,
	"size_sqft" integer,
	"beds" integer,
	"status" "unit_status" DEFAULT 'VACANT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'SEEKER' NOT NULL,
	"landlord_status" "landlord_status" DEFAULT 'NONE' NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "visit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"proposed_slot" timestamp with time zone,
	"note" text,
	"status" "visit_status" DEFAULT 'REQUESTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_verifications" ADD CONSTRAINT "landlord_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_verifications" ADD CONSTRAINT "landlord_verifications_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_landlord_id_users_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_changes" ADD CONSTRAINT "rent_changes_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_spaces" ADD CONSTRAINT "saved_spaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_spaces" ADD CONSTRAINT "saved_spaces_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_tenant_id_users_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_landlord_id_users_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "flag_status_idx" ON "flags" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_hold_per_unit" ON "holds" USING btree ("unit_id") WHERE status in ('PENDING_PAYMENT','HELD');--> statement-breakpoint
CREATE INDEX "hold_seeker_idx" ON "holds" USING btree ("seeker_id","created_at");--> statement-breakpoint
CREATE INDEX "hold_deadline_idx" ON "holds" USING btree ("status","payment_deadline");--> statement-breakpoint
CREATE INDEX "hold_held_until_idx" ON "holds" USING btree ("status","held_until");--> statement-breakpoint
CREATE INDEX "lv_status_idx" ON "landlord_verifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "lv_nin_idx" ON "landlord_verifications" USING btree ("nin_hash");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger_entries" USING btree ("account","owner_id");--> statement-breakpoint
CREATE INDEX "ledger_group_idx" ON "ledger_entries" USING btree ("tx_group");--> statement-breakpoint
CREATE INDEX "ledger_hold_idx" ON "ledger_entries" USING btree ("hold_id");--> statement-breakpoint
CREATE INDEX "media_prop_idx" ON "media" USING btree ("property_id","position");--> statement-breakpoint
CREATE INDEX "media_checksum_idx" ON "media" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "payment_hold_idx" ON "payments" USING btree ("hold_id");--> statement-breakpoint
CREATE INDEX "payout_status_idx" ON "payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payout_landlord_idx" ON "payouts" USING btree ("landlord_id","created_at");--> statement-breakpoint
CREATE INDEX "prop_search_idx" ON "properties" USING btree ("status","category","suburb");--> statement-breakpoint
CREATE INDEX "prop_price_idx" ON "properties" USING btree ("status","min_price_ugx");--> statement-breakpoint
CREATE INDEX "prop_owner_idx" ON "properties" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "rent_change_idx" ON "rent_changes" USING btree ("tenancy_id","effective_at");--> statement-breakpoint
CREATE INDEX "review_prop_idx" ON "reviews" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenancy_unit_idx" ON "tenancies" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "tenancy_tenant_idx" ON "tenancies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenancy_landlord_idx" ON "tenancies" USING btree ("landlord_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_label_uq" ON "units" USING btree ("property_id","label");--> statement-breakpoint
CREATE INDEX "unit_status_idx" ON "units" USING btree ("status","price_ugx");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_dedupe_uq" ON "visit_requests" USING btree ("unit_id","seeker_id","slot_start");--> statement-breakpoint
CREATE INDEX "visit_unit_idx" ON "visit_requests" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX "visit_seeker_idx" ON "visit_requests" USING btree ("seeker_id","created_at");