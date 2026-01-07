"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CONSENT_COOKIE_NAME, ConsentChoice } from "@/lib/cookieConsent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CONSENT_COOKIE_NAME);
      setVisible(!stored);
    } catch {
      // Show the banner if localStorage is unavailable so users can still consent.
      setVisible(true);
    }
  }, []);

  const setConsent = (value: ConsentChoice) => {
    setVisible(false);
    try {
      window.localStorage.setItem(CONSENT_COOKIE_NAME, value);
    } catch {
      // ignore storage failures; banner already hidden
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-[min(420px,calc(100%-2rem))] rounded-lg border bg-card/95 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground">
          We use cookies to run the site (security, session) and to improve it
          with analytics. Choose whether to allow non-essential cookies.
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setConsent("declined")}>
            Decline non-essential
          </Button>
          <Button type="button" size="sm" onClick={() => setConsent("accepted")}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
