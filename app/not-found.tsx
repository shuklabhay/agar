import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Home,
  LogIn,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const quickLinks = [
  {
    href: "/",
    label: "Back to homepage",
    description: "Return to the landing page and pick a new destination.",
    icon: Home,
  },
  {
    href: "/login",
    label: "Sign in",
    description: "Jump back into your classes and assignments.",
    icon: LogIn,
  },
  {
    href: "/signup",
    label: "Create an account",
    description: "Set up Agar for your classroom in a few minutes.",
    icon: Sparkles,
  },
];

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-primary/5 via-background to-muted/30 dark:from-primary/10 dark:via-slate-950 dark:to-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-6 right-[-4rem] h-80 w-80 rounded-full bg-emerald-200/30 blur-3xl dark:bg-primary/15" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-16">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            This page isn&apos;t in the lesson plan.
          </h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            The link you followed doesn&apos;t match an Agar route. Choose a
            path below to get back to your classes, sign in, or start a new
            workspace.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/">
                Back to homepage
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <Card className="border-border/80 bg-card/85 backdrop-blur">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Quick routes</h2>
                <p className="text-sm text-muted-foreground">
                  Shortcuts we use most often with students and teachers.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group block rounded-lg border border-border/80 bg-background/70 p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <link.icon className="h-4 w-4 text-primary" />
                    {link.label}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {link.description}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Continue
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
