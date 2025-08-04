import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { WikiPageData, generateSectionContent } from './WikiGenerator';
import { Search, User, Settings, Bell, Eye, Edit, Star, ChevronRight, ChevronDown, FileText, ChevronUp, Plus, Loader2, Download, Upload, Calendar, Clock, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';
import { WorldbuildingRecord, exportWorldbuildingRecord, importWorldbuildingRecord } from './WorldbuildingHistory';
import { Button } from './ui/button';

interface WikiPageProps {
  page: WikiPageData;
  onTermClick: (term: string, context: string) => void;
  worldbuildingHistory?: WorldbuildingRecord;
  onWorldbuildingImport?: (record: WorldbuildingRecord) => void;
  sessionId?: string;
  enableUserApiKeys?: boolean;
}

export function WikiPage({ page, onTermClick, worldbuildingHistory, onWorldbuildingImport, sessionId, enableUserApiKeys = false }: WikiPageProps) {
  const [sections, setSections] = useState<{ title: string; content: string }[]>(page.sections || []);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Reset sections when page changes
  useEffect(() => {
    setSections(page.sections || []);
    setIsAddingSection(false);
    setNewSectionTitle('');
    setIsGenerating(false);
  }, [page.id]);

  const handleExportWorldbuilding = () => {
    if (!worldbuildingHistory) {
      alert('No worldbuilding data available to export.');
      return;
    }
    
    const totalEntries = Object.values(worldbuildingHistory).reduce((total, group) => 
      total + Object.values(group).reduce((sum: number, entries) => sum + (entries as string[]).length, 0), 0
    );
    
    if (totalEntries === 0) {
      alert('No worldbuilding data to export. Generate some pages first!');
      return;
    }
    
    exportWorldbuildingRecord(worldbuildingHistory);
  };

  const handleImportWorldbuilding = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);

    importWorldbuildingRecord(file)
      .then((importedRecord) => {
        if (onWorldbuildingImport) {
          onWorldbuildingImport(importedRecord);
          alert('Worldbuilding record imported successfully!');
        }
      })
      .catch((error) => {
        setImportError(error.message);
        alert(`Import failed: ${error.message}`);
      })
      .finally(() => {
        // Reset the file input
        event.target.value = '';
      });
  };

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
            className="text-glass-accent hover:text-glass-accent/80 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 font-sans text-base leading-relaxed transition-colors"
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
    if (enableUserApiKeys && !sessionId) {
      alert('Please set your API key first before generating content.');
      return;
    }

    setIsGenerating(true);
    try {
      const newSection = await generateSectionContent(
        newSectionTitle,
        page.title,
        page.content,
        worldbuildingHistory,
        enableUserApiKeys ? sessionId : undefined
      );
      
      setSections(prev => [...prev, newSection]);
      setNewSectionTitle('');
      setIsAddingSection(false);
    } catch (error) {
      console.error('Failed to generate section:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex animate-fade-in h-full">
      {/* Main Content Area */}
      <main className="flex-1 px-8 py-12 overflow-auto">
      <div className="max-w-720 mx-auto">
        {/* Article Title Block */}
        <header className="text-center mb-12">
          <h1 className="font-serif text-6xl font-medium text-glass-text mb-6 tracking-wide leading-tight">
            {page.title}
          </h1>
          <div className="w-32 h-px bg-glass-divider mx-auto mb-6"></div>
          {/* <p className="text-glass-sidebar text-lg leading-relaxed max-w-2xl mx-auto">
            This is a summary of the topic.
          </p> */}
        </header>

        {/* Main Content */}
        <article className="prose prose-lg max-w-none mb-16">
          {page.content.split('\n\n').map((paragraph, idx) => (
            <p key={idx} className="mb-8 text-body leading-relaxed text-glass-text font-sans">
              {renderContentWithLinks(paragraph)}
            </p>
          ))}
        </article>

        {/* Sections */}
        {sections.length > 0 && (
          <div className="mb-16 space-y-12">
            {sections.map((section, index) => (
              <section key={index} className="border-t border-glass-divider pt-12">
                <h2 className="font-serif text-h2 font-medium text-glass-text mb-6 tracking-wide">
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
    <aside className="w-80 bg-glass-bg border-l border-glass-divider p-8 flex flex-col">
      <div className="flex-1">
        {/* Infobox */}
        <div className="glass-panel p-6 rounded-lg mb-8">
          <h3 className="font-serif text-xl font-medium text-glass-text mb-6">
            {page.title}
          </h3>
        
          {/* Image Placeholder */}
          <div className="mb-6">
            <div className="bg-glass-divider/30 rounded-lg h-48 flex items-center justify-center">
              <span className="text-glass-sidebar font-mono text-sm">Image</span>
            </div>
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
      
      {/* Worldbuilding History Panel */}
      {worldbuildingHistory && (
        <div className="glass-panel p-6 rounded-lg">
          <h3 className="font-serif text-lg font-medium text-glass-text mb-4">Worldbuilding</h3>
          
          {/* Worldbuilding Stats */}
          <div className="text-xs space-y-2 mb-6 font-mono">
            {Object.entries(worldbuildingHistory).map(([group, categories]) => (
              <div key={group}>
                {Object.entries(categories).map(([category, entries]) => {
                  if ((entries as string[]).length > 0) {
                    return (
                      <div key={category} className="text-glass-sidebar">
                        <span className="font-medium">{category}:</span> {(entries as string[]).length} entries
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ))}
          </div>
          
          {/* Export/Import Buttons */}
          <div className="space-y-3 pt-4 border-t border-glass-divider">
            <button
              onClick={handleExportWorldbuilding}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-glass-accent text-glass-bg rounded-lg hover:bg-glass-accent/90 font-medium transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Export World</span>
            </button>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleImportWorldbuilding}
                className="hidden"
                id="import-worldbuilding-page"
              />
              <label htmlFor="import-worldbuilding-page">
                <button className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-glass-sidebar text-glass-bg rounded-lg hover:bg-glass-sidebar/90 font-medium transition-colors cursor-pointer">
                  <Upload className="h-4 w-4" />
                  <span>Import World</span>
                </button>
              </label>
            </div>
          </div>
        </div>
      )}
    </aside>
    </div>
  );
}
