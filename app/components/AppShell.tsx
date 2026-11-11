
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    href: "/",
    label: "Create Bill",
    shortLabel: "Create",
    symbol: "+",
  },
  {
    href: "/history",
    label: "Invoice History",
    shortLabel: "History",
    symbol: "▤",
  },
  {
    href: "/products",
    label: "Product List",
    shortLabel: "Products",
    symbol: "📦",
  },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Desktop sidebar: 1024px and above */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white text-black lg:flex">
        {/* Logo and brand */}
        <Link
          href="/"
          className="flex items-center gap-3 border-b border-slate-200 px-6 py-6"
        >
          <img
            src="/logos.png"
            alt="Dream Designs s Billing Logo"
            className="h-11 w-11 shrink-0 rounded-xl object-contain"
          />

          <span className="min-w-0">
            <span className="block text-lg font-bold leading-7 text-black">
              Dream Designs 
            </span>
            <span className="block text-lg font-bold leading-7 text-black">
              Billing
            </span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="flex-1 space-y-2 p-4">
          <p className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </p>

          {navigation.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-transparent text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${
                    active
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {item.symbol}
                </span>

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-slate-200 p-5 text-xs leading-5 text-slate-500">
          <span className="font-semibold text-slate-800">
            Dream Designs s Billing
          </span>
          <br />
          Local billing workspace
        </div>
      </aside>

      {/* Mobile and tablet header: below 1024px */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <img
            src="/logos.png"
            alt="Dream Designs s Billing Logo"
            className="h-11 w-11 shrink-0 rounded-xl object-contain"
          />

          <span className="min-w-0">
            <span className="block font-bold text-black">
              Dream Designs s Billing
            </span>
            <span className="block text-xs text-slate-500">
              Billing management
            </span>
          </span>
        </Link>

        <span className="shrink-0 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
          Local mode
        </span>
      </header>

      {/* Page content */}
      <div className="min-w-0 lg:pl-64">
        <main className="mx-auto min-h-[calc(100vh-72px)] w-full max-w-[1600px] px-4 py-5 pb-24 sm:px-6 sm:py-7 md:px-8 md:pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile and tablet bottom navigation */}
      <nav
        aria-label="Main navigation"
        className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
      >
        {navigation.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? "text-blue-700"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span
                className={`flex h-7 w-9 items-center justify-center rounded-lg text-xl ${
                  active ? "bg-blue-50" : ""
                }`}
              >
                {item.symbol}
              </span>

              <span className="whitespace-nowrap">
                {item.shortLabel}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
