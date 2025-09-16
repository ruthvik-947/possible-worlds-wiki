// Store API keys temporarily in memory (will be cleared on server restart)
export const activeApiKeys = new Map<string, { apiKey: string; timestamp: number }>();

// Store usage tracking per IP address with daily reset
interface UsageData {
  count: number;
  lastResetDate: string; // YYYY-MM-DD format
}

export const dailyUsage = new Map<string, UsageData>();

// Free tier limits
export const FREE_TIER_DAILY_LIMIT = 10;

// Clean up old API keys every hour
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of activeApiKeys.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      activeApiKeys.delete(sessionId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

// Helper function to get current date in YYYY-MM-DD format (UTC)
export function getCurrentDateString(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper function to get or initialize usage for an IP
export function getUsageForIP(ip: string): UsageData {
  const currentDate = getCurrentDateString();
  const usage = dailyUsage.get(ip);
  
  if (!usage || usage.lastResetDate !== currentDate) {
    // Reset usage for new day
    const newUsage: UsageData = { count: 0, lastResetDate: currentDate };
    dailyUsage.set(ip, newUsage);
    return newUsage;
  }
  
  return usage;
}

// Helper function to increment usage for an IP
export function incrementUsageForIP(ip: string): number {
  const usage = getUsageForIP(ip);
  usage.count++;
  dailyUsage.set(ip, usage);
  return usage.count;
}

// Helper function to check if IP has exceeded free tier limit
export function hasExceededFreeLimit(ip: string): boolean {
  const usage = getUsageForIP(ip);
  return usage.count >= FREE_TIER_DAILY_LIMIT;
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