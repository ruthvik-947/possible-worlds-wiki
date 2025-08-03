// Store API keys temporarily in memory (will be cleared on server restart)
export const activeApiKeys = new Map<string, { apiKey: string; timestamp: number }>();

// Clean up old API keys every hour
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of activeApiKeys.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      activeApiKeys.delete(sessionId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

export const worldbuildingCategories = {
  mental: ['Culture', 'Identity', 'Beliefs', 'Ideologies', 'Language', 'Networks', 'Behavior', 'Memes'],
  material: ['Physics', 'Chemistry', 'Biology', 'Landscapes & Terrains', 'Climate'],
  social: ['Social Structure', 'Politics', 'Work', 'Technology', 'Architecture', 'Ethics', 'Transportation', 'Zoology']
};

export const allCategories = [...worldbuildingCategories.mental, ...worldbuildingCategories.material, ...worldbuildingCategories.social];

// Helper function to extract worldbuilding context from history
export function getWorldbuildingContext(history: any): string {
  const contextParts = [];
  
  for (const [group, categories] of Object.entries(history)) {
    for (const [category, entries] of Object.entries(categories as any)) {
      if ((entries as string[]).length > 0) {
        contextParts.push(`${category}: ${(entries as string[]).join(', ')}`);
      }
    }
  }
  
  return contextParts.join('. ');
}

export function capitalizeTitle(title: string): string {
  return title
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}