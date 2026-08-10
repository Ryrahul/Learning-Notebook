import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db, schema } from "@/lib/db";

export const auth = betterAuth({
  appName: "Notebook",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // No mail provider is configured for local development. Both of these are
    // config flips once one exists — see ARCHITECTURE.md §9.
    requireEmailVerification: false,
    autoSignIn: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days — study sessions span weeks
    updateAge: 60 * 60 * 24, // refresh the token at most daily
    cookieCache: {
      // Avoids a database round trip on every request that only needs to know
      // "is there a user". Revocation still takes effect within the window.
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  // Must stay last: it wires cookie writes into Next server actions.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type Session = Auth["$Infer"]["Session"];
