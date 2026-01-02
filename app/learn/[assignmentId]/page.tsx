import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function LearnPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-4 mb-4">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Coming Soon</h1>
          <p className="text-muted-foreground text-center">
            The student learning experience is under construction.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
