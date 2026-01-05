"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { Button } from "@/components/ui/button";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_DAYS,
  ConsentChoice,
} from "@/lib/cookieConsent";

export function CookieBanner() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasConsent = Cookies.get(CONSENT_COOKIE_NAME);
    setIsOpen(!hasConsent);
  }, []);

  const setConsent = (value: ConsentChoice) => {
    Cookies.set(CONSENT_COOKIE_NAME, value, {
      expires: CONSENT_MAX_AGE_DAYS,
      sameSite: "Lax",
      path: "/",
    });
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[9999] rounded-lg border bg-card/95 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          We use cookies to run the site (security, session) and to improve it
          with analytics. Choose whether to allow non-essential cookies.
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setConsent("declined")}>
            Decline non-essential
          </Button>
          <Button size="sm" onClick={() => setConsent("accepted")}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
