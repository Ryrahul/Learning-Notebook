import type { Metadata } from "next";

import { RequestAccessForm } from "../_components/request-access-form";

export const metadata: Metadata = { title: "Request access" };
export const dynamic = "force-dynamic";

export default function RequestAccessPage() {
  return <RequestAccessForm />;
}
