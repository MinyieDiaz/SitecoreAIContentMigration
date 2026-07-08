"use client";

import { mdiCompassOutline, mdiSwapHorizontal } from "@mdi/js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icon";
import { Logo } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/", label: "Migration Wizard", icon: mdiSwapHorizontal },
  { href: "/explorer", label: "Explorer", icon: mdiCompassOutline },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-4 py-3">
          <Logo iconClassName="size-6" textClassName="text-md" />
          <p className="text-sm text-muted-foreground">SitecoreAI to SitecoreAI</p>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <Icon path={item.icon} size={0.75} />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
