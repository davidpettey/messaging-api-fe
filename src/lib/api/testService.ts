import { api } from './client';
import { UserProfile } from '@/types/messaging';

// Interface for creating a test bot profile
export interface CreateBotProfileDto {
  firstName: string;
  lastName: string;
  handle: string;
  avatarUrl?: string;
  description?: string;
  details?: Record<string, any>;
}

// Test service for managing test users and bots
export class TestService {
  // Create a single test bot
  static async createBot(profile: CreateBotProfileDto): Promise<UserProfile> {
    return api.post<UserProfile>('/test/bot', profile);
  }

  // Create multiple test bots
  static async createBots(count: number, prefix = 'test-bot'): Promise<{ created: number, bots: string[] }> {
    return api.post<{ created: number, bots: string[] }>('/test/bots', { count, prefix });
  }

  // Delete all test bots
  static async deleteAllBots(): Promise<{ deleted: number }> {
    return api.delete<{ deleted: number }>('/test/bots');
  }

  // Get all test bots
  static async getAllBots(): Promise<UserProfile[]> {
    return api.get<UserProfile[]>('/test/bots/all');
  }

  // Check if test API is working
  static async ping(): Promise<{ status: string, timestamp: string }> {
    return api.get<{ status: string, timestamp: string }>('/test/ping');
  }
} 