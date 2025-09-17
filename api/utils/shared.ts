// Store API keys temporarily in memory (will be cleared on server restart)
export const activeApiKeys = new Map<string, { apiKey: string; timestamp: number }>();

// Free tier limits - configurable via environment variables
export function getFreeLimit(): number {
  return parseInt(process.env.FREE_TIER_DAILY_LIMIT || '5', 10);
}

// For backwards compatibility
export const FREE_TIER_DAILY_LIMIT = getFreeLimit();

// Clean up old API keys every hour
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of activeApiKeys.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      activeApiKeys.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

// Helper function to get current date in YYYY-MM-DD format (UTC)
export function getCurrentDateString(): string {
  return new Date().toISOString().split('T')[0];
}

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
