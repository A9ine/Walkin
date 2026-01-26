import { useEffect, useState } from 'react';
import { db } from '@/database/db.service';

export function useDatabase() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function initDB() {
      try {
        await db.init();
        setIsReady(true);
      } catch (err) {
        console.error('Database initialization error:', err);
        setError(err as Error);
      }
    }

    initDB();
  }, []);

  return { isReady, error };
}
