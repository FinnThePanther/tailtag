"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldCheck,
  Users,
  CalendarDays,
  UserCog,
  FileClock,
  Tag,
  Flag,
  Check,
} from "lucide-react";
import clsx from "clsx";

import type { AdminProfile } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: ShieldCheck },
  { href: "/players", label: "Players", icon: Users },
  { href: "/conventions", label: "Conventions", icon: CalendarDays },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/staff", label: "Staff", icon: UserCog },
  { href: "/analytics", label: "Analytics", icon: ShieldCheck },
  { href: "/achievements", label: "Achievements", icon: ShieldCheck },
  { href: "/errors", label: "Errors", icon: ShieldCheck },
  { href: "/checklist", label: "Pre-Event Checklist", icon: Check },
  { href: "/reports", label: "Reports", icon: Flag },
  { href: "/audit", label: "Audit Log", icon: FileClock },
];

export function Sidebar({ profile }: { profile: AdminProfile }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-panel/80 px-4 py-6 backdrop-blur">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">TailTag</p>
        <p className="mt-1 text-lg font-semibold text-white">Admin</p>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                isActive
                  ? "bg-white/5 text-white ring-1 ring-primary/60"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon
                size={18}
                className={isActive ? "text-primary" : "text-slate-400"}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 rounded-lg border border-border bg-background px-3 py-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-white/5" />
          <div>
            <div className="text-sm font-semibold text-white">
              {profile.username ?? "Admin"}
            </div>
            <div className="capitalize text-muted">{profile.role}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
