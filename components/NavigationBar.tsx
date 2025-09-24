import { Button } from './ui/button';
import { Input } from './ui/input';
import { Menu, Search, Settings, Key, Info, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { SignOutButton } from '@clerk/clerk-react';
import { WikiPageData } from './WikiGenerator';

interface NavigationBarProps {
  currentPage: WikiPageData | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onHome: () => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  enableUserApiKeys: boolean;
  hasUserApiKey: boolean;
  onApiDialogOpen: () => void;
  onShowAbout: () => void;
}

export function NavigationBar({
  currentPage,
  searchQuery,
  setSearchQuery,
  onSearch,
  onHome,
  isSidebarOpen,
  setIsSidebarOpen,
  enableUserApiKeys,
  hasUserApiKey,
  onApiDialogOpen,
  onShowAbout,
}: NavigationBarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-glass-text z-50 h-16">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          {currentPage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0 mr-4"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <button
            onClick={onHome}
            className="text-2xl font-serif font-medium text-glass-bg tracking-wide hover:text-glass-bg/80 transition-colors cursor-pointer"
          >
            PWW
          </button>
        </div>

        {/* Center Search Bar */}
        {currentPage && (
          <div className="flex-1 max-w-md mx-4 sm:mx-6 lg:mx-8">
            <form onSubmit={onSearch} className="relative">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-glass-sidebar" />
              <Input
                placeholder="Search or generate new page..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 sm:pl-12 pr-10 sm:pr-12 bg-glass-bg/10 border-glass-divider/30 text-glass-text placeholder:text-glass-sidebar/70 rounded-full backdrop-blur-sm focus:bg-glass-bg/20 transition-colors text-sm sm:text-base"
                maxLength={200}
              />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text hover:bg-glass-bg/10 rounded-full"
              >
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>
        )}

        {/* Right Menu */}
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white border border-gray-200 shadow-lg">
              {enableUserApiKeys && (
                <>
                  <DropdownMenuItem
                    onClick={onApiDialogOpen}
                    className="cursor-pointer"
                  >
                    <Key className="mr-2 h-4 w-4" />
                    {hasUserApiKey ? 'Manage API Key' : 'Set API Key'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={onShowAbout}
                className="cursor-pointer"
              >
                <Info className="mr-2 h-4 w-4" />
                About
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <SignOutButton signOutOptions={{ redirectUrl: '/' }}>
                <DropdownMenuItem className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </SignOutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}