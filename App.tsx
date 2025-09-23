import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton
} from '@clerk/clerk-react';
import { WikiInterface } from './components/WikiInterface';
import { Analytics } from "@vercel/analytics/react"

export default function App() {
  const authAppearance = {
    layout: {
      socialButtonsVariant: 'blockButton',
      shimmer: false
    },
    elements: {
      card: 'glass-panel border border-glass-divider/60 shadow-[0_24px_48px_rgba(30,58,63,0.14)] rounded-[28px] p-6',
      header: 'space-y-2 text-left',
      headerTitle: 'font-serif text-2xl font-medium text-glass-text text-left',
      headerSubtitle: 'text-sm text-glass-sidebar',
      form: 'space-y-4',
      formFieldLabel: 'text-xs font-medium uppercase tracking-[0.28em] text-glass-sidebar',
      formFieldInput:
        'bg-glass-bg/85 border border-glass-divider text-glass-text placeholder:text-glass-sidebar/70 focus:border-glass-accent focus:ring-0',
      formButtonPrimary: 'bg-glass-text text-glass-bg hover:bg-glass-text/90',
      socialButtonsBlockButton: 'border border-glass-divider text-glass-text hover:bg-glass-divider/40',
      alternativeMethodsBlockButton: 'bg-glass-text text-glass-bg hover:bg-glass-text/90',
      dividerText: 'text-glass-sidebar',
      dividerLine: 'bg-glass-divider/60'
    },
    variables: {
      colorPrimary: '#1E3A3F',
      colorText: '#1E3A3F',
      colorTextSecondary: '#6B7C76',
      fontFamily: 'Inter, system-ui, sans-serif'
    }
  } as const;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        {/* <span className="text-lg font-semibold">Procedural Wiki</span> */}
        <SignedOut>
        </SignedOut>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </header>

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
