// Single source of truth for the public site info (metadata, JSON-LD, footer, emails).
// TEMPLATE: change every value here first when starting a new app.
export const siteConfig = {
  businessName: "Your App",
  tagline: "One line about what this app does.",
  url: "https://example.com",
  parent: "Evergreen Digital Co.",
  parentUrl: "https://evergreendigitalco.com",

  phone: "",
  email: "",
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

  defaultTitle: "Your App",
  titleTemplate: "%s | Your App",
  defaultDescription: "A web app from Evergreen Digital Co.",
  ogImage: "/og-image.png",
  locale: "en_US",

  gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "",
};

export type SiteConfig = typeof siteConfig;
