import React, { useState, useEffect, useRef } from 'react';
import { PaperPlaneRight, User } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const ChatBox = ({ matchId, recipientName }) => {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [matchId]);

  // Only scroll to bottom when new messages are added (not on every fetch)
  useEffect(() => {
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    
    // Scroll only on:
    // 1. Initial load (first time messages appear)
    // 2. When a new message is added (count increased)
    if (isInitialLoadRef.current && currentCount > 0) {
      scrollToBottom();
      isInitialLoadRef.current = false;
    } else if (currentCount > prevCount && prevCount > 0) {
      // New message received or sent
      scrollToBottom();
    }
    
    prevMessageCountRef.current = currentCount;
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Format message time - shows time if today, otherwise date + time
  const formatMessageTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const fetchMessages = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/chat/${matchId}/messages`, { headers });
      setMessages(response.data);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(
        `${API}/chat/${matchId}/messages`,
        { message: newMessage },
        { headers }
      );
      setNewMessage('');
      fetchMessages();
    } catch (error) {
      toast.error('Erro ao enviar mensagem');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jungle mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="chat-box">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User size={20} />
          Chat com {recipientName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Messages Area */}
        <div className="h-80 overflow-y-auto mb-4 space-y-3 bg-muted/30 rounded-lg p-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">
              <p>Nenhuma mensagem ainda</p>
              <p className="text-sm">Inicie a conversa!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user.id;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${msg.id}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isMe
                        ? 'bg-jungle text-white'
                        : 'bg-white border border-border'
                    }`}
                  >
                    {!isMe && (
                      <p className="text-xs font-semibold mb-1">{msg.sender_name}</p>
                    )}
                    <p className="text-sm">{msg.message}</p>
                    <p className={`text-xs mt-1 ${
                      isMe ? 'text-white/70' : 'text-muted-foreground'
                    }`}>
                      {formatMessageTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1"
            data-testid="chat-input"
          />
          <Button
            type="submit"
            className="bg-jungle hover:bg-jungle-800"
            disabled={!newMessage.trim()}
            data-testid="send-message-btn"
          >
            <PaperPlaneRight size={20} />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};