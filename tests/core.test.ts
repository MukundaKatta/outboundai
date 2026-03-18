import { describe, it, expect } from "vitest";
import { Outboundai } from "../src/core.js";
describe("Outboundai", () => {
  it("init", () => { expect(new Outboundai().getStats().ops).toBe(0); });
  it("op", async () => { const c = new Outboundai(); await c.process(); expect(c.getStats().ops).toBe(1); });
  it("reset", async () => { const c = new Outboundai(); await c.process(); c.reset(); expect(c.getStats().ops).toBe(0); });
});
