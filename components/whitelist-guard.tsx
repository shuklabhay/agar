// ============================================================================
// TEMPORARY: Whitelist guard component for beta access
// TODO: Remove this entire file when ready for public launch
// ============================================================================

"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldX, LogOut } from "lucide-react";
import { useState } from "react";

interface WhitelistGuardProps {
  children: React.ReactNode;
}

/**
 * TEMPORARY: Wraps authenticated content and blocks access for non-whitelisted users.
 * Shows a friendly "access denied" message with sign out option.
 */
export function WhitelistGuard({ children }: WhitelistGuardProps) {
  const whitelistStatus = useQuery(api.users.isWhitelisted);
  const claimAccess = useMutation(api.users.claimAccessWithCode);
  const { signOut } = useAuthActions();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
          <CardContent className="space-y-4 text-left">
            <div className="space-y-2 text-muted-foreground">
              <p>
                This app is in limited beta. If a teacher shared a six-letter
                access code with you, enter it below to unlock your account.
              </p>
              <p className="text-sm">
                No code? Reach out to the person who invited you.
              </p>
            </div>

            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setSubmitting(true);
                setError(null);
                try {
                  await claimAccess({ code });
                  setCode("");
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : "Something went wrong.";
                  setError(message);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="access-code">Access code</Label>
                <Input
                  id="access-code"
                  value={code}
                  placeholder="ABCDEF"
                  autoComplete="one-time-code"
                  maxLength={6}
                  onChange={(e) =>
                    setCode(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Use the six-letter code your teacher provided.
                </p>
              </div>
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || code.length !== 6}
              >
                {submitting ? "Checking code..." : "Unlock with code"}
              </Button>
            </form>

            <div className="flex justify-center">
              <Button variant="outline" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Whitelisted - render children
  return <>{children}</>;
}
