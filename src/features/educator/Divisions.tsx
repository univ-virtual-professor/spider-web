import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import EmployeesTab from "./EmployeesTab";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Label } from "@shared/ui/label";
import { Checkbox } from "@shared/ui/checkbox";
import { Badge } from "@shared/ui/badge";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";

type Branch = { id: string; name: string; location: string };
type Course = { id: string; branchId: string; name: string; subjectIds: string[] };
type Subject = { id: string; name: string; courseId?: string };
type TopLevelCourse = { id: string; name: string };

export default function Divisions() {
  const { profile } = useAuth();
  const educatorId = profile?.uid || "";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topLevelCourses, setTopLevelCourses] = useState<TopLevelCourse[]>([]);
  const [allowedCourseIds, setAllowedCourseIds] = useState<string[]>([]);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<string[]>([]);
  const [maxBranches, setMaxBranches] = useState<number>(5);
  const [loading, setLoading] = useState(true);
  const [employeeCount, setEmployeeCount] = useState(0);

  // Dialog state
  const [branchDialog, setBranchDialog] = useState(false);
  const [courseDialog, setCourseDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  // Form state
  const [branchName, setBranchName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseBranchId, setCourseBranchId] = useState("");
  const [courseCourseId, setCourseCourseId] = useState("");
  const [courseSubjectIds, setCourseSubjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!educatorId) return;

    getDoc(doc(db, "educators", educatorId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaxBranches(data.maxBranches ?? 5);
        setAllowedSubjectIds(data.allowedSubjectIds ?? []);
        setAllowedCourseIds(data.allowedCourseIds ?? []);
      }
    });

    const branchUnsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, "id">) })))
    );

    const empUnsub = onSnapshot(
      collection(db, "educators", educatorId, "employees"),
      (snap) => setEmployeeCount(snap.size),
      () => {}
    );

    getDocs(collection(db, "subjects")).then((snap) =>
      setSubjects(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          courseId: d.data().courseId as string | undefined,
        }))
      )
    );

    getDocs(collection(db, "courses")).then((snap) => {
      setTopLevelCourses(
        snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id }))
      );
      setLoading(false);
    });

    return () => {
      branchUnsub();
      empUnsub();
    };
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setCourses([]);
      return;
    }
    let cancelled = false;

    const loadCourses = async () => {
      const allCourses: typeof courses = [];
      for (const branch of branches) {
        const snap = await getDocs(
          collection(db, "educators", educatorId, "branches", branch.id, "courses")
        );
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          const subjectIds: string[] = Array.isArray(data.subjectIds)
            ? data.subjectIds
            : data.subjectId
              ? [data.subjectId]
              : [];
          allCourses.push({ id: d.id, branchId: branch.id, name: data.name, subjectIds });
        });
      }
      if (!cancelled) setCourses(allCourses);
    };

    loadCourses();
    return () => {
      cancelled = true;
    };
  }, [branches, educatorId]);

  const allowedSubjects = subjects.filter(
    (s) => allowedSubjectIds.length === 0 || allowedSubjectIds.includes(s.id)
  );
  const allowedCourses = topLevelCourses.filter(
    (c) => allowedCourseIds.length === 0 || allowedCourseIds.includes(c.id)
  );
  const subjectsForCourse = allowedSubjects.filter(
    (s) => !courseCourseId || s.courseId === courseCourseId
  );
  const coursesForBranch = (branchId: string) => courses.filter((c) => c.branchId === branchId);

  // Branch CRUD
  function openCreateBranch() {
    if (branches.length >= maxBranches) {
      toast.error(`Branch limit reached (max ${maxBranches})`);
      return;
    }
    setEditingBranch(null);
    setBranchName("");
    setBranchLocation("");
    setBranchDialog(true);
  }

  function openEditBranch(b: Branch) {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchLocation(b.location);
    setBranchDialog(true);
  }

  async function saveBranch() {
    if (!branchName.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      if (editingBranch) {
        await updateDoc(doc(db, "educators", educatorId, "branches", editingBranch.id), {
          name: branchName,
          location: branchLocation,
        });
      } else {
        await addDoc(collection(db, "educators", educatorId, "branches"), {
          name: branchName,
          location: branchLocation,
          createdAt: Timestamp.now(),
        });
      }
      setBranchDialog(false);
      toast.success(editingBranch ? "Branch updated" : "Branch created");
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBranch(b: Branch) {
    if (
      !confirm(`Delete branch "${b.name}"? All programs and batches under it will also be removed.`)
    )
      return;
    await deleteDoc(doc(db, "educators", educatorId, "branches", b.id));
    toast.success("Branch deleted");
  }

  // Course CRUD
  function openCreateCourse() {
    setEditingCourse(null);
    setCourseName("");
    setCourseBranchId(branches[0]?.id || "");
    setCourseCourseId("");
    setCourseSubjectIds([]);
    setCourseDialog(true);
  }

  function openEditCourse(c: Course) {
    setEditingCourse(c);
    setCourseName(c.name);
    setCourseBranchId(c.branchId);
    const parentCourseId = subjects.find((s) => c.subjectIds.includes(s.id))?.courseId || "";
    setCourseCourseId(parentCourseId);
    setCourseSubjectIds(c.subjectIds);
    setCourseDialog(true);
  }

  async function saveCourse() {
    if (!courseName.trim() || !courseBranchId || courseSubjectIds.length === 0) {
      toast.error("All fields required");
      return;
    }
    setBusy(true);
    try {
      if (editingCourse) {
        await updateDoc(
          doc(db, "educators", educatorId, "branches", courseBranchId, "courses", editingCourse.id),
          { name: courseName, subjectIds: courseSubjectIds }
        );
      } else {
        await addDoc(
          collection(db, "educators", educatorId, "branches", courseBranchId, "courses"),
          {
            name: courseName,
            subjectIds: courseSubjectIds,
            createdAt: Timestamp.now(),
          }
        );
      }
      setCourseDialog(false);
      toast.success(editingCourse ? "Program updated" : "Program created");
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse(c: Course) {
    if (!confirm(`Delete program "${c.name}"?`)) return;
    await deleteDoc(doc(db, "educators", educatorId, "branches", c.branchId, "courses", c.id));
    toast.success("Program deleted");
  }

  if (loading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-6 font-ds-sans">
      <div>
        <h1 className="font-ds-serif text-[23px] font-semibold text-ds-ink">Staff &amp; access</h1>
        <p className="font-ds-sans text-[12.5px] text-ds-slate">
          Manage your branches, programs, and staff.
        </p>
      </div>

      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="branches">
            Branches ({branches.length}/{maxBranches})
          </TabsTrigger>
          <TabsTrigger value="courses">Programs ({courses.length})</TabsTrigger>
          <TabsTrigger value="employees">Employees ({employeeCount})</TabsTrigger>
        </TabsList>

        {/* Branches Tab */}
        <TabsContent value="branches" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreateBranch} disabled={branches.length >= maxBranches}>
              <Plus className="mr-2 h-4 w-4" />
              Add Branch
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <Card key={b.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  {b.location && <p className="text-sm text-muted-foreground">{b.location}</p>}
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {coursesForBranch(b.id).length} program(s)
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditBranch(b)}>
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteBranch(b)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {branches.length === 0 && (
              <p className="col-span-3 py-8 text-center text-muted-foreground">No branches yet.</p>
            )}
          </div>
        </TabsContent>

        {/* Programs Tab */}
        <TabsContent value="courses" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreateCourse} disabled={branches.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add Program
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Subjects</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courses.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          {branches.find((b) => b.id === c.branchId)?.name || c.branchId}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {c.subjectIds.slice(0, 3).map((id) => (
                              <Badge key={id} variant="secondary" className="text-xs">
                                {subjects.find((s) => s.id === id)?.name || id}
                              </Badge>
                            ))}
                            {c.subjectIds.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{c.subjectIds.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {c.subjectIds.slice(0, 3).map((id) => (
                              <Badge key={id} variant="secondary" className="text-xs">
                                {subjects.find((s) => s.id === id)?.name || id}
                              </Badge>
                            ))}
                            {c.subjectIds.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{c.subjectIds.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEditCourse(c)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteCourse(c)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {courses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No programs yet. Create a branch first.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Employees Tab */}
        <TabsContent value="employees">
          <EmployeesTab educatorId={educatorId} branches={branches} />
        </TabsContent>
      </Tabs>

      {/* Branch Dialog */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Branch" : "New Branch"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Branch Name</Label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Sector 18, Noida"
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={branchLocation}
                onChange={(e) => setBranchLocation(e.target.value)}
                placeholder="City / Area"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBranchDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveBranch} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Program Dialog */}
      <Dialog open={courseDialog} onOpenChange={setCourseDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCourse ? "Edit Program" : "New Program"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Program Name</Label>
              <Input
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. JEE Mains 2026"
              />
            </div>
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select value={courseBranchId} onValueChange={setCourseBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Course</Label>
              <Select
                value={courseCourseId}
                onValueChange={(v) => {
                  setCourseCourseId(v);
                  setCourseSubjectIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {allowedCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {courseCourseId && (
              <div className="space-y-2">
                <Label>Subjects</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {subjectsForCourse.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No subjects available</p>
                  ) : (
                    subjectsForCourse.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`subj-${s.id}`}
                          checked={courseSubjectIds.includes(s.id)}
                          onCheckedChange={(checked) =>
                            setCourseSubjectIds((prev) =>
                              checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                            )
                          }
                        />
                        <label
                          htmlFor={`subj-${s.id}`}
                          className="cursor-pointer select-none text-sm"
                        >
                          {s.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCourseDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveCourse} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
