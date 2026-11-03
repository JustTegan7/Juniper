-- Guards the database itself enforces, so a race between two requests can never
-- double book a staff member or leave someone clocked in twice.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointment_segments" ADD CONSTRAINT "appointment_segments_no_overlap"
  EXCLUDE USING gist ("membership_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE (NOT "allow_overlap");
--> statement-breakpoint
ALTER TABLE "appointment_segments" ADD CONSTRAINT "appointment_segments_valid" CHECK ("ends_at" > "starts_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_open" ON "time_entries" ("membership_id") WHERE "clock_out" IS NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "time_breaks_one_open" ON "time_breaks" ("entry_id") WHERE "ends_at" IS NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_valid" CHECK ("clock_out" IS NULL OR "clock_out" >= "clock_in");
--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_valid" CHECK ("ends_at" > "starts_at");
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_timing_valid" CHECK ("active_before" >= 0 AND "processing" >= 0 AND "active_after" >= 0 AND "buffer_after" >= 0 AND "active_before" + "processing" + "active_after" > 0);
