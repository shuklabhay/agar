"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Settings,
  LogOut,
  ChevronUp,
  ChevronRight,
  BookOpen,
  Plus,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AppSidebar() {
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration pattern for client-only rendering
  }, []);
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const classes = useQuery(api.classes.listClasses);
  const currentUser = useQuery(api.myFunctions.getCurrentUser);
  const userPreferences = useQuery(api.myFunctions.getUserPreferences);
  const updatePreferences = useMutation(api.myFunctions.updateUserPreferences);

  const defaultMetric = userPreferences?.defaultMetric ?? "mean";

  const handleMetricChange = useCallback((metric: "mean" | "median") => {
    updatePreferences({ defaultMetric: metric });
  }, [updatePreferences]);

  const isLoading = classes === undefined;

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const hasClasses = classes && classes.length > 0;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/classes">
                <span className="text-lg font-semibold leading-none">Agar</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/classes")}
                    tooltip="Classes"
                  >
                    <Link href="/classes">
                      <BookOpen />
                      <span>Classes</span>
                    </Link>
                  </SidebarMenuButton>
                  {hasClasses && (
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className="data-[state=open]:rotate-90">
                        <ChevronRight />
                        <span className="sr-only">Toggle classes</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                  )}
                  {hasClasses && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {isLoading ? (
                          <>
                            <SidebarMenuSubItem>
                              <SidebarMenuSkeleton />
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSkeleton />
                            </SidebarMenuSubItem>
                          </>
                        ) : (
                          classes?.map((classItem) => (
                            <SidebarMenuSubItem key={classItem._id}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === `/classes/${classItem._id}`
                                }
                              >
                                <Link href={`/classes/${classItem._id}`}>
                                  <span className="truncate">
                                    {classItem.name}
                                  </span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))
                        )}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <Link
                              href="/classes"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Plus className="size-4" />
                              <span>Add Class</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>

              {/* Analytics Menu Item */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/analytics")}
                  tooltip="Analytics"
                >
                  <Link href="/analytics">
                    <BarChart3 />
                    <span>Analytics</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogTrigger asChild>
                    <SidebarMenuButton>
                      <Settings />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Default Metric</p>
                          <p className="text-xs text-muted-foreground">
                            Display mean or median in analytics
                          </p>
                        </div>
                        <div className="flex rounded-lg bg-muted p-1">
                          <button
                            onClick={() => handleMetricChange("mean")}
                            className={cn(
                              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                              defaultMetric === "mean"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            Mean
                          </button>
                          <button
                            onClick={() => handleMetricChange("median")}
                            className={cn(
                              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                              defaultMetric === "median"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            Median
                          </button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {mounted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    {currentUser?.image ? (
                      <Image
                        src={currentUser.image}
                        alt="Profile"
                        width={32}
                        height={32}
                        className="aspect-square size-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-sm font-medium uppercase">
                        {currentUser?.email?.charAt(0) ?? "?"}
                      </div>
                    )}
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {currentUser?.name ?? currentUser?.email ?? "Account"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Manage your account
                      </span>
                    </div>
                    <ChevronUp className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="top"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="mr-2 size-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-sm font-medium uppercase">
                  ?
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Account</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Manage your account
                  </span>
                </div>
                <ChevronUp className="ml-auto size-4" />
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
