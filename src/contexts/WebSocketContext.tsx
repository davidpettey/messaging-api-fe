'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { WebSocketMessage, WebSocketMessageType } from '@/types/messaging';
import { WebSocketService } from '@/lib/websocket/websocketService';

// Updated context type with new methods
type WebSocketContextType = {
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (conversationId: string, message: any) => void;
  sendTypingStart: (conversationId: string) => void;
  sendTypingStop: (conversationId: string) => void;
  markMessagesRead: (conversationId: string) => void;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  setUserId: (userId: string) => void;
  onMessageEvent: (event: string, handler: (data: any) => void) => void;
  onConversationEvent: (event: string, handler: (data: any) => void) => void;
  onTypingUpdate: (conversationId: string, handler: (conversationId: string, typingUsers: string[]) => void) => void;
  isConnected: boolean;
  messages: any[];
  lastMessage: any | null;
  clearMessages: () => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectionError: string | null;
};

// Create context with default values
const WebSocketContext = createContext<WebSocketContextType>({
  connect: () => {},
  disconnect: () => {},
  sendMessage: () => {},
  sendTypingStart: () => {},
  sendTypingStop: () => {},
  markMessagesRead: () => {},
  joinConversation: () => {},
  leaveConversation: () => {},
  setUserId: () => {},
  onMessageEvent: () => {},
  onConversationEvent: () => {},
  onTypingUpdate: () => {},
  isConnected: false,
  messages: [],
  lastMessage: null,
  clearMessages: () => {},
  connectionStatus: 'disconnected',
  connectionError: null,
});

// Hook for using the WebSocket context
export const useWebSocket = () => useContext(WebSocketContext);

// Provider component
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Create a WebSocketService instance
  const websocketService = useRef<WebSocketService | null>(null);
  
  // Initialize the WebSocketService
  useEffect(() => {
    if (!websocketService.current) {
      websocketService.current = new WebSocketService();
      
      // Expose the WebSocketService instance globally for direct access if needed
      if (typeof window !== 'undefined') {
        (window as any).__websocketService = websocketService.current;
      }
    }
    
    return () => {
      if (websocketService.current) {
        websocketService.current.disconnect();
        websocketService.current = null;
      }
    };
  }, []);

  const connect = useCallback((url: string) => {
    if (!websocketService.current) return;
    
    setConnectionStatus('connecting');
    
    websocketService.current.onStatusChange((status) => {
      setConnectionStatus(status);
      setIsConnected(status === 'connected');
      
      if (status === 'error') {
        setConnectionError('Connection error occurred');
      } else if (status === 'connected') {
        setConnectionError(null);
      }
    });
    
    websocketService.current.onEventLog((events) => {
      const messageEvents = events.filter(e => e.type === 'message' && e.data?.received);
      if (messageEvents.length > 0) {
        // Get the most recent message event
        const latestEvent = messageEvents[messageEvents.length - 1];
        const message = latestEvent.data?.message;
        
        if (message) {
          setMessages(prev => [...prev, message]);
          setLastMessage(message);
        }
      }
    });
    
    websocketService.current.connect(url).catch((error) => {
      setConnectionError(`Failed to connect: ${error.message}`);
      setConnectionStatus('error');
    });
  }, []);

  const disconnect = useCallback(() => {
    if (websocketService.current) {
      websocketService.current.disconnect();
    }
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  const sendMessage = useCallback((conversationId: string, message: any) => {
    if (websocketService.current) {
      websocketService.current.sendMessage(conversationId, message);
    }
  }, []);
  
  const sendTypingStart = useCallback((conversationId: string) => {
    if (websocketService.current) {
      websocketService.current.sendTypingStart(conversationId);
    }
  }, []);
  
  const sendTypingStop = useCallback((conversationId: string) => {
    if (websocketService.current) {
      websocketService.current.sendTypingStop(conversationId);
    }
  }, []);
  
  const markMessagesRead = useCallback((conversationId: string) => {
    if (websocketService.current) {
      websocketService.current.markMessagesRead(conversationId);
    }
  }, []);
  
  const joinConversation = useCallback((conversationId: string) => {
    if (websocketService.current) {
      websocketService.current.joinConversation(conversationId);
    }
  }, []);
  
  const leaveConversation = useCallback((conversationId: string) => {
    if (websocketService.current) {
      websocketService.current.leaveConversation(conversationId);
    }
  }, []);
  
  const setUserId = useCallback((userId: string) => {
    if (websocketService.current) {
      websocketService.current.setUserId(userId);
    }
  }, []);
  
  const onMessageEvent = useCallback((event: string, handler: (data: any) => void) => {
    if (websocketService.current) {
      websocketService.current.onMessageEvent(event, handler);
    }
  }, []);
  
  const onConversationEvent = useCallback((event: string, handler: (data: any) => void) => {
    if (websocketService.current) {
      websocketService.current.onConversationEvent(event, handler);
    }
  }, []);
  
  const onTypingUpdate = useCallback((conversationId: string, handler: (conversationId: string, typingUsers: string[]) => void) => {
    if (websocketService.current) {
      websocketService.current.onTypingUpdate(conversationId, handler);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        connect,
        disconnect,
        sendMessage,
        sendTypingStart,
        sendTypingStop,
        markMessagesRead,
        joinConversation,
        leaveConversation,
        setUserId,
        onMessageEvent,
        onConversationEvent,
        onTypingUpdate,
        isConnected,
        messages,
        lastMessage,
        clearMessages,
        connectionStatus,
        connectionError,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
} 