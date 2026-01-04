// ============================================================================
// TEMPORARY: This wrapper includes WhitelistGuard for beta access control
// TODO: Remove WhitelistGuard import and wrapper when ready for public launch,
//       keeping only the sidebar/layout structure
// ============================================================================

"use client";

import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DynamicBreadcrumb } from "@/components/dynamic-breadcrumb";
import { WhitelistGuard } from "@/components/whitelist-guard";

interface AuthenticatedContentProps {
  children: React.ReactNode;
  defaultSidebarOpen: boolean;
}

export function AuthenticatedContent({
  children,
  defaultSidebarOpen,
}: AuthenticatedContentProps) {
  return (
    // TEMPORARY: WhitelistGuard wrapper - remove when ready for public launch
    <WhitelistGuard>
      <TooltipProvider>
        <SidebarProvider defaultOpen={defaultSidebarOpen}>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <DynamicBreadcrumb />
            </header>
            <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-5">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </WhitelistGuard>
  );
}
