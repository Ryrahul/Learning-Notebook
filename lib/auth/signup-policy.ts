import "server-only";

/**
 * Whether new accounts may be created.
 *
 * Env-driven so a deployment can be closed or reopened by editing
 * `/srv/notebook/shared/.env` and restarting — no rebuild, no code change.
 * Defaults to open so local development and a fresh clone behave normally;
 * the production host sets `SIGNUP_ENABLED="false"`.
 *
 * This is read on the server only. Better Auth enforces it at the API, which
 * is the real gate — the UI changes below just avoid offering a door that is
 * locked.
 */
export const signupEnabled = process.env.SIGNUP_ENABLED !== "false";
