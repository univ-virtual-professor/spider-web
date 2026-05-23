import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { toast } from "sonner";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";

type QuestionReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  questionId: string;
  contextId: string;
  questionContent?: string;
};

const REPORT_CATEGORIES = [
  "Wrong Answer",
  "Incorrect Question",
  "Typo/Grammar",
  "Image Missing",
  "Duplicate Question",
  "Out of Syllabus",
  "Other",
];

export default function QuestionReportModal({
  isOpen,
  onClose,
  questionId,
  contextId,
  questionContent,
}: QuestionReportModalProps) {
  const { firebaseUser, profile } = useAuth();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!category) {
      toast.error("Please select a report category");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Please provide a description of at least 10 characters");
      return;
    }
    if (!firebaseUser) {
      toast.error("You must be logged in to report");
      return;
    }

    setIsSubmitting(true);
    try {
      const reportedByRole = profile?.role || (profile?.educatorId ? "educator" : "student");
      const reportedByName =
        profile?.displayName || profile?.fullName || firebaseUser.displayName || "Unknown User";

      await addDoc(collection(db, "question_reports"), {
        questionId,
        contextId,
        questionContent: questionContent || "",
        category,
        description: description.trim(),
        severity,
        status: "Open",
        reportedBy: firebaseUser.uid,
        reportedByName,
        reportedByRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Send push notifications to all admin users
      try {
        const adminsSnap = await getDocs(
          query(collection(db, "users"), where("role", "==", "ADMIN"))
        );
        if (!adminsSnap.empty) {
          const batch = writeBatch(db);
          adminsSnap.forEach((adminDoc) => {
            const notifRef = doc(collection(db, "users", adminDoc.id, "notifications"));
            batch.set(notifRef, {
              title: "Question Reported",
              body: `Question flagged as "${category}" by ${reportedByName}. Details: ${description.trim().substring(0, 100)}${description.trim().length > 100 ? "..." : ""}`,
              read: false,
              createdAt: serverTimestamp(),
              createdByRole: "EDUCATOR",
            });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error("Error creating admin notifications for reported question:", err);
      }

      toast.success("Question reported successfully");
      handleClose();
    } catch (e) {
      console.error("Error reporting question", e);
      toast.error("Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setCategory("");
    setDescription("");
    setSeverity("Medium");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Report Question</DialogTitle>
          <DialogDescription>
            Flag this question for review. Please provide details so we can fix it quickly.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the issue in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="severity">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
