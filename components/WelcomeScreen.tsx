import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader } from 'lucide-react';
import { ApiKeyDialog } from './ApiKeyDialog';
import { WorldManager, AutoSaveInfo } from './WorldManager';
import { World } from './WorldModel';

interface WelcomeScreenProps {
  seedSentence: string;
  setSeedSentence: (seed: string) => void;
  isLoading: boolean;
  errorMessage: string | null;
  currentWorld: World;
  autoSaveInfo: AutoSaveInfo;
  enableUserApiKeys: boolean;
  hasUserApiKey: boolean;
  isApiDialogOpen: boolean;
  setIsApiDialogOpen: (open: boolean) => void;
  onGenerateFirstPage: () => void;
  onLoadWorld: (world: World) => void;
  onNewWorld: () => void;
  onImportWorld: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onApiKeyStored: () => void;
  onApiKeyRemoved: () => void;
  onShowAbout: () => void;
}

export function WelcomeScreen({
  seedSentence,
  setSeedSentence,
  isLoading,
  errorMessage,
  currentWorld,
  autoSaveInfo,
  enableUserApiKeys,
  hasUserApiKey,
  isApiDialogOpen,
  setIsApiDialogOpen,
  onGenerateFirstPage,
  onLoadWorld,
  onNewWorld,
  onImportWorld,
  onApiKeyStored,
  onApiKeyRemoved,
  onShowAbout,
}: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl sm:max-w-2xl animate-fade-in">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium text-glass-text mb-6 tracking-wide">
            PossibleWorldWikis
          </h1>
        </div>

        <Card className="glass-panel">
          <CardHeader className="text-center px-4 sm:px-6">
            <CardTitle className="font-sans text-base sm:text-lg text-glass-text">
              Seed a world with the title of its first wiki page.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 flex flex-col px-4 sm:px-6">
            <Input
              value={seedSentence}
              onChange={(e) => setSeedSentence(e.target.value)}
              className="text-body border-glass-divider focus:border-glass-accent bg-glass-bg/50"
              maxLength={200}
            />
            {errorMessage && (
              <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              {enableUserApiKeys && (
                <div className="relative">
                  <ApiKeyDialog
                    hasApiKey={hasUserApiKey}
                    onStored={onApiKeyStored}
                    onRemoved={onApiKeyRemoved}
                    isLoading={isLoading}
                    open={isApiDialogOpen}
                    onOpenChange={setIsApiDialogOpen}
                  />
                </div>
              )}
              <Button
                onClick={onGenerateFirstPage}
                disabled={!seedSentence.trim() || isLoading}
                className={`${enableUserApiKeys ? 'sm:flex-1' : 'w-full'} bg-glass-text hover:bg-glass-text/90 text-glass-bg font-medium py-3`}
              >
                {isLoading ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Building...
                  </>
                ) : (
                  'Generate'
                )}
              </Button>
            </div>

            <div className="pt-6 border-t border-glass-divider">
              <WorldManager
                currentWorld={currentWorld}
                onLoadWorld={onLoadWorld}
                onNewWorld={onNewWorld}
                onImportWorld={onImportWorld}
                isLoading={isLoading}
                variant="welcome"
                autoSaveInfo={autoSaveInfo}
              />
            </div>
          </CardContent>
        </Card>

        {/* About link */}
        <div className="text-center mt-8">
          <button
            onClick={onShowAbout}
            className="text-glass-sidebar hover:text-glass-accent text-sm transition-colors underline"
          >
            About
          </button>
        </div>
      </div>
    </div>
  );
}