export interface WorldbuildingRecord {
  mental: Record<string, string[]>; // category -> entries
  material: Record<string, string[]>;
  social: Record<string, string[]>;
}

export interface WorldbuildingCategories {
  mental: string[];
  material: string[];
  social: string[];
}

export const worldbuildingCategories: WorldbuildingCategories = {
  mental: ['Culture', 'Identity', 'Beliefs', 'Ideologies', 'Language', 'Networks', 'Behavior', 'Memes'],
  material: ['Physics', 'Chemistry', 'Biology', 'Landscapes & Terrains', 'Climate'],
  social: ['Social Structure', 'Politics', 'Work', 'Technology', 'Architecture', 'Ethics', 'Transportation', 'Zoology']
};

export function createEmptyWorldbuildingRecord(): WorldbuildingRecord {
  const record: WorldbuildingRecord = {
    mental: {},
    material: {},
    social: {}
  };
  
  // Initialize all categories with empty arrays
  Object.values(worldbuildingCategories).forEach(categoryGroup => {
    categoryGroup.forEach((category: string) => {
      const group = Object.keys(worldbuildingCategories).find(key => 
        worldbuildingCategories[key as keyof WorldbuildingCategories].includes(category)
      ) as keyof WorldbuildingRecord;
      record[group][category] = [];
    });
  });
  
  return record;
}

export function updateWorldbuildingHistory(
  currentHistory: WorldbuildingRecord,
  pageCategories: string[],
  pageContent: string,
  pageTitle: string
): WorldbuildingRecord {
  const updatedHistory = JSON.parse(JSON.stringify(currentHistory)) as WorldbuildingRecord;
  
  // For each category mentioned in the page, add relevant information
  pageCategories.forEach(category => {
    const group = Object.keys(worldbuildingCategories).find(key => 
      worldbuildingCategories[key as keyof WorldbuildingCategories].includes(category)
    ) as keyof WorldbuildingRecord;
    
    if (group && updatedHistory[group][category]) {
      // Extract relevant information from the content and title
      const relevantInfo = extractRelevantInfo(category, pageContent, pageTitle);
      if (relevantInfo) {
        updatedHistory[group][category].push(relevantInfo);
      }
    }
  });
  
  return updatedHistory;
}

function extractRelevantInfo(category: string, content: string, title: string): string | null {
  // Simple extraction based on category type
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  switch (category) {
    case 'Culture':
    case 'Identity':
    case 'Beliefs':
    case 'Ideologies':
      return sentences.find(s => 
        s.toLowerCase().includes('believe') || 
        s.toLowerCase().includes('culture') || 
        s.toLowerCase().includes('tradition') ||
        s.toLowerCase().includes('custom') ||
        s.toLowerCase().includes('identity')
      )?.trim() || null;
      
    case 'Language':
      return sentences.find(s => 
        s.toLowerCase().includes('language') || 
        s.toLowerCase().includes('speak') || 
        s.toLowerCase().includes('word') ||
        s.toLowerCase().includes('dialect')
      )?.trim() || null;
      
    case 'Physics':
    case 'Chemistry':
    case 'Biology':
      return sentences.find(s => 
        s.toLowerCase().includes('physics') || 
        s.toLowerCase().includes('chemical') || 
        s.toLowerCase().includes('biological') ||
        s.toLowerCase().includes('molecular') ||
        s.toLowerCase().includes('atomic')
      )?.trim() || null;
      
    case 'Technology':
    case 'Architecture':
      return sentences.find(s => 
        s.toLowerCase().includes('technology') || 
        s.toLowerCase().includes('machine') || 
        s.toLowerCase().includes('building') ||
        s.toLowerCase().includes('structure') ||
        s.toLowerCase().includes('device')
      )?.trim() || null;
      
    case 'Politics':
    case 'Social Structure':
      return sentences.find(s => 
        s.toLowerCase().includes('government') || 
        s.toLowerCase().includes('political') || 
        s.toLowerCase().includes('society') ||
        s.toLowerCase().includes('leader') ||
        s.toLowerCase().includes('rule')
      )?.trim() || null;
      
    default:
      // For other categories, return the first substantial sentence
      return sentences[0]?.trim() || null;
  }
}

export function getWorldbuildingContext(history: WorldbuildingRecord): string {
  const contextParts: string[] = [];
  
  Object.entries(history).forEach(([group, categories]) => {
    Object.entries(categories).forEach(([category, entries]) => {
      if ((entries as string[]).length > 0) {
        contextParts.push(`${category}: ${(entries as string[]).slice(-2).join('; ')}`);
      }
    });
  });
  
  return contextParts.join('. ');
}

export function exportWorldbuildingRecord(record: WorldbuildingRecord, filename?: string): void {
  const dataStr = JSON.stringify(record, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = filename || `worldbuilding-record-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  URL.revokeObjectURL(link.href);
}

export function validateWorldbuildingRecord(data: any): data is WorldbuildingRecord {
  if (!data || typeof data !== 'object') return false;
  
  const requiredGroups = ['mental', 'material', 'social'];
  for (const group of requiredGroups) {
    if (!(group in data) || typeof data[group] !== 'object') return false;
    
    const categories = worldbuildingCategories[group as keyof WorldbuildingCategories];
    for (const category of categories) {
      if (!(category in data[group]) || !Array.isArray(data[group][category])) return false;
      
      // Validate that all entries are strings
      for (const entry of data[group][category]) {
        if (typeof entry !== 'string') return false;
      }
    }
  }
  
  return true;
}

export function importWorldbuildingRecord(file: File): Promise<WorldbuildingRecord> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (validateWorldbuildingRecord(data)) {
          resolve(data as WorldbuildingRecord);
        } else {
          reject(new Error('Invalid worldbuilding record format'));
        }
      } catch (error) {
        reject(new Error('Failed to parse JSON file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
} 