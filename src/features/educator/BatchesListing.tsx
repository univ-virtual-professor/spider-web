import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users, ChevronRight, Filter, AlertCircle } from "lucide-react";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Skeleton } from "@shared/ui/skeleton";

type Batch = {
  id: string;
  name: string;
  courseId: string;
  branchId: string;
  capacity?: number;
  studentCount?: number;
};

type Branch = {
  id: string;
  name: string;
};

export default function BatchesListing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, firebaseUser, loading: authLoading } = useAuth();
  const educatorId = profile?.educatorId || firebaseUser?.uid || null;

  const [batches, setBatches] = useState<Batch[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const branchFilter = searchParams.get("branch") || "All";

  useEffect(() => {
    if (authLoading || !educatorId) return;

    // Load Branches for filter
    const loadBranches = async () => {
      const snap = await getDocs(collection(db, "educators", educatorId, "branches"));
      const bs = snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id }));
      setBranches(bs);

      // Auto-default if only one branch
      if (bs.length === 1 && branchFilter === "All") {
        const next = new URLSearchParams(searchParams);
        next.set("branch", bs[0].name);
        setSearchParams(next);
      }
    };
    loadBranches();

    // Load Batches across all branches/courses
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "students"), // We'll count students per batch from here if needed, or use a dedicated collection
      () => {
        // In a real app, you might have a 'batches' collection.
        // Based on previous context, we fetch hierarchy.
        const fetchAllBatches = async () => {
          const bs: Batch[] = [];
          const branchSnap = await getDocs(collection(db, "educators", educatorId, "branches"));

          for (const bDoc of branchSnap.docs) {
            const courseSnap = await getDocs(
              collection(db, "educators", educatorId, "branches", bDoc.id, "courses")
            );
            for (const cDoc of courseSnap.docs) {
              const batchSnap = await getDocs(
                collection(
                  db,
                  "educators",
                  educatorId,
                  "branches",
                  bDoc.id,
                  "courses",
                  cDoc.id,
                  "batches"
                )
              );
              for (const btDoc of batchSnap.docs) {
                const data = btDoc.data();
                bs.push({
                  id: btDoc.id,
                  name: data.name || btDoc.id,
                  courseId: cDoc.id,
                  branchId: bDoc.id,
                  capacity: data.capacity || 50,
                  studentCount: data.studentCount || 0, // This would ideally be a trigger-based count
                });
              }
            }
          }
          setBatches(bs);
          setIsLoading(false);
        };
        fetchAllBatches();
      }
    );

    return () => unsub();
  }, [educatorId, authLoading]);

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (branchFilter !== "All") {
        const bId = branches.find((br) => br.name === branchFilter)?.id;
        if (b.branchId !== bId) return false;
      }
      if (searchQuery) {
        return b.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [batches, branchFilter, branches, searchQuery]);

  const updateBranchFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "All") next.delete("branch");
    else next.set("branch", value);
    setSearchParams(next);
  };

  if (authLoading) return null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 p-6 duration-700 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Batches</h1>
          <p className="mt-1 text-muted-foreground">
            Manage academic groups and monitor student occupancy levels.
          </p>
        </div>
      </div>

      {/* Global Filter Bar */}
      <Card className="border-none bg-muted/30 shadow-none">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2 px-2 text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Quick Filter</span>
          </div>

          <Select value={branchFilter} onValueChange={updateBranchFilter}>
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="Select Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {branchFilter !== "All" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateBranchFilter("All")}
              className="h-8 text-xs"
            >
              Reset Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Batches Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredBatches.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredBatches.map((batch) => {
            const occupancy = Math.round(
              ((batch.studentCount || 0) / (batch.capacity || 50)) * 100
            );
            const isFull = occupancy >= 90;
            const isWarning = occupancy >= 75 && occupancy < 90;

            return (
              <Card key={batch.id} className="group overflow-hidden border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="rounded-xl bg-primary/5 p-2 text-primary transition-colors duration-500 group-hover:bg-primary group-hover:text-primary-foreground">
                      <Users className="h-5 w-5" />
                    </div>
                    <Badge
                      variant="outline"
                      className="h-5 border-muted-foreground/20 px-2 py-0 text-[10px] font-bold uppercase tracking-wider"
                    >
                      {branches.find((b) => b.id === batch.branchId)?.name || "Main"}
                    </Badge>
                  </div>
                  <CardTitle className="mt-4 text-xl transition-colors group-hover:text-primary">
                    {batch.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="group/btn h-9 w-full text-xs font-bold"
                      onClick={() =>
                        navigate(
                          `/educator/students?branch=${branches.find((br) => br.id === batch.branchId)?.name}&batch=${batch.name}`
                        )
                      }
                    >
                      View Students
                      <ChevronRight className="ml-2 h-3 w-3 transition-transform group-hover/btn:translate-x-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted/30">
            <AlertCircle className="h-10 w-10 text-muted-foreground/30" />
          </div>
          <h3 className="text-xl font-bold">No batches found</h3>
          <p className="mx-auto mt-2 max-w-xs text-muted-foreground">
            Try adjusting your filters or search query to find the batches you're looking for.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => updateBranchFilter("All")}>
            Clear All Filters
          </Button>
        </div>
      )}

      {/* Summary Footer */}
      {!isLoading && filteredBatches.length > 0 && (
        <div className="flex items-center justify-between border-t border-border/50 pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            Showing <span className="font-bold text-foreground">{filteredBatches.length}</span>{" "}
            active batches
          </p>
        </div>
      )}
    </div>
  );
}
