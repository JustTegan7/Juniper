CREATE TYPE "public"."pay_type" AS ENUM('hourly', 'salary');--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "pay_type" "pay_type";--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "pay_rate_cents" integer;