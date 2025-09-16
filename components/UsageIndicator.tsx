import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import { Key, Zap, AlertTriangle } from 'lucide-react';
import { config } from '../lib/config';

interface UsageInfo {
  hasUserApiKey: boolean;
  usageCount: number;
  dailyLimit: number;
  remaining: number;
  unlimited: boolean;
}

interface UsageIndicatorProps {
  sessionId?: string;
  onUpgradeRequested?: () => void;
  usageInfo?: UsageInfo | null;
}

export function UsageIndicator({ sessionId, onUpgradeRequested, usageInfo: propUsageInfo }: UsageIndicatorProps) {
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(propUsageInfo || null);
  const [isLoading, setIsLoading] = useState(!propUsageInfo);

  const fetchUsage = async () => {
    try {
      setIsLoading(true);
      const url = sessionId 
        ? `${config.endpoints.usage}?sessionId=${sessionId}`
        : config.endpoints.usage;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setUsageInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!propUsageInfo) {
      fetchUsage();
    } else {
      setUsageInfo(propUsageInfo);
      setIsLoading(false);
    }
  }, [sessionId, propUsageInfo]);

  if (isLoading || !usageInfo) {
    return null;
  }

  if (usageInfo.unlimited) {
    return (
      <Card className="glass-panel border-glass-divider">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Key className="h-4 w-4" />
            <span className="font-medium">Unlimited Usage</span>
            <Zap className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const percentage = (usageInfo.usageCount / usageInfo.dailyLimit) * 100;
  const isNearLimit = percentage >= 80;
  const isAtLimit = usageInfo.remaining <= 0;

  return (
    <Card className={`glass-panel border-glass-divider ${isAtLimit ? 'border-red-500' : isNearLimit ? 'border-orange-500' : ''}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-glass-text font-medium">
            Free Usage Today
          </span>
          {isAtLimit && (
            <button
              onClick={onUpgradeRequested}
              className="text-xs text-blue-600 hover:text-blue-700 underline"
            >
              Add API Key
            </button>
          )}
        </div>
        
        <Progress 
          value={percentage} 
          className={`h-2 ${isAtLimit ? 'text-red-500' : isNearLimit ? 'text-orange-500' : 'text-blue-500'}`}
        />
        
        <div className="flex items-center justify-between text-xs">
          <span className={`${isAtLimit ? 'text-red-600' : 'text-glass-sidebar'}`}>
            {usageInfo.usageCount} / {usageInfo.dailyLimit} used
          </span>
          {isAtLimit ? (
            <div className="flex items-center gap-1 text-red-600">
              <AlertTriangle className="h-3 w-3" />
              <span>Limit reached</span>
            </div>
          ) : (
            <span className="text-glass-sidebar">
              {usageInfo.remaining} remaining
            </span>
          )}
        </div>
        
        {isNearLimit && !isAtLimit && (
          <div className="text-xs text-orange-600 mt-1">
            Add your API key for unlimited usage
          </div>
        )}
      </CardContent>
    </Card>
  );
}