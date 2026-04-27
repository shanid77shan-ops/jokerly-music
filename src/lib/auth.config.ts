import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = request.nextUrl.pathname === "/login";
      const isApi = request.nextUrl.pathname.startsWith("/api");
      if (isApi) return true;
      if (!isLoggedIn && !isLoginPage) return false;
      return true;
    },
  },
  providers: [],
};
