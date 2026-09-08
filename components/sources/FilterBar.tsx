import type {
  PlatformFilter,
  SourceSort,
  SourceFilters,
  StatusFilter,
} from "@/lib/sources/filter";

interface FilterBarProps {
  filters: SourceFilters;
  onChange: (filters: SourceFilters) => void;
  visibleCount: number;
  totalCount: number;
}

function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {children}
      </select>
    </label>
  );
}

export function FilterBar({ filters, onChange, visibleCount, totalCount }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label htmlFor="source-search" className="flex flex-1 flex-col gap-1 text-xs font-medium">
          Search
          <input
            id="source-search"
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="Search name or description…"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <Select
            id="platform-filter"
            label="Platform"
            value={filters.platform}
            onChange={(value) =>
              onChange({ ...filters, platform: value as PlatformFilter })
            }
          >
            <option value="all">All platforms</option>
            <option value="youtube">YouTube</option>
          </Select>
          <Select
            id="status-filter"
            label="Status"
            value={filters.status}
            onChange={(value) =>
              onChange({ ...filters, status: value as StatusFilter })
            }
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="unavailable_externally">Unavailable</option>
          </Select>
          <Select
            id="sort-order"
            label="Sort"
            value={filters.sort}
            onChange={(value) =>
              onChange({ ...filters, sort: value as SourceSort })
            }
          >
            <option value="name">Name A–Z</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        Showing {visibleCount} of {totalCount}{" "}
        {totalCount === 1 ? "source" : "sources"}
      </p>
    </div>
  );
}
