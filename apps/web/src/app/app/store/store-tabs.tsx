"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/app/store", label: "Con ZYXE", exact: true },
  { href: "/app/store/fiat", label: "Fiat sandbox" },
  { href: "/app/store/inventory", label: "Mi inventario" },
] as const;

export function StoreTabs() {
  const pathname = usePathname();

  return (
    <nav className="storeTabs" aria-label="Formas de compra e inventario">
      {tabs.map((tab) => {
        const active =
          "exact" in tab && tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            className={`storeTab ${active ? "active" : ""}`}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            key={tab.href}
          >
            {tab.label}
            {tab.href === "/app/store/fiat" ? (
              <span className="storeTabBadge">SANDBOX</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
