"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, QrCode, Settings } from "lucide-react";

export default function MobileBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/me", label: "بياناتي", icon: LayoutDashboard },
    { href: "/me/checkin", label: "حضور", icon: QrCode },
    { href: "/me/settings", label: "إعدادات", icon: Settings },
  ];

  return (
    <nav className="mobile-bottom-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        
        return (
          <Link 
            key={item.href} 
            href={item.href} 
            className={`bottom-nav-item ${isActive ? "active" : ""}`}
          >
            <Icon size={24} className="bottom-nav-icon" />
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
