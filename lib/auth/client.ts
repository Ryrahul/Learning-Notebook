"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Same-origin by design — no `baseURL`.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so pinning the origin here
 * bakes whatever the build machine happened to know into the client bundle. A
 * CI build with no origin configured shipped `http://localhost:3000`, and every
 * browser then posted its credentials at its own machine: sign-in failed with
 * ERR_CONNECTION_REFUSED on the deployed site while server-side calls worked.
 *
 * Omitting it makes the client talk to whatever origin served the page, so one
 * build runs correctly on localhost, an IP, and a domain — and adding a domain
 * later needs no rebuild.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
