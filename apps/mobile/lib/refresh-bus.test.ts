import { describe, expect, it, vi } from "vitest";
import { publish, subscribe } from "./refresh-bus";

describe("refresh bus", () => {
  it("tells subscribers of a topic, with the message", () => {
    const fn = vi.fn();
    const off = subscribe("time-off", fn);
    publish("time-off", "Request sent for approval.");
    expect(fn).toHaveBeenCalledWith("Request sent for approval.");
    off();
  });

  it("stops after unsubscribe and tolerates a publish with no listeners", () => {
    const fn = vi.fn();
    subscribe("time-off", fn)();
    publish("time-off", "x");
    expect(fn).not.toHaveBeenCalled();
  });
});
