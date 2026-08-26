import React, { useState } from 'react';
import { Button, Input, Card } from './ui';
import { useLanguage } from '../contexts/LanguageContext';

interface ContactCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndShare: (data: { name: string; email: string; phone: string }) => void;
  onSaveWithoutSharing: () => void;
  profileName?: string;
}

export const ContactCaptureModal: React.FC<ContactCaptureModalProps> = ({
  isOpen,
  onClose,
  onSaveAndShare,
  onSaveWithoutSharing,
  profileName,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const { t } = useLanguage();

  if (!isOpen) return null;

  const handleSave = () => {
    // Basic validation
    if (name.trim() && email.trim() && phone.trim()) {
      onSaveAndShare({ name, email, phone });
    } else {
        alert(t('contact_capture_validation_alert'));
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <Card className="animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
                 <h2 className="text-lg font-semibold">{t('contact_capture_title')}</h2>
                 <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                {t('contact_capture_prompt')}
            </p>
            <form className="space-y-4">
                <Input 
                    id="name" 
                    label={t('contact_capture_name_label')}
                    type="text" 
                    placeholder={t('contact_capture_name_placeholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <Input 
                    id="email" 
                    label={t('contact_capture_email_label')}
                    type="email" 
                    placeholder={t('contact_capture_email_placeholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <Input 
                    id="phone" 
                    label={t('contact_capture_phone_label')}
                    type="tel" 
                    placeholder={t('contact_capture_phone_placeholder')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
            </form>
            <div className="mt-6 flex flex-col sm:flex-row gap-2">
                <Button onClick={handleSave} className="w-full">{t('contact_capture_save_share_button')}</Button>
                <Button onClick={onSaveWithoutSharing} variant="secondary" className="w-full">{t('contact_capture_save_only_button')}</Button>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 text-center mt-4 leading-tight">
              {t('contact_capture_privacy_prefix')} {profileName || t('contact_capture_profile_owner')} {t('contact_capture_privacy_suffix')} <a href="https://www.connexo.tech/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300 transition-colors">{t('privacy_policy')}</a>.
            </p>
        </Card>
      </div>
    </div>
  );
};