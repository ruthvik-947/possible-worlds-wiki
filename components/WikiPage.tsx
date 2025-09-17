import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { WikiPageData, generateSectionContent, generatePageImage } from './WikiGenerator';
import { Search, User, Settings, Bell, Eye, Edit, Star, ChevronRight, ChevronDown, FileText, ChevronUp, Plus, Loader2, Calendar, Clock, Sun, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { WorldbuildingRecord } from './WorldbuildingHistory';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { useAuth } from '@clerk/clerk-react';

interface WikiPageProps {
  page: WikiPageData;
  onTermClick: (term: string, context: string) => void;
  worldbuildingHistory?: WorldbuildingRecord;
  enableUserApiKeys?: boolean;
  isStreaming?: boolean;
  streamingData?: WikiPageData | null;
  onUsageUpdate?: (usageInfo: any) => void;
  generatedImageUrl?: string;
  onImageGenerated?: (pageId: string, imageUrl: string) => void;
}

// Infobox component for reuse
const Infobox = ({
  page,
  onGenerateImage,
  generatedImageUrl,
  isGeneratingImage,
  imageProgress
}: {
  page: WikiPageData;
  onGenerateImage: () => void;
  generatedImageUrl?: string;
  isGeneratingImage: boolean;
  imageProgress?: { status: string; progress: number; message: string };
}) => (
  <div className="flex-1">
    {/* Infobox */}
    <div className="glass-panel p-6 rounded-lg mb-8">
      <h3 className="font-serif text-xl font-medium text-glass-text mb-6">
        {page.title}
      </h3>

      {/* Image Section */}
      <div className="mb-6">
        {generatedImageUrl ? (
          <div className="rounded-lg overflow-hidden">
            <img
              src={generatedImageUrl}
              alt={`Illustration of ${page.title}`}
              className="w-full h-48 object-cover"
            />
          </div>
        ) : (
          <div
            className="bg-glass-divider/30 rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-glass-divider/40 transition-colors"
            onClick={onGenerateImage}
          >
            {isGeneratingImage ? (
              <div className="text-center">
                <Loader2 className="h-6 w-6 animate-spin text-glass-accent mx-auto mb-2" />
                <span className="text-glass-sidebar font-mono text-xs">
                  {imageProgress?.message || 'Generating image...'}
                </span>
                {imageProgress?.progress && (
                  <div className="w-24 bg-glass-divider/30 rounded-full h-1 mt-2">
                    <div
                      className="bg-glass-accent h-1 rounded-full transition-all duration-300"
                      style={{ width: `${imageProgress.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center">
                <ImageIcon className="h-6 w-6 text-glass-sidebar mb-2" />
                <span className="text-glass-sidebar font-mono text-sm">Click to generate image</span>
              </div>
            )}
          </div>
        )}
      </div>

      <h4 className="font-serif font-medium text-glass-text mb-4">Basic Facts</h4>

      <div className="space-y-3">
        {page.basicFacts && page.basicFacts.length > 0 ? (
          page.basicFacts.map((fact, index) => (
            <div key={index} className="text-sm">
              <span className="text-glass-sidebar font-medium">{fact.name}:</span>
              <span className="text-glass-text ml-2">{fact.value}</span>
            </div>
          ))
        ) : (
          <>
            {/* Fallback content */}
            <div className="text-sm">
              <span className="text-glass-sidebar font-medium">Temporal range:</span>
              <span className="text-glass-text ml-2">9,500 years ago - present</span>
            </div>

            <div>
              <div className="inline-block bg-glass-accent text-glass-bg px-3 py-1 rounded text-sm mb-2 font-medium">
                Conservation status
              </div>
              <div className="text-sm text-glass-text">Domesticated</div>
            </div>

            <div>
              <div className="inline-block bg-glass-accent text-glass-bg px-3 py-1 rounded text-sm mb-2 font-medium">
                Scientific classification
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-glass-text">Domain: Eukaryota</span>
                  <ChevronUp className="h-3 w-3 text-glass-sidebar" />
                </div>
                <div className="text-glass-text">Kingdom: Animalia</div>
                <div className="text-glass-text">Class: Mammalia</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
);

export function WikiPage({ page, onTermClick, worldbuildingHistory, enableUserApiKeys = false, isStreaming = false, streamingData, onUsageUpdate, generatedImageUrl, onImageGenerated }: WikiPageProps) {

  // If no page data is available, don't render anything
  if (!page) {
    return null;
  }

  const [sections, setSections] = useState<{ title: string; content: string }[]>(page.sections || []);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Image generation state
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ status: string; progress: number; message: string } | undefined>(undefined);

  const { getToken } = useAuth();

  const requireAuthToken = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    if (!token) {
      throw new Error('Unable to retrieve authentication token from Clerk. Please sign in again.');
    }
    return token;
  }, [getToken]);

  // Reset sections when page changes
  useEffect(() => {
    setSections(page.sections || []);
    setIsAddingSection(false);
    setNewSectionTitle('');
    setIsGenerating(false);
    setIsGeneratingImage(false);
    setImageProgress(undefined);
  }, [page.id]);

  const renderContentWithLinks = (content: string) => {
    if (page.clickableTerms.length === 0) {
      return <span>{content}</span>;
    }

    const regex = new RegExp(`(${page.clickableTerms.join('|')})`, 'g');
    const parts = content.split(regex);

    return parts.map((part, index) => {
      if (page.clickableTerms.includes(part)) {
        return (
          <button
            key={index}
            onClick={() => onTermClick(part, content)}
            className="text-glass-accent hover:text-glass-accent/80 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 font-sans text-body leading-relaxed transition-colors"
          >
            {part}
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const handleAddSection = async () => {
    if (!newSectionTitle.trim()) return;

    setIsGenerating(true);

    let authToken: string;
    try {
      authToken = await requireAuthToken();
    } catch (authError) {
      console.error('Failed to fetch auth token for section generation:', authError);
      toast.error(authError instanceof Error ? authError.message : 'Authentication error. Please sign in again.');
      setIsGenerating(false);
      return;
    }

    try {
      const newSection = await generateSectionContent(
        newSectionTitle,
        page.title,
        page.content,
        worldbuildingHistory,
        undefined,
        authToken
      );

      setSections(prev => [...prev, newSection]);
      setNewSectionTitle('');
      setIsAddingSection(false);

      // Update usage info if provided and callback exists
      if (newSection.usageInfo && onUsageUpdate) {
        onUsageUpdate(newSection.usageInfo);
      }
    } catch (error: any) {
      console.error('Failed to generate section:', error);
      if (error instanceof Error && error.message.includes('authentication token')) {
        toast.error(error.message);
      } else if (error.code === 'RATE_LIMIT_EXCEEDED' || error.code === 'API_KEY_REQUIRED') {
        toast.error(error.message || 'Please provide your API key to continue generating content.');
      } else {
        toast.error('Failed to generate section. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (isGeneratingImage) return;

    setIsGeneratingImage(true);
    setImageProgress({ status: 'generating', progress: 0, message: 'Starting image generation...' });

    let authToken: string;
    try {
      authToken = await requireAuthToken();
    } catch (authError) {
      console.error('Failed to fetch auth token for image generation:', authError);
      toast.error(authError instanceof Error ? authError.message : 'Authentication error. Please sign in again.');
      setIsGeneratingImage(false);
      setImageProgress(undefined);
      return;
    }

    try {
      const result = await generatePageImage(
        page.title,
        page.content,
        worldbuildingHistory,
        (progress) => {
          setImageProgress(progress);
        },
        authToken
      );

      if (onImageGenerated) {
        onImageGenerated(page.id, result.imageUrl);
      }

      // Update usage info if provided and callback exists
      if (result.usageInfo && onUsageUpdate) {
        onUsageUpdate(result.usageInfo);
      }

      toast.success('Image generated successfully!');
    } catch (error: any) {
      console.error('Failed to generate image:', error);
      if (error instanceof Error && error.message.includes('authentication token')) {
        toast.error(error.message);
      } else if (error.code === 'RATE_LIMIT_EXCEEDED' || error.code === 'API_KEY_REQUIRED') {
        toast.error(error.message || 'Please provide your API key to continue generating content.');
      } else {
        toast.error('Failed to generate image. Please try again.');
      }
    } finally {
      setIsGeneratingImage(false);
      setImageProgress(undefined);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row animate-fade-in h-full">
      {/* Main Content Area */}
      <main className="flex-1 px-4 sm:px-8 py-12 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Article Title Block */}
          <header className="text-center mb-12">
            <h1 className="font-serif text-5xl md:text-6xl font-medium text-glass-text mb-6 tracking-wide leading-tight">
              {streamingData?.title || page.title}
            </h1>
            <div className="w-32 h-px bg-glass-divider mx-auto mb-6"></div>
          </header>

          {/* Mobile Infobox */}
          <div className="lg:hidden mb-8">
            <Infobox
              page={page}
              onGenerateImage={handleGenerateImage}
              generatedImageUrl={generatedImageUrl}
              isGeneratingImage={isGeneratingImage}
              imageProgress={imageProgress}
            />
          </div>

          {/* Main Content */}
          <article className="prose prose-lg max-w-none mb-16">
            {(streamingData?.content || page.content).split('\n\n').map((paragraph, idx) => (
              <p key={idx} className={`mb-8 text-body leading-relaxed text-glass-text font-sans ${
                isStreaming ? 'animate-fade-in' : ''
              }`}>
                {renderContentWithLinks(paragraph)}
              </p>
            ))}
            {isStreaming && streamingData && (
              <div className="flex items-center space-x-2 mt-4 animate-fade-in">
                <div className="w-2 h-2 bg-glass-accent rounded-full animate-typing"></div>
                <span className="text-glass-sidebar text-sm">Generating content...</span>
              </div>
            )}
          </article>

          {/* Sections */}
          {sections.length > 0 && (
            <div className="mb-16 space-y-12">
              {sections.map((section, index) => (
                <section key={index} className="border-t border-glass-divider pt-12">
                  <h2 className="font-serif text-3xl md:text-h2 font-medium text-glass-text mb-6 tracking-wide">
                    {section.title}
                  </h2>
                  <div className="prose prose-lg max-w-none">
                    <p className="text-body leading-relaxed text-glass-text font-sans">
                      {renderContentWithLinks(section.content)}
                    </p>
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* Add Section Interface */}
          <div className="mb-16 border-t border-glass-divider pt-8">
            {!isAddingSection ? (
              <button
                onClick={() => setIsAddingSection(true)}
                className="flex items-center space-x-2 text-glass-accent hover:text-glass-accent/80 font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Section</span>
              </button>
            ) : (
              <div className="glass-panel p-6 rounded-lg">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="section-title" className="block font-medium text-glass-text mb-2">
                      Section Title
                    </label>
                    <input
                      id="section-title"
                      type="text"
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="Enter section title..."
                      className="w-full px-4 py-3 border border-glass-divider rounded-lg focus:outline-none focus:border-glass-accent bg-glass-bg text-glass-text transition-colors"
                      disabled={isGenerating}
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddSection}
                      disabled={!newSectionTitle.trim() || isGenerating}
                      className="flex items-center space-x-2 px-6 py-3 bg-glass-accent text-glass-bg rounded-lg hover:bg-glass-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          <span>Add Section</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingSection(false);
                        setNewSectionTitle('');
                      }}
                      disabled={isGenerating}
                      className="px-6 py-3 text-glass-sidebar hover:text-glass-text disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* See Also Section */}
          <section className="mb-12">
            <h3 className="font-serif text-xl font-medium text-glass-text mb-6 flex items-center">
              <Edit className="h-5 w-5 text-glass-sidebar mr-2" />
              See also
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {page.relatedConcepts.slice(0, 12).map((concept, index) => (
                <button
                  key={index}
                  onClick={() => onTermClick(concept.term, page.content)}
                  className="flex items-center space-x-3 p-3 text-left text-glass-accent hover:text-glass-accent/80 hover:bg-glass-divider/20 rounded-lg transition-colors"
                >
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">{concept.term}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Categories */}
          <div className="p-6 bg-glass-highlight/10 rounded-lg border border-glass-highlight/20">
            <p className="text-glass-sidebar font-mono text-sm">
              <span className="font-medium">Categories:</span> {page.categories.join(' • ')}
            </p>
          </div>

          {/* Last Edit Info */}
          <div className="mt-8 text-glass-sidebar text-sm font-mono flex items-center">
            <Clock className="h-4 w-4 mr-2" />
            Last edited 3 days ago
          </div>
        </div>
      </main>

      {/* Right Infobox Sidebar */}
      <aside className="w-[320px] bg-glass-bg border-l border-glass-divider p-8 flex-col hidden lg:flex h-full overflow-auto">
        <Infobox
          page={page}
          onGenerateImage={handleGenerateImage}
          generatedImageUrl={generatedImageUrl}
          isGeneratingImage={isGeneratingImage}
          imageProgress={imageProgress}
        />
      </aside>
    </div>
  );
}
