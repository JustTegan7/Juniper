// Per-business settings and industry presets. Juniper starts with salons but
// works for any appointment business, so words like "Stylist" are data, not code.

import { z } from "zod";
import { WA_TIME_RULES } from "./timesheet";

export const INDUSTRIES = ["salon", "barber", "spa", "nails", "fitness", "wellness", "pet", "general", "retail"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export interface Vocabulary {
  staff: string;
  staffPlural: string;
  client: string;
  clientPlural: string;
  service: string;
  servicePlural: string;
  appointment: string;
  appointmentPlural: string;
}

const base: Vocabulary = {
  staff: "Staff member",
  staffPlural: "Staff",
  client: "Client",
  clientPlural: "Clients",
  service: "Service",
  servicePlural: "Services",
  appointment: "Appointment",
  appointmentPlural: "Appointments",
};

export interface IndustryPreset {
  label: string;
  vocabulary: Vocabulary;
  /** Settings a new business of this kind starts with. */
  settings?: Record<string, unknown>;
  /** Appointment screens (Today, Calendar, Services) are hidden. */
  noAppointments?: boolean;
  /** Starter menu offered when a business is created. Prices in cents, times in minutes. */
  starterServices: {
    category: string;
    name: string;
    activeBefore: number;
    processing?: number;
    activeAfter?: number;
    bufferAfter?: number;
    priceCents: number;
    priceFrom?: boolean;
  }[];
}

export const INDUSTRY_PRESETS: Record<Industry, IndustryPreset> = {
  salon: {
    label: "Hair salon",
    vocabulary: { ...base, staff: "Stylist", staffPlural: "Stylists" },
    starterServices: [
      { category: "Cuts", name: "Haircut and style", activeBefore: 45, priceCents: 6000, priceFrom: true },
      { category: "Cuts", name: "Bang trim", activeBefore: 15, priceCents: 1500 },
      { category: "Color", name: "Root touch up", activeBefore: 30, processing: 30, activeAfter: 30, priceCents: 9000, priceFrom: true },
      { category: "Color", name: "Full highlight", activeBefore: 75, processing: 30, activeAfter: 45, priceCents: 16000, priceFrom: true },
      { category: "Styling", name: "Blowout", activeBefore: 45, priceCents: 4500 },
    ],
  },
  barber: {
    label: "Barbershop",
    vocabulary: { ...base, staff: "Barber", staffPlural: "Barbers" },
    starterServices: [
      { category: "Cuts", name: "Haircut", activeBefore: 30, priceCents: 3500 },
      { category: "Cuts", name: "Haircut and beard", activeBefore: 45, priceCents: 5000 },
      { category: "Shave", name: "Hot towel shave", activeBefore: 30, priceCents: 4000 },
    ],
  },
  spa: {
    label: "Spa",
    vocabulary: { ...base, staff: "Therapist", staffPlural: "Therapists", client: "Guest", clientPlural: "Guests" },
    starterServices: [
      { category: "Massage", name: "Massage, 60 minutes", activeBefore: 60, bufferAfter: 15, priceCents: 11000 },
      { category: "Facials", name: "Signature facial", activeBefore: 60, bufferAfter: 15, priceCents: 9500 },
    ],
  },
  nails: {
    label: "Nail salon",
    vocabulary: { ...base, staff: "Nail tech", staffPlural: "Nail techs" },
    starterServices: [
      { category: "Hands", name: "Gel manicure", activeBefore: 45, priceCents: 4500 },
      { category: "Feet", name: "Pedicure", activeBefore: 50, priceCents: 5000 },
    ],
  },
  fitness: {
    label: "Fitness studio or trainer",
    vocabulary: { ...base, staff: "Trainer", staffPlural: "Trainers", service: "Session", servicePlural: "Sessions", appointment: "Session", appointmentPlural: "Sessions" },
    starterServices: [{ category: "Training", name: "Personal training, 60 minutes", activeBefore: 60, priceCents: 8000 }],
  },
  wellness: {
    label: "Wellness practice",
    vocabulary: { ...base, staff: "Practitioner", staffPlural: "Practitioners" },
    starterServices: [{ category: "Sessions", name: "Initial consultation", activeBefore: 60, priceCents: 9000 }],
  },
  pet: {
    label: "Pet grooming",
    vocabulary: { ...base, staff: "Groomer", staffPlural: "Groomers" },
    starterServices: [{ category: "Grooming", name: "Bath and brush", activeBefore: 60, priceCents: 6000, priceFrom: true }],
  },
  retail: {
    label: "Retail or online store (no appointments)",
    vocabulary: { ...base, client: "Customer", clientPlural: "Customers" },
    settings: { booking: { enabled: false }, shop: { enabled: true }, modules: { appointments: false, customers: false } },
    noAppointments: true,
    starterServices: [],
  },
  general: { label: "Other appointment business", vocabulary: base, starterServices: [] },
};

export function isIndustry(v: string): v is Industry {
  return (INDUSTRIES as readonly string[]).includes(v);
}

/** The words a business uses, falling back to its industry preset. */
export function vocabularyFor(industry: string, overrides: Partial<Vocabulary> | null | undefined): Vocabulary {
  const preset = isIndustry(industry) ? INDUSTRY_PRESETS[industry].vocabulary : base;
  const clean = Object.fromEntries(Object.entries(overrides ?? {}).filter(([, v]) => typeof v === "string" && v.trim()));
  return { ...preset, ...clean };
}

/** Business settings stored as JSON on the workspace. Parsing fills defaults so old rows keep working. */
export const workspaceSettingsSchema = z.object({
  vocabulary: z
    .object({
      staff: z.string().max(40),
      staffPlural: z.string().max(40),
      client: z.string().max(40),
      clientPlural: z.string().max(40),
      service: z.string().max(40),
      servicePlural: z.string().max(40),
      appointment: z.string().max(40),
      appointmentPlural: z.string().max(40),
    })
    .partial()
    .default({}),
  booking: z
    .object({
      enabled: z.boolean().default(true),
      /** Minutes between offered start times. */
      slotStep: z.number().int().min(5).max(120).default(15),
      minLeadMinutes: z.number().int().min(0).max(60 * 24 * 14).default(120),
      maxAdvanceDays: z.number().int().min(1).max(365).default(60),
      cancelWindowHours: z.number().int().min(0).max(24 * 14).default(24),
      /** Offer "Any available" so clients do not have to pick a person. */
      allowAnyStaff: z.boolean().default(true),
      /** Text shown before a client confirms (cancellation policy, parking, and so on). */
      policy: z.string().max(2000).default(""),
      /** Email new online bookings to the staff member. */
      notifyStaff: z.boolean().default(true),
      sendReminders: z.boolean().default(true),
    })
    .prefault({}),
  time: z
    .object({
      weeklyOvertimeAfter: z.number().int().min(0).max(10080).default(WA_TIME_RULES.weeklyOvertimeAfter),
      weekStartsOn: z.number().int().min(0).max(6).default(WA_TIME_RULES.weekStartsOn),
      mealRequiredAfter: z.number().int().min(0).max(1440).default(WA_TIME_RULES.mealRequiredAfter),
      mealMinMinutes: z.number().int().min(0).max(120).default(WA_TIME_RULES.mealMinMinutes),
      mealStartBy: z.number().int().min(0).max(1440).default(WA_TIME_RULES.mealStartBy),
      mealUnpaid: z.boolean().default(WA_TIME_RULES.mealUnpaid),
      trackRestBreaks: z.boolean().default(WA_TIME_RULES.trackRestBreaks),
      payPeriod: z.enum(["weekly", "biweekly", "semimonthly"]).default("biweekly"),
      /** Any first day of a pay period, for weekly and biweekly. */
      payPeriodAnchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-01-04"),
      /** Owners see estimated gross pay on timesheets. Needs pay rates on the Pay page. */
      showPayEstimates: z.boolean().default(false),
      /** Each person sees their own estimate on their timesheet. */
      employeesSeeOwnPay: z.boolean().default(false),
      /** Where employees manage direct deposit and paychecks, for example Gusto. Juniper never holds bank details. */
      payrollName: z.string().max(60).default(""),
      payrollUrl: z.string().max(300).refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "The payroll link must start with https://").default(""),
    })
    .prefault({}),
  /**
   * Which parts of Juniper a business sees. Left unset, a business gets its industry's default
   * (everything for appointment businesses, a store-only set for retail). Evergreen sets these
   * on the admin page. The Register, Products and Orders follow shop.enabled.
   */
  modules: z
    .object({
      /** Today, Calendar, Services and online booking. */
      appointments: z.boolean().optional(),
      /** The customer list. */
      customers: z.boolean().optional(),
      /** Time clock, Timesheets and Time off. */
      timeclock: z.boolean().optional(),
      /** Team chat. */
      messages: z.boolean().optional(),
    })
    .prefault({}),
  /** Register and online shop settings. */
  shop: z
    .object({
      /** Turns on Products and the Register. Off for businesses that only book appointments. */
      enabled: z.boolean().default(false),
      /** Public online shop at /shop/<slug>. Needs the shop on and Helcim connected. */
      onlineEnabled: z.boolean().default(false),
      /** Websites allowed to call the shop API from a browser, as origins like https://shop.example.com. */
      allowedOrigins: z.array(z.string().max(200).refine((v) => normalizeOrigin(v) !== null, "Website addresses must start with https://")).max(10).default([]),
      /** One flat shipping charge per online order that ships, in cents. */
      shippingFlatCents: z.number().int().min(0).max(100000).default(0),
      /** Sales tax added to product sales, in percent. Zero means no tax is added. */
      taxRatePercent: z.number().min(0).max(15).default(0),
    })
    .prefault({}),
  contact: z
    .object({
      phone: z.string().max(40).default(""),
      email: z.string().max(200).default(""),
      address: z.string().max(300).default(""),
      website: z.string().max(300).default(""),
    })
    .prefault({}),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export function parseSettings(raw: unknown): WorkspaceSettings {
  const r = workspaceSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : workspaceSettingsSchema.parse({});
}

/** Slugs used in public booking links (/b/barclays). */
export const RESERVED_SLUGS = new Set(["admin", "api", "app", "b", "book", "embed", "help", "join", "login", "new", "support", "www"]);

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "Use 2 to 40 letters, numbers or dashes")
  .refine((s) => !RESERVED_SLUGS.has(s), "That link name is reserved");

/** 6000 to "$60", 6050 to "$60.50". */
export function formatPrice(cents: number, from = false): string {
  const dollars = cents / 100;
  const s = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return from ? `${s}+` : s;
}

/** "$60.50" or "60" to 6050 / 6000 cents. Null when not a price. */
export function parsePrice(v: string): number | null {
  const clean = v.replace(/[$,\s]/g, "");
  if (!clean) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const APPOINTMENT_STATUSES = ["booked", "confirmed", "checked_in", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};
/** Statuses that hold a staff member's time. */
export const HOLDING_STATUSES: AppointmentStatus[] = ["booked", "confirmed", "checked_in", "completed"];

/** "https://Shop.Example.com/path" to "https://shop.example.com". Null unless it is https (or http on localhost). */
export function normalizeOrigin(v: string): string | null {
  try {
    const u = new URL(v.trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export interface Modules {
  appointments: boolean;
  customers: boolean;
  timeclock: boolean;
  messages: boolean;
  shop: boolean;
}

export const MODULE_LABELS: Record<keyof Modules, string> = {
  appointments: "Appointments (Today, Calendar, Services, online booking)",
  customers: "Customer list",
  timeclock: "Employee time (time clock, timesheets, time off)",
  messages: "Team chat",
  shop: "Store (Register, Products, Orders, online shop)",
};

/** What a business actually sees: its own choice, else its industry's default. */
export function modulesOf(template: string, settings: WorkspaceSettings): Modules {
  const retail = isRetail(template);
  return {
    appointments: settings.modules.appointments ?? !retail,
    customers: settings.modules.customers ?? !retail,
    timeclock: settings.modules.timeclock ?? true,
    messages: settings.modules.messages ?? true,
    shop: settings.shop.enabled,
  };
}

/** The first screen a person lands on, given what is turned on. */
export function homePath(m: Modules): string {
  if (m.appointments) return "/today";
  if (m.shop) return "/register";
  if (m.timeclock) return "/clock";
  if (m.messages) return "/messages";
  return "/more";
}

/** True for businesses that sell products and do not take appointments. */
export function isRetail(template: string): boolean {
  return isIndustry(template) && INDUSTRY_PRESETS[template].noAppointments === true;
}
