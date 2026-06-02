"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Power,
  PowerOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import {
  updateUserRoleAction,
  toggleUserActiveAction,
  resetUserPasswordAction,
} from "./actions";

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(10);
  if (typeof crypto !== "undefined") crypto.getRandomValues(arr);
  else for (let i = 0; i < 10; i++) arr[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < 10; i++) out += chars[arr[i] % chars.length];
  return out;
}

export function UserRowActions({
  userId,
  email,
  role,
  isActive,
  isSelf,
}: {
  userId: string;
  email: string;
  role: "admin" | "staff";
  isActive: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handleRoleChange = () => {
    const newRole = role === "admin" ? "staff" : "admin";
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, newRole);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${email} is now ${newRole}.`);
      router.refresh();
    });
  };

  const handleToggleActive = () => {
    startTransition(async () => {
      const result = await toggleUserActiveAction(userId);
      if (!result.ok) {
        toast.error(result.error);
        setToggleOpen(false);
        return;
      }
      toast.success(
        isActive ? `${email} deactivated.` : `${email} reactivated.`
      );
      setToggleOpen(false);
      router.refresh();
    });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await resetUserPasswordAction(userId, newPassword);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Password reset for ${email}. Share it securely — it's not stored.`,
        { duration: 10000 }
      );
      setResetOpen(false);
      setNewPassword("");
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!isSelf && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRoleChange}
            disabled={isPending}
            title={role === "admin" ? "Demote to staff" : "Promote to admin"}
          >
            {role === "admin" ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              Make {role === "admin" ? "staff" : "admin"}
            </span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setNewPassword(generatePassword());
            setResetOpen(true);
          }}
          disabled={isPending}
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset password</span>
        </Button>
        {!isSelf && (
          <Button
            variant={isActive ? "outline" : "default"}
            size="sm"
            onClick={() => setToggleOpen(true)}
            disabled={isPending}
          >
            {isActive ? (
              <PowerOff className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isActive ? "Deactivate" : "Reactivate"}
            </span>
          </Button>
        )}
      </div>

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for <span className="font-medium">{email}</span>
              . They'll sign in with this immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">New password</Label>
              <div className="flex gap-2">
                <Input
                  id="new_password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono"
                  minLength={8}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNewPassword(generatePassword())}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm toggle active */}
      <AlertDialog open={toggleOpen} onOpenChange={setToggleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive ? "Deactivate" : "Reactivate"} {email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? "They will no longer be able to sign in. You can reactivate them later."
                : "They'll be able to sign in again with their existing password."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActive} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isActive ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
