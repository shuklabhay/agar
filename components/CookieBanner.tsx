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

  const getStoredConsent = () => {
    if (typeof window === "undefined") return undefined;
    try {
      const cookieConsent = Cookies.get(CONSENT_COOKIE_NAME);
      if (cookieConsent) return cookieConsent;
    } catch {
      // Ignore and fall back to localStorage
    }
    return window.localStorage.getItem(CONSENT_COOKIE_NAME) || undefined;
  };

  useEffect(() => {
    const hasConsent = getStoredConsent();
    setIsOpen(!hasConsent);
  }, []);

  const setConsent = (value: ConsentChoice) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONSENT_COOKIE_NAME, value);
    }
    try {
      Cookies.set(CONSENT_COOKIE_NAME, value, {
        expires: CONSENT_MAX_AGE_DAYS,
        sameSite: "Lax",
        path: "/",
        secure: typeof window !== "undefined" && window.location.protocol === "https:",
      });
    } catch {
      // localStorage already set; ignore cookie errors
    }
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-[min(420px,calc(100%-2rem))] rounded-lg border bg-card/95 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-3">
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
