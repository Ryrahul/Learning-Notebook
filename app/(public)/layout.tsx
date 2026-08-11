/**
 * Public layout — no session, no sidebar, no app chrome.
 *
 * Everything under here is reachable by someone holding a share link, so it
 * must never import anything that assumes a signed-in user.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
