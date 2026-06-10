"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-b border-dim bg-void/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <nav className="mx-auto flex h-14 max-w-wrap items-center justify-between px-6">
        <Link
          href="/"
          className="font-display text-[17px] font-extrabold tracking-tight text-white"
        >
          INJI
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {[
            ["Intelligence", "#intelligence"],
            ["How it works", "#how"],
            ["Security", "#security"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-[13px] text-txt-secondary transition-colors duration-200 hover:text-white"
            >
              {label}
            </a>
          ))}
        </div>

        <Link
          href="/chat"
          className="rounded-full border border-subtle px-4 py-1.5 text-[13px] font-medium text-white transition-all duration-200 hover:border-strong hover:bg-white hover:text-black"
        >
          Open Terminal
        </Link>
      </nav>
    </header>
  );
}
