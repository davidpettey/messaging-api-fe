'use client';

import { useState, useEffect } from 'react';
import { TestService } from '@/lib/api/testService';
import { UserProfile } from '@/types/messaging';
import ConversationList from '@/components/conversation/ConversationList';

export default function Home() {
  // State for bot creation
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [handle, setHandle] = useState('');
  const [bots, setBots] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing bots on component mount
  useEffect(() => {
    fetchBots();
  }, []);

  // Fetch all bots
  const fetchBots = async () => {
    setLoading(true);
    try {
      // Use the new getAllBots method to get complete bot profiles
      const botProfiles = await TestService.getAllBots();
      console.log(`Fetched ${botProfiles.length} bots`);
      setBots(botProfiles);
    } catch (err) {
      console.error('Failed to fetch bots:', err);
      setError('Failed to fetch existing bots');
    } finally {
      setLoading(false);
    }
  };

  // Create a new bot
  const createBot = async () => {
    if (!firstName || !lastName || !handle) {
      setError('Please fill all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profile = {
        firstName,
        lastName,
        handle,
        avatarUrl: `https://i.pravatar.cc/150?u=${handle}`,
      };

      const newBot = await TestService.createBot(profile);
      setBots([...bots, newBot]);
      setFirstName('');
      setLastName('');
      setHandle('');
    } catch (err) {
      setError('Failed to create bot');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Clear all bots
  const clearBots = async () => {
    setLoading(true);
    setError(null);

    try {
      await TestService.deleteAllBots();
      setBots([]);
    } catch (err) {
      setError('Failed to clear bots');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Messaging Test Interface</h1>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      {/* Bot Creation Form */}
      <div className="mb-8 p-4 border rounded-lg bg-card">
        <h2 className="text-xl mb-2">Create Bot</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="border p-2"
          />
          <input
            type="text"
            placeholder="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="border p-2"
          />
          <input
            type="text"
            placeholder="Handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="border p-2"
          />
          <button
            onClick={createBot}
            disabled={loading}
            className="bg-primary text-primary-foreground p-2 rounded"
          >
            Create
          </button>
          <button
            onClick={clearBots}
            disabled={loading}
            className="bg-destructive text-primary-foreground p-2 rounded"
          >
            Clear All Bots
          </button>
        </div>
      </div>

      {/* Bot count with refresh button */}
      <div className="mb-4 flex items-center">
        <h2 className="text-xl">Available Bots: {bots.length}</h2>
        {loading && <span className="text-sm text-muted-foreground ml-2">(Loading...)</span>}
        <button 
          onClick={fetchBots}
          disabled={loading}
          className="ml-4 p-2 bg-secondary text-secondary-foreground rounded text-sm"
          title="Refresh bot list"
        >
          Refresh
        </button>
      </div>

      {/* Conversation interfaces */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConversationList bots={bots} instanceId="instance1" />
        <ConversationList bots={bots} instanceId="instance2" />
      </div>
    </div>
  );
}