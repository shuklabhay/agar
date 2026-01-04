// ============================================================================
// TEMPORARY: This layout uses AuthenticatedContent which includes whitelist check
// TODO: When removing whitelist, either:
//   1. Update AuthenticatedContent to remove WhitelistGuard wrapper, OR
//   2. Inline the layout structure here and delete AuthenticatedContent
// ============================================================================

import { cookies } from "next/headers";
import { AuthenticatedContent } from "@/components/authenticated-content";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <AuthenticatedContent defaultSidebarOpen={defaultOpen}>
      {children}
    </AuthenticatedContent>
  );
}
