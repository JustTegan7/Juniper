import { describe, expect, it } from "vitest";
import {
  destinationFor,
  isExpoPushToken,
  MISSING_PROJECT_ID_MESSAGE,
  needsRegistration,
  parsePushData,
  permissionView,
  refreshTopic,
  registrationPayload,
  resolveProjectId,
  settingRows,
} from "./push";

const TOKEN = "ExponentPushToken[abcDEF123456xyz]";
const vocab = {
  staff: "Stylist",
  staffPlural: "Stylists",
  client: "Client",
  clientPlural: "Clients",
  service: "Service",
  servicePlural: "Services",
  appointment: "Appointment",
  appointmentPlural: "Appointments",
};

describe("registrationPayload", () => {
  it("accepts Expo push tokens on ios and android", () => {
    expect(registrationPayload(TOKEN, "ios")).toEqual({
      token: TOKEN,
      platform: "ios",
    });
    expect(registrationPayload(` ${TOKEN} `, "android")).toEqual({
      token: TOKEN,
      platform: "android",
    });
    expect(
      registrationPayload("ExpoPushToken[abcdefgh1234]", "ios"),
    ).not.toBeNull();
  });
  it("rejects anything else", () => {
    expect(registrationPayload("", "ios")).toBeNull();
    expect(registrationPayload("fcm:abc", "ios")).toBeNull();
    expect(registrationPayload(undefined, "ios")).toBeNull();
    expect(registrationPayload(TOKEN, "web")).toBeNull();
    expect(isExpoPushToken("ExponentPushToken[short]")).toBe(false);
  });
});

describe("needsRegistration", () => {
  const base = { token: TOKEN, workspaceId: "w1", membershipId: "m1" };
  it("registers the first time", () =>
    expect(needsRegistration(null, base)).toBe(true));
  it("skips a repeat", () =>
    expect(needsRegistration(base, { ...base })).toBe(false));
  it("registers again for a new token, business or person", () => {
    expect(
      needsRegistration(base, {
        ...base,
        token: "ExponentPushToken[another1234567]",
      }),
    ).toBe(true);
    expect(needsRegistration(base, { ...base, workspaceId: "w2" })).toBe(true);
    expect(needsRegistration(base, { ...base, membershipId: "m2" })).toBe(true);
  });
});

describe("resolveProjectId", () => {
  it("takes the first usable value, trimmed", () => {
    expect(resolveProjectId(undefined, null, "  abc-123 ", "other")).toBe(
      "abc-123",
    );
  });
  it("is null when nothing is set, and the message tells people what to do", () => {
    expect(resolveProjectId(undefined, "", "   ", 5)).toBeNull();
    expect(MISSING_PROJECT_ID_MESSAGE).toContain("EXPO_PUBLIC_EAS_PROJECT_ID");
  });
});

describe("permissionView", () => {
  it("maps the system status", () => {
    expect(permissionView("granted", false)).toBe("granted");
    expect(permissionView("undetermined", true)).toBe("can-ask");
    expect(permissionView("denied", true)).toBe("can-ask");
    expect(permissionView("denied", false)).toBe("denied");
  });
});

describe("parsePushData", () => {
  it("reads booking and time off payloads", () => {
    expect(
      parsePushData({
        type: "booking",
        appointmentId: "a1",
        membershipId: "m9",
        workspaceId: "w1",
        event: "booked",
      }),
    ).toEqual({
      type: "booking",
      appointmentId: "a1",
      membershipId: "m9",
      workspaceId: "w1",
      event: "booked",
    });
    expect(parsePushData({ type: "time_off", timeOffId: "t1" })).toEqual({
      type: "time_off",
      timeOffId: "t1",
      workspaceId: null,
      event: null,
    });
  });
  it("returns null for anything unexpected", () => {
    for (const bad of [
      null,
      undefined,
      "x",
      4,
      {},
      { type: "booking" },
      { type: "time_off", timeOffId: 5 },
      { type: "other", appointmentId: "a" },
    ])
      expect(parsePushData(bad)).toBeNull();
  });
});

describe("destinationFor", () => {
  const viewer = {
    workspaceId: "w1",
    membershipId: "m1",
    workspaceIds: ["w1", "w2"],
  };
  it("opens Today on Mine for my own booking", () => {
    expect(
      destinationFor(
        parsePushData({
          type: "booking",
          appointmentId: "a",
          membershipId: "m1",
          workspaceId: "w1",
        }),
        viewer,
      ),
    ).toEqual({ screen: "today", scope: "mine", switchTo: null });
  });
  it("opens Today on All when the booking is another person's", () => {
    expect(
      destinationFor(
        parsePushData({
          type: "booking",
          appointmentId: "a",
          membershipId: "m2",
          workspaceId: "w1",
        }),
        viewer,
      ),
    ).toEqual({ screen: "today", scope: "all", switchTo: null });
  });
  it("opens Time off for time off notifications", () => {
    expect(
      destinationFor(
        parsePushData({ type: "time_off", timeOffId: "t", workspaceId: "w1" }),
        viewer,
      ),
    ).toEqual({ screen: "time-off", switchTo: null });
  });
  it("asks to switch business first, and shows All because the person's id there is unknown", () => {
    expect(
      destinationFor(
        parsePushData({
          type: "booking",
          appointmentId: "a",
          membershipId: "m1",
          workspaceId: "w2",
        }),
        viewer,
      ),
    ).toEqual({ screen: "today", scope: "all", switchTo: "w2" });
    expect(
      destinationFor(
        parsePushData({ type: "time_off", timeOffId: "t", workspaceId: "w2" }),
        viewer,
      ),
    ).toEqual({ screen: "time-off", switchTo: "w2" });
  });
  it("goes nowhere for a business the person is not on, or for no data", () => {
    expect(
      destinationFor(
        parsePushData({ type: "time_off", timeOffId: "t", workspaceId: "w9" }),
        viewer,
      ),
    ).toEqual({ screen: "none" });
    expect(destinationFor(null, viewer)).toEqual({ screen: "none" });
  });
  it("treats a payload with no business as the current one", () => {
    expect(
      destinationFor(
        parsePushData({
          type: "booking",
          appointmentId: "a",
          membershipId: "m1",
        }),
        viewer,
      ),
    ).toEqual({ screen: "today", scope: "mine", switchTo: null });
  });
});

describe("refreshTopic", () => {
  it("picks the screen to refresh", () => {
    expect(
      refreshTopic(parsePushData({ type: "booking", appointmentId: "a" })),
    ).toBe("today");
    expect(
      refreshTopic(parsePushData({ type: "time_off", timeOffId: "t" })),
    ).toBe("time-off");
    expect(refreshTopic(null)).toBeNull();
  });
});

describe("settingRows", () => {
  it("uses the business words and differs for managers", () => {
    const member = settingRows(vocab, "member");
    expect(member[0].label).toBe("New and cancelled appointments");
    expect(member[1].label).toBe("Time off decisions");
    expect(
      settingRows(
        { ...vocab, appointmentPlural: "Sessions", client: "Guest" },
        "manager",
      )[0].label,
    ).toBe("New and cancelled sessions");
    expect(settingRows(vocab, "owner")[1].label).toBe(
      "Time off requests and decisions",
    );
    for (const r of [...member, ...settingRows(vocab, "owner")])
      expect(r.label + r.hint).not.toContain("\u2014");
  });
});
