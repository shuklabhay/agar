"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, BookOpen, Pencil, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function ClassesPage() {
  const router = useRouter();
  const classes = useQuery(api.classes.listClasses);
  const createClass = useMutation(api.classes.createClass);
  const renameClass = useMutation(api.classes.renameClass);
  const deleteClass = useMutation(api.classes.deleteClass);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"classes">;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: Id<"classes">;
    name: string;
    section?: string;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editSection, setEditSection] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const classId = await createClass({
        name: name.trim(),
        section: section.trim() || undefined,
      });
      setName("");
      setSection("");
      setIsDialogOpen(false);
      router.push(`/classes/${classId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteClass({ classId: deleteTarget.id });
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete class");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !editName.trim()) return;
    setIsRenaming(true);
    try {
      await renameClass({
        classId: renameTarget.id,
        name: editName.trim(),
        section: editSection.trim() || undefined,
      });
      toast.success("Class renamed");
      setRenameTarget(null);
      setEditName("");
      setEditSection("");
    } catch {
      toast.error("Failed to rename class");
    } finally {
      setIsRenaming(false);
    }
  };

  if (classes === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading classes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
          <p className="text-muted-foreground mt-1">
            Manage your classes and students
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Create Class
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleCreateClass}>
              <DialogHeader>
                <DialogTitle>Create a New Class</DialogTitle>
                <DialogDescription>
                  Add a new class to start managing students and assignments.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Class Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Biology 101"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="section">
                    Section
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="section"
                    placeholder="e.g., Period 1"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !name.trim()}>
                  {isSubmitting ? "Creating..." : "Create Class"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Classes Grid */}
      {classes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No classes yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Create your first class to start organizing your students and
              assignments.
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Your First Class
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((classItem) => (
            <div key={classItem._id} className="group relative">
              <Link href={`/classes/${classItem._id}`}>
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 group-hover:bg-muted/30">
                  <CardHeader className="pr-20">
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {classItem.name}
                    </CardTitle>
                    {classItem.section && (
                      <Badge variant="secondary" className="mt-2 w-fit">
                        {classItem.section}
                      </Badge>
                    )}
                  </CardHeader>
                </Card>
              </Link>
              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRenameTarget({
                      id: classItem._id,
                      name: classItem.name,
                      section: classItem.section,
                    });
                    setEditName(classItem.name);
                    setEditSection(classItem.section || "");
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteTarget({
                      id: classItem._id,
                      name: classItem.name,
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Are you sure you want to delete &quot;{deleteTarget?.name}
                &quot;?
              </span>
              <span className="block">
                This will permanently delete all assignments, files, and
                questions. This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Class Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Class name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-section">Section (optional)</Label>
              <Input
                id="edit-section"
                value={editSection}
                onChange={(e) => setEditSection(e.target.value)}
                placeholder="e.g., Period 1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={isRenaming || !editName.trim()}
            >
              {isRenaming ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
