import { describe, expect, it } from "vitest";
import { emptyToday, price, statusActions } from "./format";

const vocab = { staff: "Stylist", staffPlural: "Stylists", client: "Client", clientPlural: "Clients", service: "Service", servicePlural: "Services", appointment: "Appointment", appointmentPlural: "Appointments" };

describe("statusActions", () => {
  it("offers the next steps for each status, with cancel last", () => {
    expect(statusActions("booked").map((a) => a.status)).toEqual(["confirmed", "checked_in", "no_show", "cancelled"]);
    expect(statusActions("confirmed").map((a) => a.status)).toEqual(["checked_in", "no_show", "cancelled"]);
    expect(statusActions("checked_in").map((a) => a.status)).toEqual(["completed", "no_show", "cancelled"]);
  });

  it("offers nothing once an appointment is finished", () => {
    for (const s of ["completed", "cancelled", "no_show"] as const) expect(statusActions(s)).toEqual([]);
  });

  it("marks only cancel as destructive", () => {
    const all = (["booked", "confirmed", "checked_in"] as const).flatMap(statusActions);
    expect(all.filter((a) => a.destructive).every((a) => a.status === "cancelled")).toBe(true);
  });
});

describe("display text", () => {
  it("uses the business's own words", () => {
    expect(emptyToday(vocab, "mine")).toBe("No appointments for you today.");
    expect(emptyToday({ ...vocab, appointmentPlural: "Sessions" }, "all")).toBe("No sessions on the calendar today.");
  });

  it("formats prices", () => {
    expect(price(6500)).toBe("$65");
    expect(price(6550)).toBe("$65.50");
  });
});
