// Free tier limits - configurable via environment variables
export function getFreeLimit(): number {
  return parseInt(process.env.FREE_TIER_DAILY_LIMIT || '5', 10);
}

// For backwards compatibility
export const FREE_TIER_DAILY_LIMIT = getFreeLimit();

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
// Optimized to return only the most relevant recent context to save tokens
export function getWorldbuildingContext(history: any, maxLength: number = 500): string {
  const contextParts = [];

  for (const [group, categories] of Object.entries(history)) {
    for (const [category, entries] of Object.entries(categories as any)) {
      if ((entries as string[]).length > 0) {
        // Take only the last 3 entries from each category to keep context fresh and concise
        const recentEntries = (entries as string[]).slice(-3);
        contextParts.push(`${category}: ${recentEntries.join(', ')}`);
      }
    }
  }

  const fullContext = contextParts.join('. ');

  // Truncate if context is too long
  if (fullContext.length > maxLength) {
    return fullContext.substring(0, maxLength) + '...';
  }

  return fullContext;
}

export function capitalizeTitle(title: string): string {
  return title
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
