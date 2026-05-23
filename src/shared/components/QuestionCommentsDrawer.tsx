import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@shared/ui/sheet";
import { Button } from "@shared/ui/button";
import { Textarea } from "@shared/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import { toast } from "sonner";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Loader2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type QuestionCommentsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  questionId: string;
  contextId: string;
};

export default function QuestionCommentsDrawer({
  isOpen,
  onClose,
  questionId,
  contextId,
}: QuestionCommentsDrawerProps) {
  const { firebaseUser, profile } = useAuth();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !questionId) return;

    const q = query(
      collection(db, "question_comments"),
      where("questionId", "==", questionId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetched = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setComments(fetched);
        setIsLoading(false);
      },
      (err) => {
        console.error("Error fetching comments", err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [isOpen, questionId]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    if (!firebaseUser) {
      toast.error("You must be logged in to comment");
      return;
    }

    setIsSubmitting(true);
    try {
      const authorRole = profile?.role || (profile?.educatorId ? "educator" : "student");
      const authorName =
        profile?.displayName || profile?.fullName || firebaseUser.displayName || "Unknown User";

      await addDoc(collection(db, "question_comments"), {
        questionId,
        contextId,
        authorId: firebaseUser.uid,
        authorName,
        authorRole,
        message: message.trim(),
        mentions: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage("");
    } catch (e) {
      console.error("Error posting comment", e);
      toast.error("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setMessage("");
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="flex h-full w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Comments & Discussion</SheetTitle>
          <SheetDescription>
            Discuss this question with educators and other students.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-2">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No comments yet. Start the discussion!
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3 text-sm">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.authorName}`}
                  />
                  <AvatarFallback>{comment.authorName?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{comment.authorName}</span>
                    <Badge variant="secondary" className="h-4 px-1 py-0 text-[10px]">
                      {comment.authorRole}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {comment.createdAt?.toDate
                        ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true })
                        : "Just now"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-muted-foreground">{comment.message}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-auto border-t pt-4">
          <div className="relative">
            <Textarea
              placeholder="Type your comment here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[80px] resize-none pr-12"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button
              size="icon"
              className="absolute bottom-2 right-2 h-8 w-8 rounded-full"
              disabled={!message.trim() || isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Press Enter to post, Shift+Enter for new line.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
