import { requireUser } from "@/lib/auth/session";

/**
 * The editor gets its own layout — no app sidebar, no page chrome.
 *
 * When you are studying, the canvas is the product; everything else is a
 * distraction. Navigation back to the notebook lives in the editor's own top
 * bar and in the page navigator.
 */
export default async function EditorLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <div className="h-dvh overflow-hidden bg-background">{children}</div>;
}
