import { SignedIn, SignedOut, SignIn, UserButton } from '@clerk/clerk-react';
import { WikiInterface } from './components/WikiInterface';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        {/* <span className="text-lg font-semibold">Procedural Wiki</span> */}
        <SignedIn>
          <UserButton afterSignOutUrl="/" /> 
        </SignedIn>
      </header>

      <main className="flex-1">
        <SignedOut>
          <div className="relative flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-hidden bg-glass-bg">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(95,175,218,0.15),transparent_65%)]" aria-hidden="true" />
            <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-10 px-6 text-center">
              {/* <h1 className="font-serif text-4xl font-medium tracking-wide text-glass-text">
                PossibleWorldWikis
              </h1> */}
              <SignIn
                routing="hash"
                fallbackRedirectUrl="/"r
                appearance={{
                  layout: {
                    logoPlacement: 'none',
                    socialButtonsVariant: 'blockButton',
                    shimmer: false
                  },
                  elements: {
                    card: 'glass-panel border border-glass-divider/60 shadow-[0_24px_48px_rgba(30,58,63,0.14)] rounded-[28px] p-6',
                    header: 'space-y-2 text-left',
                    headerTitle: 'font-serif text-2xl font-medium text-glass-text text-left',
                    headerSubtitle: 'hidden',
                    form: 'space-y-4',
                    formFieldLabel: 'text-xs font-medium uppercase tracking-[0.28em] text-glass-sidebar',
                    formFieldInput: 'bg-glass-bg/85 border border-glass-divider text-glass-text placeholder:text-glass-sidebar/70 focus:border-glass-accent focus:ring-0',
                    formButtonPrimary: 'bg-glass-text text-glass-bg hover:bg-glass-text/90',
                    socialButtonsBlockButton: 'border border-glass-divider text-glass-text hover:bg-glass-divider/40',
                    alternativeMethodsBlockButton: 'bg-glass-text text-glass-bg hover:bg-glass-text/90',
                    dividerText: 'text-glass-sidebar',
                    dividerLine: 'bg-glass-divider/60',
                    footer: 'hidden',
                    footerActionText: 'hidden',
                    footerActionLink: 'hidden'
                  },
                  variables: {
                    colorPrimary: '#1E3A3F',
                    colorText: '#1E3A3F',
                    colorTextSecondary: '#6B7C76',
                    fontFamily: 'Inter, system-ui, sans-serif'
                  }
                }}
              />
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
