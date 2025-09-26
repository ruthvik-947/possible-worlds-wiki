import { useState, useEffect } from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton
} from '@clerk/clerk-react';
import { WikiInterface } from './components/WikiInterface';
import { SharedWorldView } from './components/SharedWorldView';
import { Analytics } from "@vercel/analytics/react"

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<{
    type: 'home' | 'shared';
    shareSlug?: string;
  }>({ type: 'home' });

  // Simple URL parsing for shared world routes
  useEffect(() => {
    const path = window.location.pathname;
    const sharedWorldMatch = path.match(/^\/world\/([a-zA-Z0-9]+)$/);

    if (sharedWorldMatch) {
      setCurrentRoute({
        type: 'shared',
        shareSlug: sharedWorldMatch[1]
      });
    } else {
      setCurrentRoute({ type: 'home' });
    }

    // Handle browser back/forward
    const handlePopState = () => {
      const newPath = window.location.pathname;
      const newMatch = newPath.match(/^\/world\/([a-zA-Z0-9]+)$/);

      if (newMatch) {
        setCurrentRoute({
          type: 'shared',
          shareSlug: newMatch[1]
        });
      } else {
        setCurrentRoute({ type: 'home' });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleBackToHome = () => {
    window.history.pushState({}, '', '/');
    setCurrentRoute({ type: 'home' });
  };

  // If viewing a shared world, show SharedWorldView for both signed in and signed out users
  if (currentRoute.type === 'shared' && currentRoute.shareSlug) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <main className="flex-1">
          <SharedWorldView
            shareSlug={currentRoute.shareSlug}
            onBackToHome={handleBackToHome}
          />
          <Analytics />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      <main className="flex-1">
        <SignedOut>
          <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-glass-bg py-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(95,175,218,0.15),transparent_65%)]" aria-hidden="true" />
            <div className="relative z-10 flex w-full max-w-6xl flex-col items-center px-6 text-center space-y-12">

              {/* Title */}
              <div>
                <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium text-glass-text tracking-wide">
                  PossibleWorldWikis
                </h1>
              </div>

              {/* Demo Video */}
              <div className="w-full max-w-4xl">
                <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg shadow-lg">
                  <iframe
                    src="https://www.loom.com/embed/dc2016054fde4d1ea1fc3e87e988dabf"
                    frameBorder="0"
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full"
                    title="PossibleWorldWikis Demo"
                  ></iframe>
                </div>

                {/* Demo World Link */}
                <div className="mt-8 text-center">
                  <span className="text-glass-text text-base">
                    <a
                      href="https://possibleworldwikis.com/world/c5qt1nmgdr"
                      className="text-glass-accent hover:text-glass-accent/80 transition-colors underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Explore
                    </a>
                    {" "}a demo world
                  </span>
                </div>
              </div>

              {/* Auth Buttons */}
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
                <SignUpButton mode="modal">
                  <button
                    className="rounded-full bg-glass-text text-sm font-semibold text-glass-bg transition hover:bg-glass-text/90"
                    style={{ padding: '12px 48px' }}
                  >
                    Create an account
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button
                    className="rounded-full border border-glass-divider text-sm font-semibold text-glass-text transition hover:bg-glass-divider/40"
                    style={{ padding: '12px 48px' }}
                  >
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
