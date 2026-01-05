"use client";

import { useConvexAuth } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, BookOpen, Users, Brain, CheckCircle } from "lucide-react";

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const landingOverride = searchParams.get("landing") === "1";
    if (!isLoading && isAuthenticated && !landingOverride) {
      router.push("/classes");
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 pt-24 pb-16 text-center">
        <p className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          AI-Native Learning Platform
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl">
          Classroom guidance that actually follows the curriculum
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Teachers upload their assignments and notes. Students get AI-powered help that teaches the right things, the right way—aligned with what&apos;s actually being taught in class.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      {/* The Problem */}
      <section className="px-4 py-16 border-t">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold mb-6">The Problem</h2>
          <div className="space-y-4 text-muted-foreground">
            <p>
              AI tools are everywhere in education now—but they&apos;re teaching students the wrong things.
              Generic AI tutors don&apos;t know your curriculum. They give answers without proper explanation.
              They skip steps. They overstep.
            </p>
            <p>
              Meanwhile, homework has stopped being useful. When students can get answers from AI,
              teachers lose visibility into how their students are actually learning.
              The teacher-student connection breaks down.
            </p>
            <p>
              Test scores are stagnating. Students aren&apos;t learning—they&apos;re just getting answers.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 py-16 border-t bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold mb-8">How Agar Works</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div>
                <h3 className="font-medium">Teachers create class hubs</h3>
                <p className="text-muted-foreground mt-1">
                  Upload assignments, lecture notes, and curriculum materials to your class space.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div>
                <h3 className="font-medium">AI guides are generated</h3>
                <p className="text-muted-foreground mt-1">
                  We create assignment-specific AI assistance grounded in your actual course content—not generic internet knowledge.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                3
              </div>
              <div>
                <h3 className="font-medium">Students learn with guardrails</h3>
                <p className="text-muted-foreground mt-1">
                  Students get help that guides them to understanding—not answers handed on a plate. Real learning, real accountability.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                4
              </div>
              <div>
                <h3 className="font-medium">Teachers see what&apos;s happening</h3>
                <p className="text-muted-foreground mt-1">
                  Get insights into how students are actually engaging with material. Homework becomes useful again.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Agar */}
      <section className="px-4 py-16 border-t">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold mb-8">Why Agar</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <BookOpen className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium">Curriculum-aligned</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Outside-of-class help that matches what&apos;s taught in class
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Users className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium">Teacher-student connection</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Bridges the gap between classroom and homework
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Brain className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium">Responsible AI use</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Enforces real learning instead of answer-giving
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium">Accountability built in</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Teachers see how students engage with material
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 border-t bg-muted/30">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-sm text-muted-foreground mb-2">Currently in development</p>
          <h2 className="text-2xl font-semibold mb-4">Ready to try Agar?</h2>
          <p className="text-muted-foreground mb-6">
            We&apos;re building the AI-native classroom. Sign up to get started.
          </p>
          <Button asChild size="lg">
            <Link href="/signup">
              Create account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8 border-t text-center text-sm text-muted-foreground">
        <p>Agar — AI-native learning, done right.</p>
      </footer>
    </div>
  );
}
