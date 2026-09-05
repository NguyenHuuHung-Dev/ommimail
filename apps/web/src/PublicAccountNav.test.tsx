import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PublicAccountActions } from "./PublicAccountNav";

vi.mock("./firebase", () => ({ auth: { currentUser: null } }));

describe("public account navigation", () => {
  function render(user: Parameters<typeof PublicAccountActions>[0]["user"]) {
    return renderToStaticMarkup(
      <MemoryRouter>
        <PublicAccountActions user={user} />
      </MemoryRouter>,
    );
  }

  it("keeps guest actions while signed out", () => {
    const html = render(null);
    expect(html).toContain('href="/login"');
    expect(html).toContain("Dùng thử");
    expect(html).toContain('href="/register"');
  });

  it("shows an avatar and app entry for a signed-in account", () => {
    const html = render({
      displayName: "Linh Anh",
      email: "test@example.com",
      photoURL: "/avatar.png",
    });
    expect(html).toContain('class="public-account-avatar"');
    expect(html).toContain('src="/avatar.png"');
    expect(html).toContain('href="/app/home"');
    expect(html).toContain("Vào");
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain("Dùng thử");
  });

  it("uses initials when the account has no photo", () => {
    expect(
      render({ displayName: "Linh Anh", email: null, photoURL: null }),
    ).toContain(">LA</a>");
    expect(
      render({ displayName: null, email: null, photoURL: null }),
    ).toContain(">OM</a>");
  });

  it("does not flash guest actions during session restoration", () => {
    const html = render(undefined);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Đăng nhập");
    expect(html).not.toContain("Dùng thử");
  });
});
