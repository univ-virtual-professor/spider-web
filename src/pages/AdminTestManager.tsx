import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, List, Loader2 } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Textarea } from "@shared/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { toast } from "sonner";

// Firebase
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";

export default function AdminTestManager() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<any>(null);

  // --- 1. Fetch Admin Tests ---
  useEffect(() => {
    const q = query(collection(db, "test_series"), where("source", "==", "admin"));
    const unsub = onSnapshot(q, (snap) => {
      setTests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // --- 2. Create / Edit Metadata ---
  const handleSaveMetadata = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      title: formData.get("title"),
      description: formData.get("description"),
      subject: formData.get("subject"),
      level: formData.get("level"),
      durationMinutes: Number(formData.get("duration")),
      source: "admin",
      createdAt: serverTimestamp(),
    };

    try {
      if (selectedTest?.id) {
        await updateDoc(doc(db, "test_series", selectedTest.id), data);
        toast.success("Test updated");
      } else {
        await addDoc(collection(db, "test_series"), data);
        toast.success("New Master Test Created");
      }
      setSelectedTest(null); // Close form
    } catch (err) {
      toast.error("Error saving test");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Test Manager</h1>
          <p className="text-muted-foreground">Create master tests for the global bank.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedTest(null)}>
              <Plus className="mr-2 h-4 w-4" /> Create New Test
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedTest ? "Edit Test" : "Create Master Test"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveMetadata} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input name="title" defaultValue={selectedTest?.title} required />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    name="subject"
                    defaultValue={selectedTest?.subject}
                    placeholder="e.g. Physics"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select name="level" defaultValue={selectedTest?.level || "Medium"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration (Mins)</Label>
                  <Input
                    type="number"
                    name="duration"
                    defaultValue={selectedTest?.durationMinutes}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea name="description" defaultValue={selectedTest?.description} required />
              </div>
              <Button type="submit" className="w-full">
                Save Details
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => (
            <Card key={test.id} className="group relative">
              <CardHeader>
                <CardTitle className="flex items-start justify-between">
                  <span className="truncate">{test.title}</span>
                  <Badge>{test.subject}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="line-clamp-2 text-sm text-muted-foreground">{test.description}</p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{test.level}</span> • <span>{test.durationMinutes} mins</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      navigate(`/admin-test/questions/${test.id}`);
                    }}
                  >
                    <List className="mr-2 h-4 w-4" /> Manage Questions
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteDoc(doc(db, "test_series", test.id))}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
