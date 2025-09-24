import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Lock, Users, Copy } from 'lucide-react';
import { SignUpButton, SignInButton } from '@clerk/clerk-react';

interface AuthPromptDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  onCopyWorld?: () => void;
  sharedWorldMetadata?: {
    name: string;
    description: string;
    viewsCount: number;
    copiesCount: number;
    isOwner: boolean;
  };
}

export function AuthPromptDialog({
  isOpen,
  onOpenChange,
  action,
  onCopyWorld,
  sharedWorldMetadata
}: AuthPromptDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md glass-panel border-glass-divider !bg-glass-bg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glass-text font-serif">
            <Lock className="h-5 w-5" />
            Sign in Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-left space-y-3">
            <p className="text-glass-text">
              Sign in or create an account to <strong>{action}</strong>
            </p>
            <p className="text-sm text-glass-sidebar">
              This is a shared world that you're viewing in read-only mode.
              Sign in or create an account to make your own copy and start editing.
            </p>
          </div>

          <div className="space-y-3">
            <SignUpButton mode="modal">
            <button className="w-full rounded-full bg-glass-text px-6 py-2 text-sm font-semibold text-glass-bg transition hover:bg-glass-text/90">
                Create Account & Copy World
              </button>
            </SignUpButton>

            <SignInButton mode="modal">
              <button className="w-full rounded-full border border-glass-divider px-6 py-2 text-sm font-semibold text-glass-text transition hover:bg-glass-divider/40">
                    Sign In
              </button>
            </SignInButton>

          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}