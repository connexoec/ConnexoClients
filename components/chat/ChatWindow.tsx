import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';

interface ChatWindowProps {
  chatId: string | null;
  user: any;
  onClose?: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ chatId, user, onClose }) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [profileData, setProfileData] = useState<{ plan?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Cargar el plan del usuario
  useEffect(() => {
    if (!user?.id) {
      setProfileData(null);
      return;
    }
    const fetchPlan = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', user.id)
          .single();
        if (error) throw error;
        setProfileData(data ?? { plan: 'free' });
      } catch (error) {
        console.error('ChatWindow: Error fetching profile plan:', error);
        setProfileData({ plan: 'free' });
      }
    };
    fetchPlan();
  }, [user]);

  // Suscribirse a mensajes en tiempo real via Supabase
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    setLoading(true);

    // Carga inicial de mensajes
    supabase
      .from('messages')
      .select('*')
      .eq('chatId', chatId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('Error loading messages:', error);
        setMessages(data ?? []);
        setLoading(false);
      });

    // Suscripción realtime
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chatId=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId || newMessage.trim() === '' || !user?.id) return;

    if (profileData?.plan !== 'ultra') {
      alert('La mensajería es una función del Plan ULTRA.');
      return;
    }

    setIsSending(true);
    const textToSend = newMessage;
    setNewMessage('');

    try {
      await supabase.from('messages').insert([{
        chatId,
        text: textToSend,
        senderId: user.id,
      }]);
      await supabase
        .from('chats')
        .update({ lastMessage: { text: textToSend, timestamp: new Date().toISOString() } })
        .eq('id', chatId);
    } catch (error: any) {
      console.error('Error al enviar mensaje:', error?.message || error);
      alert(`Error al enviar: ${error?.message || 'Error desconocido'}`);
      setNewMessage(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  if (!chatId) {
    return (
      <div className="flex-1 p-4 text-[var(--text-secondary)] text-center">
        Selecciona un chat para comenzar.
      </div>
    );
  }

  if (loading) {
    return <div className="flex-1 p-4 text-[var(--text-primary)]">Cargando mensajes...</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--background-dark)] text-[var(--text-primary)]">
      <div className="flex items-center justify-between p-4 border-b border-[var(--dark-orange)] bg-[var(--card-background)]">
        <h3 className="text-lg font-semibold">Chat</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={t('close_chat')}
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.senderId === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`p-3 rounded-lg max-w-xs ${isMe ? 'bg-[var(--primary-orange)] text-white' : 'bg-[var(--dark-orange)] text-[var(--text-primary)]'}`}
              >
                {msg.text}
                <div className="text-xs opacity-70 mt-1">
                  {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-VE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }) : ''}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-[var(--dark-orange)] flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 p-2 rounded bg-[var(--card-background)] border border-[var(--dark-orange)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-orange-500"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || newMessage.trim() === ''}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-white font-bold disabled:opacity-50"
        >
          {isSending ? '...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
};

export default ChatWindow;
