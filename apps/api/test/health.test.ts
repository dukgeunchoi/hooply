import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("GET /health", () => {
  it("returns the envelope format with status ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "ok" });
    expect(res.body.meta.delayed).toBe(false);
    expect(typeof res.body.meta.generated_at).toBe("string");
  });
});
