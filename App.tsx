import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton
} from '@clerk/clerk-react';
import { WikiInterface } from './components/WikiInterface';
import { Analytics } from "@vercel/analytics/react"

export default function App() {

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      <main className="flex-1">
        <SignedOut>
          <div className="relative flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-hidden bg-glass-bg">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(95,175,218,0.15),transparent_65%)]" aria-hidden="true" />
            <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-8 px-6 text-center">
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium text-glass-text mb-6 tracking-wide">
            PossibleWorldWikis
              </h1>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <SignUpButton mode="modal">
                  <button className="rounded-full bg-glass-text px-6 py-2 text-sm font-semibold text-glass-bg transition hover:bg-glass-text/90">
                    Create an account
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button className="rounded-full border border-glass-divider px-6 py-2 text-sm font-semibold text-glass-text transition hover:bg-glass-divider/40">
                    Sign in
                  </button>
                </SignInButton>
              </div>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          <WikiInterface />
        </SignedIn>

        <Analytics />
      </main>
    </div>
  );
}
