import { useEffect, useMemo, useRef, useState } from "react";
import { useQBOptions } from "@shared/hooks/useQBOptions";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { X, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@shared/lib/utils";

interface TopicMultiSelectProps {
  selectedTopics: string[];
  setSelectedTopics: (topics: string[]) => void;
  placeholder?: string;
  className?: string;
  /** When provided, skips the internal Firestore fetch and uses this list instead. */
  availableTopics?: string[];
}

export function TopicMultiSelect({
  selectedTopics,
  setSelectedTopics,
  placeholder = "Search and select topics...",
  className,
  availableTopics: externalTopics,
}: TopicMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Only hit Firestore when externalTopics isn't supplied
  const { topics: fetchedTopics, loading: loadingTopics } = useQBOptions(
    externalTopics ? [] : undefined
  );
  const allTopics = externalTopics ?? fetchedTopics;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allTopics.filter((t) => t.toLowerCase().includes(q)) : allTopics;
  }, [allTopics, search]);

  const toggleTopic = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      setSelectedTopics(selectedTopics.filter((t) => t !== topic));
    } else {
      setSelectedTopics([...selectedTopics, topic]);
    }
  };

  const removeTopic = (topic: string) => {
    setSelectedTopics(selectedTopics.filter((t) => t !== topic));
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger */}
      <div
        className={cn(
          "flex min-h-[2.5rem] cursor-pointer flex-wrap items-center gap-1.5 rounded-md border bg-background p-2 transition-colors",
          open ? "border-primary ring-1 ring-ring" : "hover:border-muted-foreground/40"
        )}
        onClick={() => {
          setOpen(!open);
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
      >
        {selectedTopics.length === 0 && (
          <span className="flex-1 px-1 text-sm text-muted-foreground">{placeholder}</span>
        )}
        {selectedTopics.map((topic) => (
          <Badge
            key={topic}
            variant="secondary"
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium"
          >
            {topic}
            <X
              className="h-3 w-3 cursor-pointer hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                removeTopic(topic);
              }}
            />
          </Badge>
        ))}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {/* Search */}
          <div className="border-b p-2">
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics..."
              className="h-8 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Topic list */}
          <div className="max-h-48 overflow-y-auto">
            {loadingTopics ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="text-sm">Loading topics...</span>
              </div>
            ) : filteredTopics.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {search ? "No topics match your search" : "No topics found in question bank"}
              </p>
            ) : (
              filteredTopics.map((topic) => {
                const isSelected = selectedTopics.includes(topic);
                return (
                  <div
                    key={topic}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                      isSelected && "bg-primary/5 text-primary"
                    )}
                    onClick={() => toggleTopic(topic)}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span>{topic}</span>
                  </div>
                );
              })
            )}
          </div>

          {selectedTopics.length > 0 && (
            <div className="flex items-center justify-between border-t bg-muted/20 p-2">
              <span className="text-xs text-muted-foreground">
                {selectedTopics.length} selected
              </span>
              <button
                className="text-xs text-destructive hover:underline"
                onClick={() => setSelectedTopics([])}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
