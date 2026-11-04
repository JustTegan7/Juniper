// Single source of truth for the public site info (metadata, JSON-LD, footer, emails).
export const siteConfig = {
  businessName: "Juniper",
  tagline: "Online booking, team schedules and the time clock in one place. Built for salons, ready for any appointment business.",
  // Production domain (set up on Vercel). NEXT_PUBLIC_SITE_URL overrides it for previews.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://juniperbooking.com",
  parent: "Evergreen Digital Co.",
  parentUrl: "https://evergreendigitalco.com",

  phone: "",
  email: "tegan@evergreendigitalco.com",
  address: { street: "", city: "", state: "WA", postalCode: "" },
  serviceArea: [] as string[],

  social: {
    facebook: "",
    instagram: "",
    linkedin: "",
    x: "",
    tiktok: "",
    googleBusinessProfile: "",
  },

  defaultTitle: "Juniper | Booking and staff app for salons",
  titleTemplate: "%s | Juniper",
  defaultDescription: "Juniper gives salons and appointment businesses online booking, staff schedules, a time clock and time off requests, from Evergreen Digital Co.",
  ogImage: "/og-image.png",
  locale: "en_US",

  gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "",
};

export type SiteConfig = typeof siteConfig;
