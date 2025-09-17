import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { WikiInterface } from './components/WikiInterface';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <span className="text-lg font-semibold">Procedural Wiki</span>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </header>

      <main className="flex-1">
        <SignedOut>
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <h1 className="text-2xl font-semibold">Sign in to start worldbuilding</h1>
            <p className="text-muted-foreground max-w-md">
              Create an account or sign in to track your usage, manage your API key, and generate new wiki entries.
            </p>
            <div className="flex gap-3">
              <SignInButton mode="modal">
                <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-4 py-2 rounded-md border border-input hover:bg-accent hover:text-accent-foreground">
                  Sign up
                </button>
              </SignUpButton>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          <WikiInterface />
        </SignedIn>
      </main>
    </div>
  );
}
