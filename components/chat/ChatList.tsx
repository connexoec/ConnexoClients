import React, { useState, useEffect } from 'react';
import { supabase } from '../../src/lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';


interface ChatListProps {
  onSelectChat: (chatId: string) => void;
  user: any;
}

const ChatList: React.FC<ChatListProps> = ({ onSelectChat, user }) => {
  const { t } = useLanguage();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setChats([]);
      return;
    }

    setLoading(true);
    console.log("ChatList: Subscribing to chats for user:", user.id);

    const fetchChats = async () => {
        try {
            const { data, error } = await supabase
                .from('chats')
                .select('*')
                .contains('participants', [user.id]);
            
            if (error) throw error;
            
            if (data) {
                setChats(data);
            }
        } catch (error) {
            console.error("ChatList: fetch error:", error);
        } finally {
            setLoading(false);
        }
    };

    fetchChats();

    const channel = supabase.channel('public:chats')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, payload => {
            fetchChats();
        })
        .subscribe();

    return () => {
      supabase.removeChannel(channel);
      console.log("ChatList: Unsubscribed from listeners.");
    };
  }, [user]); // Re-ejecutar si cambia el usuario

  if (loading) return <div className="p-4 text-[var(--text-primary)]">{t('loading_chats')}</div>;

  return (
    <div className="w-1/3 border-r border-[var(--dark-orange)] overflow-y-auto bg-[var(--background-dark)]">
      <h2 className="p-4 text-xl font-bold text-[var(--text-primary)] border-b border-[var(--dark-orange)]">{t('chats_title')}</h2>
      {chats.length === 0 ? (
        <p className="p-4 text-[var(--text-secondary)]">{t('no_active_chats')}</p>
      ) : (
        <ul className="divide-y divide-[var(--dark-orange)]">
          {chats.map(chat => (
            <li
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className="p-3 hover:bg-[var(--dark-orange)] cursor-pointer text-[var(--text-primary)]"
            >
              <p className="font-semibold">{t('chat_with')}: {chat.userIds.find((id: string) => id !== user.id)?.substring(0, 6)}...</p>
              <p className="text-sm text-[var(--text-secondary)] truncate">{chat.lastMessage?.text || '...'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChatList;
