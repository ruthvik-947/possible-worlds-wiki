import { Button } from './ui/button';
import { ArrowLeft } from 'lucide-react';

interface AboutProps {
  onBack: () => void;
}

export function About({ onBack }: AboutProps) {
  return (
    <div className="min-h-screen bg-glass-bg">
      {/* Fixed Top Navigation - consistent with main app */}
      <nav className="fixed top-0 left-0 right-0 bg-glass-text z-50 h-16">
        <div className="max-w-screen-2xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0 mr-4"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-2xl font-serif font-medium text-glass-bg tracking-wide">
              PWW
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-16 flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="max-w-2xl px-8 text-center animate-fade-in">
          <h1 className="font-serif text-6xl font-medium text-glass-text mb-6 tracking-wide">
            PossibleWorldWikis
          </h1>

          {/* <h2 className="font-serif text-2xl font-medium text-glass-text mb-4 tracking-wide">
            About
          </h2> */}

          <p className="text-base text-body leading-relaxed">
            Made to embrace LLM hallucinations, <br></br>by{' '}
            <a
              href="https://ruthvik.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-glass-accent hover:text-glass-accent/80 underline transition-colors"
            >
              Ruthvik Peddawandla
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}