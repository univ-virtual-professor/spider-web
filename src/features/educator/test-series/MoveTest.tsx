import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { cn } from "@shared/lib/utils";
import { BookOpen, Folder } from "lucide-react";

const MoveTest = ({ moveTestOpen, setMoveTestOpen, testToMove, handleMoveTest, folders }) => {
  return (
    <Dialog open={moveTestOpen} onOpenChange={setMoveTestOpen}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Move to Folder</DialogTitle>
          <DialogDescription>Select a folder to move "{testToMove?.title}" into.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <div
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent",
              !testToMove?.folderId && "border-primary bg-primary/5"
            )}
            onClick={() => handleMoveTest(testToMove.id, null)}
          >
            <div className="rounded-lg bg-muted p-2">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Subject Folder (Default)</p>
              <p className="text-xs text-muted-foreground">Move back to auto-subject grouping</p>
            </div>
          </div>

          {folders.map((f) => (
            <div
              key={f.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent",
                testToMove?.folderId === f.id && "border-primary bg-primary/5"
              )}
              onClick={() => handleMoveTest(testToMove.id, f.id)}
            >
              <div className="rounded-lg bg-primary/10 p-2">
                <Folder className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{f.name}</p>
              </div>
            </div>
          ))}

          {folders.length === 0 && (
            <p className="py-4 text-center text-sm italic text-muted-foreground">
              No custom folders created yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MoveTest;
