"use client";

import { useState, useRef, useEffect, useId, type KeyboardEvent } from "react";
import Link from "next/link";

interface StudentRowActionsProps {
  studentId: string;
  studentName: string;
  hasOutstandingBalance: boolean;
}

interface ActionItem {
  key: string;
  label: string;
  href: string;
}

export function StudentRowActions({
  studentId,
  studentName,
  hasOutstandingBalance,
}: StudentRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const menuId = useId();

  const actions: ActionItem[] = [
    {
      key: "view",
      label: "View record",
      href: `/staff/students/${studentId}`,
    },
    {
      key: "edit",
      label: "Edit student",
      href: `/staff/students/${studentId}/edit`,
    },
    ...(hasOutstandingBalance
      ? [
          {
            key: "payment",
            label: "Record payment",
            href: `/staff/students/${studentId}#record-payment`,
          },
        ]
      : []),
  ];

  // Close menu on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus the first menu item whenever the menu opens
  useEffect(() => {
    if (isOpen) {
      itemRefs.current[0]?.focus();
    }
  }, [isOpen]);

  function closeMenu(restoreFocus = true) {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
    }
  }

  function handleMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const total = actions.length;
    const currentActiveIndex = itemRefs.current.findIndex(
      (el) => el === document.activeElement,
    );

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
      return;
    }

    if (e.key === "Tab") {
      // Allow tab navigation to close the menu naturally
      setIsOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentActiveIndex < total - 1 ? currentActiveIndex + 1 : 0;
      itemRefs.current[nextIndex]?.focus();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = currentActiveIndex > 0 ? currentActiveIndex - 1 : total - 1;
      itemRefs.current[prevIndex]?.focus();
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[0]?.focus();
      return;
    }

    if (e.key === "End") {
      e.preventDefault();
      itemRefs.current[total - 1]?.focus();
      return;
    }
  }

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        id={`actions-trigger-${menuId}`}
        aria-label={`Actions for ${studentName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `actions-menu-${menuId}` : undefined}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
      >
        <span className="sr-only">Actions for {studentName}</span>
        {/* Accessible vertical three-dot icon */}
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id={`actions-menu-${menuId}`}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby={`actions-trigger-${menuId}`}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-30 mt-1.5 w-44 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          {actions.map((action, idx) => (
            <Link
              key={action.key}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              href={action.href}
              role="menuitem"
              tabIndex={-1}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:bg-slate-100 focus:text-slate-900 focus:outline-none"
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
