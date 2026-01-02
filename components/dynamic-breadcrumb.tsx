"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";

export function DynamicBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Check if we're on a class detail page
  const isClassDetail = segments[0] === "classes" && segments[1];
  const classId = isClassDetail ? (segments[1] as Id<"classes">) : undefined;

  const classData = useQuery(
    api.classes.getClass,
    classId ? { classId } : "skip",
  );

  // Build breadcrumb items
  const breadcrumbs: { label: string; href?: string }[] = [];

  if (segments[0] === "classes") {
    breadcrumbs.push({
      label: "Classes",
      href: isClassDetail ? "/classes" : undefined,
    });

    if (isClassDetail && classData) {
      breadcrumbs.push({ label: classData.name });
    } else if (isClassDetail && classData === undefined) {
      breadcrumbs.push({ label: "..." });
    }
  } else if (segments[0] === "settings") {
    breadcrumbs.push({ label: "Settings" });
  }

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => (
          <Fragment key={index}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
