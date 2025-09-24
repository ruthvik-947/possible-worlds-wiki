import { config } from './config';
import type { World } from '../components/WorldModel';

export interface SharedWorldData {
  world: World;
  metadata: {
    name: string;
    description: string;
    pageCount: number;
    createdAt: string;
    viewsCount: number;
    copiesCount: number;
    isOwner: boolean;
  };
}

export interface ShareResult {
  shareId: string;
  shareSlug: string;
  shareUrl: string;
  createdAt: string;
  expiresAt?: string;
}

export async function shareWorld(
  authToken: string,
  world: World,
  expiresAt?: string
): Promise<ShareResult> {
  const response = await fetch(`${config.endpoints.worlds}/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      worldId: world.id,
      worldSnapshot: world,
      expiresAt
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to share world');
  }

  if (response.headers.get('x-streaming') === 'true') {
    // Handle streaming response
    return new Promise((resolve, reject) => {
      const reader = response.body?.getReader();
      if (!reader) {
        reject(new Error('No response reader available'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.status === 'success') {
                    resolve({
                      shareId: data.shareId,
                      shareSlug: data.shareSlug,
                      shareUrl: data.shareUrl,
                      createdAt: data.createdAt,
                      expiresAt: data.expiresAt
                    });
                    return;
                  } else if (data.status === 'error') {
                    reject(new Error(data.message || 'Failed to share world'));
                    return;
                  }
                } catch (parseError) {
                  console.error('Error parsing streaming data:', parseError);
                }
              }
            }
          }
          reject(new Error('Stream ended without success response'));
        } catch (error) {
          reject(error);
        }
      };

      processStream();
    });
  } else {
    return response.json();
  }
}

export async function getSharedWorld(shareSlug: string): Promise<SharedWorldData> {
  const response = await fetch(`${config.endpoints.shared}/${shareSlug}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 404) {
    throw new Error('Shared world not found or no longer available');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch shared world');
  }

  return response.json();
}

export async function copySharedWorld(
  authToken: string,
  shareSlug: string,
  newWorldId: string
): Promise<{ copiedWorld: World; message: string }> {
  const response = await fetch(`${config.endpoints.shared}/${shareSlug}/copy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      newWorldId
    })
  });

  if (response.status === 400) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.error === 'Already copied') {
      throw new Error('You have already copied this world');
    } else if (errorData.error === 'Cannot copy own world') {
      throw new Error('You cannot copy your own shared world');
    }
  }

  if (response.status === 404) {
    throw new Error('Shared world not found or no longer available');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to copy shared world');
  }

  return response.json();
}