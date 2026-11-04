"use client";

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ENROLMENT_STATUS_OPTIONS } from "./format";

export interface ProgrammeFilterOption {
  id: string;
  name: string;
}

interface StudentDirectoryFiltersProps {
  initialSearch?: string;
  initialProgramme?: string;
  initialStatus?: string;
  programmes: ProgrammeFilterOption[];
}

export function StudentDirectoryFilters({
  initialSearch = "",
  initialProgramme = "",
  initialStatus = "",
  programmes,
}: StudentDirectoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);

  // Sync searchTerm during render if initialSearch changed externally
  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    setSearchTerm(initialSearch);
  }

  // Derive selected programme and status directly from URL search parameters
  const selectedProgramme = searchParams.get("programme") ?? initialProgramme;
  const selectedStatus = searchParams.get("status") ?? initialStatus;

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  function pushFilterUpdates(newSearch: string, newProg: string, newStat: string) {
    const params = new URLSearchParams();
    const trimmed = newSearch.trim();

    if (trimmed) {
      params.set("search", trimmed);
    }
    if (newProg) {
      params.set("programme", newProg);
    }
    if (newStat) {
      params.set("status", newStat);
    }

    const query = params.toString();
    const targetUrl = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.replace(targetUrl, { scroll: false });
    });
  }

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchTerm(val);

    // Cancel any previous pending debounce to avoid stale intermediate results
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce search update by 300ms
    debounceTimerRef.current = setTimeout(() => {
      pushFilterUpdates(val, selectedProgramme, selectedStatus);
    }, 300);
  }

  function handleProgrammeChange(e: ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;

    // Cancel pending search debounce and apply immediately
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    pushFilterUpdates(searchTerm, val, selectedStatus);
  }

  function handleStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;

    // Cancel pending search debounce and apply immediately
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    pushFilterUpdates(searchTerm, selectedProgramme, val);
  }

  function handleClearFilters() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchTerm("");
    pushFilterUpdates("", "", "");

    // Keep keyboard focus in the search box
    searchInputRef.current?.focus();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    pushFilterUpdates(searchTerm, selectedProgramme, selectedStatus);
  }

  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedProgramme || selectedStatus,
  );

  return (
    <section
      aria-labelledby="filters-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="filters-heading" className="sr-only">
        Filter students
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Search box with live 300ms debounce */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="search"
                className="block text-sm font-medium text-slate-700"
              >
                Search
              </label>
              {isPending && (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1 text-xs text-slate-400"
                >
                  <svg
                    className="h-3 w-3 animate-spin text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Updating...
                </span>
              )}
            </div>
            <div className="relative mt-1">
              <input
                ref={searchInputRef}
                id="search"
                name="search"
                type="search"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Name or SMS-2026-0001"
                aria-busy={isPending}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
          </div>

          {/* Programme Filter (immediate) */}
          <div>
            <label
              htmlFor="programme"
              className="block text-sm font-medium text-slate-700"
            >
              Programme
            </label>
            <select
              id="programme"
              name="programme"
              value={selectedProgramme}
              onChange={handleProgrammeChange}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">All programmes</option>
              {programmes.map((programme) => (
                <option key={programme.id} value={programme.id}>
                  {programme.name}
                </option>
              ))}
            </select>
          </div>

          {/* Enrolment Status Filter (immediate) */}
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-slate-700"
            >
              Enrolment status
            </label>
            <select
              id="status"
              name="status"
              value={selectedStatus}
              onChange={handleStatusChange}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">All statuses</option>
              {ENROLMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            Apply
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1 rounded-sm"
            >
              Clear filters
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
