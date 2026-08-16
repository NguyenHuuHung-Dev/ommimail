import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("Microsoft bulk connection", () => {
  it("accepts more than ten rows and reports validation errors per line", async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      line: index + 3,
      email: index === 4 ? "not-an-email" : `user${index}@outlook.com`,
      refreshToken: "short",
    }));

    const response = await request(app)
      .post("/api/mail-accounts/microsoft/refresh-token/batch")
      .set("Authorization", "Bearer local-session")
      .send({ items });

    expect(response.status).toBe(200);
    expect(response.body.data.results).toHaveLength(12);
    expect(response.body.data.failed).toBe(12);
    expect(response.body.data.results[0]).toMatchObject({
      line: 3,
      email: "user0@outlook.com",
      success: false,
    });
    expect(response.body.data.results[4]).toMatchObject({
      line: 7,
      email: "not-an-email",
      success: false,
      error: "Email Microsoft không hợp lệ",
    });
  });
});
