// ============================================================================
// TEMPORARY: Whitelist guard component for beta access
// TODO: Remove this entire file when ready for public launch
// ============================================================================

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldX, LogOut } from "lucide-react";

interface WhitelistGuardProps {
  children: React.ReactNode;
}

/**
 * TEMPORARY: Wraps authenticated content and blocks access for non-whitelisted users.
 * Shows a friendly "access denied" message with sign out option.
 */
export function WhitelistGuard({ children }: WhitelistGuardProps) {
  const whitelistStatus = useQuery(api.users.isWhitelisted);
  const { signOut } = useAuthActions();

  // Still loading
  if (whitelistStatus === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Checking access...</p>
        </div>
      </div>
    );
  }

  // Not whitelisted - show access denied
  if (!whitelistStatus.isWhitelisted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <ShieldX className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Access Not Available</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Your account hasn&apos;t been granted access yet. This application
              is currently in limited beta.
            </p>
            <p className="text-sm text-muted-foreground">
              If you believe you should have access, please contact the
              administrator.
            </p>
            <Button
              variant="outline"
              onClick={() => signOut()}
              className="mt-4"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Whitelisted - render children
  return <>{children}</>;
}
