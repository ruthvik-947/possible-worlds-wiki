import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { WikiPageData, generateSectionContent } from './WikiGenerator';
import { Search, User, Settings, Bell, Eye, Edit, Star, ChevronRight, ChevronDown, FileText, ChevronUp, Plus, Loader2, Download, Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { WorldbuildingRecord, exportWorldbuildingRecord, importWorldbuildingRecord } from './WorldbuildingHistory';

interface WikiPageProps {
  page: WikiPageData;
  onTermClick: (term: string, context: string) => void;
  worldbuildingHistory?: WorldbuildingRecord;
  onWorldbuildingImport?: (record: WorldbuildingRecord) => void;
}

export function WikiPage({ page, onTermClick, worldbuildingHistory, onWorldbuildingImport }: WikiPageProps) {
  const [sections, setSections] = useState<{ title: string; content: string }[]>(page.sections || []);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Reset sections when page changes
  useEffect(() => {
    setSections(page.sections || []);
    setIsAddingSection(false);
    setNewSectionTitle('');
    setIsGenerating(false);
  }, [page.id]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onTermClick(searchQuery.trim(), page.content);
      setSearchQuery('');
    }
  };

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
            className="text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 font-inherit"
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
    try {
      const newSection = await generateSectionContent(
        newSectionTitle,
        page.title,
        page.content
      );
      
      setSections(prev => [...prev, newSection]);
      setNewSectionTitle('');
      setIsAddingSection(false);
    } catch (error) {
      console.error('Failed to generate section:', error);
      // You might want to show an error message to the user
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Wikipedia Logo */}
          <div className="flex items-center space-x-4">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-gray-800">PossibleWorldWikis</h1>
              <p className="text-sm text-gray-600">The Fictional Encyclopedia</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md mx-8">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                placeholder="Search Possible World Wiki"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 hover:text-gray-600"
              >
                <Search className="h-5 w-5" />
              </button>
            </form>
          </div>

          {/* Right Icons */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handleExportWorldbuilding}
              title="Export worldbuilding data"
              className={`p-2 rounded hover:bg-gray-100 ${
                worldbuildingHistory ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'
              }`}
              disabled={!worldbuildingHistory}
            >
              <Download className="h-5 w-5" />
            </button>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleImportWorldbuilding}
                className="hidden"
                id="import-worldbuilding-wikipage"
              />
              <label htmlFor="import-worldbuilding-wikipage">
                <button
                  title="Import worldbuilding data"
                  className="p-2 text-gray-600 hover:text-gray-800 rounded hover:bg-gray-100 cursor-pointer"
                >
                  <Upload className="h-5 w-5" />
                </button>
              </label>
            </div>
            <User className="h-5 w-5 text-gray-600 cursor-pointer hover:text-gray-800" />
            <Settings className="h-5 w-5 text-gray-600 cursor-pointer hover:text-gray-800" />
            <Bell className="h-5 w-5 text-gray-600 cursor-pointer hover:text-gray-800" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Main Content Area */}
        <main className="flex-1 p-8">
          <div className="max-w-4xl">
            {/* Article Title */}
            <h1 className="text-4xl font-bold text-gray-900 mb-6">{page.title}</h1>

            {/* Main Content */}
            <div className="prose prose-lg max-w-none">
              {page.content.split('\n\n').map((paragraph, idx) => (
                <p key={idx} className="mb-4 leading-relaxed text-gray-800">
                  {renderContentWithLinks(paragraph)}
                </p>
              ))}
            </div>

            {/* Sections */}
            {sections.length > 0 && (
              <div className="mt-8 space-y-6">
                {sections.map((section, index) => (
                  <div key={index} className="border-t border-gray-200 pt-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">{section.title}</h2>
                    <div className="prose prose-lg max-w-none">
                      <p className="leading-relaxed text-gray-800">
                        {renderContentWithLinks(section.content)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Section Button */}
            <div className="mt-8">
              {!isAddingSection ? (
                <button
                  onClick={() => setIsAddingSection(true)}
                  className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Section</span>
                </button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="section-title" className="block text-sm font-medium text-gray-700 mb-2">
                      Section Title
                    </label>
                    <input
                      id="section-title"
                      type="text"
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="Enter section title..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isGenerating}
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddSection}
                      disabled={!newSectionTitle.trim() || isGenerating}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* See Also Section */}
            <div className="mt-8">
              <div className="flex items-center space-x-2 mb-4">
                <Edit className="h-4 w-4 text-gray-500" />
                <h3 className="text-lg font-medium text-gray-800">See also</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  {page.relatedConcepts.slice(0, 6).map((concept, index) => (
                    <button
                      key={index}
                      onClick={() => onTermClick(concept.term, page.content)}
                      className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer bg-transparent border-none p-0 font-inherit w-full text-left"
                    >
                      <FileText className="h-3 w-3" />
                      <span>{concept.term}</span>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {page.relatedConcepts.slice(6, 12).map((concept, index) => (
                    <button
                      key={index}
                      onClick={() => onTermClick(concept.term, page.content)}
                      className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer bg-transparent border-none p-0 font-inherit w-full text-left"
                    >
                      <FileText className="h-3 w-3" />
                      <span>{concept.term}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Categories */}
            <div className="mt-8 p-4 bg-orange-50 rounded">
              <div className="text-sm text-gray-600">
                Categories: {page.categories.join(' • ')}
              </div>
            </div>

            {/* Last Edit */}
            <div className="mt-4 text-sm text-gray-500">
              Last edited on 16 November 2023, at 22:48 (UTC)
            </div>
          </div>
        </main>

        {/* Right Sidebar - Infobox */}
        <aside className="w-80 bg-white border-l border-gray-200 p-6 flex flex-col">
          <div className="flex-1">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-xl font-bold text-gray-800 mb-4">{page.title}</h3>
            
              {/* Image Placeholder */}
              <div className="mb-4">
                <div className="bg-gray-200 rounded h-40 flex items-center justify-center">
                  <span className="text-sm text-gray-500">Image Placeholder</span>
                </div>
              </div>
              <p className="text-sm font-bold text-gray-600 mb-4">Basic Facts</p>
              
              <div className="space-y-3">
                {page.basicFacts && page.basicFacts.length > 0 ? (
                  page.basicFacts.map((fact, index) => (
                    <div key={index} className="text-sm">
                      <span className="text-gray-600">{fact.name}: </span>
                      <span>{fact.value}</span>
                    </div>
                  ))
                ) : (
                  // Fallback to static content if no facts are available
                  <>
                    <div className="text-sm">
                      <span className="text-gray-600">Temporal range: </span>
                      <span>9,500 years ago - present</span>
                    </div>
                    
                    <div>
                      <button className="bg-blue-500 text-white px-3 py-1 rounded text-sm mb-1">
                        Conservation status
                      </button>
                      <div className="text-sm">Domesticated</div>
                    </div>
                    
                    <div>
                      <button className="bg-blue-500 text-white px-3 py-1 rounded text-sm mb-1">
                        Scientific classification
                      </button>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center space-x-2">
                          <span>Domain: Eukaryota</span>
                          <ChevronUp className="h-3 w-3" />
                        </div>
                        <div>Kingdom: Animalia</div>
                        <div>Class: Mammalia</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Fixed bottom section for worldbuilding data */}
          {worldbuildingHistory && (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Worldbuilding History</h3>
                
                {/* Worldbuilding Stats */}
                <div className="text-xs space-y-2 mb-4">
                  {Object.entries(worldbuildingHistory).map(([group, categories]) => (
                    <div key={group}>
                      {Object.entries(categories).map(([category, entries]) => {
                        if ((entries as string[]).length > 0) {
                          return (
                            <div key={category} className="text-muted-foreground">
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
                <div className="space-y-2">
                  <button
                    onClick={handleExportWorldbuilding}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
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
                      id="import-worldbuilding-sidebar"
                    />
                    <label htmlFor="import-worldbuilding-sidebar">
                      <button className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm cursor-pointer">
                        <Upload className="h-4 w-4" />
                        <span>Import World</span>
                      </button>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
